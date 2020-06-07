const fs = require('fs');
const URL = require('url');
const http = require('follow-redirects').http;
const { spawn } = require('child_process'); 
const { post, get, wait, fileExists, readFile } = require('common/utils');
const { CONFIG } = require('common/config');
const { startDiscoveryService, getWorkerList } = require('./discovery');

let cache = {};

(() => {
  http.createServer((req, res) => {
    if (req.url.startsWith('/chunk')) {
      serveChunk(req, res);
    } else if (req.url.startsWith('/proxy')) {
      proxyVideo(req, res);
    } else if (req.url.startsWith('/live')) {
      proxyLiveStream(req, res);
    } else if (req.url.startsWith('/vod')) {
      proxyVodStream(req, res);
    } else {
      res.writeHead(404);
    }
  }).listen(CONFIG.Transcoder.Port, () => {
    console.log(`transcoding worker started at ${CONFIG.Transcoder.Port}`);

    if (CONFIG.Transcoder.EnableDiscovery) {
      startDiscoveryService();
    }
  });
})();

const proxyLiveStream = async (req, res) => {
  const matches = req.url.match('/live/([^/]*)');
  const url = matches[1];
  const decodedURL = decodeURIComponent(url);

  cleanCache(true);

  // TODO here we could check if we need to transcode the live stream
  const playlist = await getWrappedPlaylist(url);

  res.writeHead(200, {
    'Content-Type': 'application/x-mpegURL'
  });

  res.end(playlist.join('\n'))
};

const proxyVodStream = async (req, res) => {
  const matches = req.url.match('/vod/([^/]*)');
  const url = matches[1];
  const decodedURL = decodeURIComponent(url);

  cleanCache(true);

  const playlist = await getTranscodedPlaylist(url);

  res.writeHead(200, {
    'Content-Type': 'application/x-mpegURL'
  });

  res.end(playlist.join('\n'))
};

const proxyVideo = async (req, res) => {
  const playlist = [];
  const matches = req.url.match('/proxy/([^/]*)');
  const url = matches[1];
  const duration = CONFIG.Transcoder.ChunkDuration;

  console.log(`[transcoder] proxyVideo - url ${url}`);

  playlist.push(`#EXTM3U`);
  playlist.push(`#EXT-X-TARGETDURATION:${duration}`);
  playlist.push(`#EXT-X-VERSION:3`);
  playlist.push(`#EXT-X-ALLOW-CACHE:YES`);
  playlist.push(`#EXT-X-MEDIA-SEQUENCE:0`);

  playlist.push(`#EXTINF:${duration},`);
  playlist.push(`/chunk/${url}/0/0`);

  playlist.push(`#EXT-X-ENDLIST`);

  res.writeHead(200, {
    'Content-Type': 'application/x-mpegURL'
  });

  res.end(playlist.join('\n'));
};

const getWrappedPlaylist = async (url) => {
  const playlist = [];
  const decodedURL = decodeURIComponent(url);
  const duration = CONFIG.Transcoder.ChunkDuration;

  console.log(`[transcoder] getWrappedPlaylist - url ${decodedURL}`);

  playlist.push(`#EXTM3U`);
  playlist.push(`#EXT-X-PLAYLIST-TYPE:EVENT`);
  playlist.push(`#EXT-X-TARGETDURATION:${duration}`);
  playlist.push(`#EXT-X-VERSION:3`);
  playlist.push(`#EXT-X-ALLOW-CACHE:YES`);
  playlist.push(`#EXT-X-MEDIA-SEQUENCE:0`);

  playlist.push(`#EXTINF:${duration},`);
  playlist.push(decodedURL);

  return playlist;
};

const getTranscodedPlaylist = async (url) => {
  const duration = CONFIG.Transcoder.ChunkDuration;
  const decodedURL = decodeURIComponent(url);
  console.log(`[transcoder] getTranscodedPlaylist - getting movie duration for ${decodedURL}`);

  // TODO a good optimization is if we can invoke this loadChunk on the designed worker
  // as this will trigger it's cache
  const totalDuration = await new Promise(resolve => loadChunk(decodeURIComponent(url), 0, 1, false, {
    onDurationReceived: (duration) => resolve(duration),
  }));
  
  console.log(`[transcoder] proxyLiveStream - movie duration is ${totalDuration} for ${url}`);

  const playlist = [];

  playlist.push(`#EXTM3U`);
  playlist.push(`#EXT-X-TARGETDURATION:${duration}`);
  playlist.push(`#EXT-X-VERSION:3`);
  playlist.push(`#EXT-X-ALLOW-CACHE:YES`);
  playlist.push(`#EXT-X-MEDIA-SEQUENCE:0`);

  const workQueue = {};
  const workerList = [];//await getWorkerList();
  let currentWorker = 0;

  for (let i = 0; i < Math.floor(totalDuration / duration); ++i) {
    const workerUrl = workerList[currentWorker];
    const chunkUrl = `${workerUrl || ''}/chunk/${url}/${i * duration}/${duration}`;

    if (!workQueue[workerUrl]) {
      workQueue[workerUrl] = [chunkUrl];
    } else {
      workQueue[workerUrl].push(chunkUrl);
    }

    playlist.push(`#EXTINF:${duration},`);
    playlist.push(chunkUrl);

    currentWorker = (currentWorker + 1) % workerList.length;
  }

  playlist.push(`#EXT-X-ENDLIST`);

  if (workerList.length > 1) {
    for (const workerUrl in workQueue) {
      post(workerUrl + '/workQueue', workQueue[workerUrl].join('\n'), {
        'Content-Type': 'text/plain',
      }, true);
    }
  }

  return playlist;
}

const serveChunk = async (req, res) => {
  const matches = req.url.match('/chunk/([^/]*)/([^/]*)/([^/]*)');
  const url = decodeURIComponent(matches[1]);
  const start = Number(matches[2]);
  const duration = Number(matches[3]);

  const {isComplete, stream, data, cancel, clean} = loadChunk(url, start, duration, true);

  res.writeHead(200, {
    'Content-Type': 'video/MP2T',
    'Connection': 'keep-alive',
  });

  if (!isComplete) {
    console.log(`[transcoder] [streaming] serveChunk streaming chunk ${url} / ${start} / ${duration}`);
    stream.pipe(res, { end: true });
    clean();
  } else {
    console.log(`[transcoder] serveChunk serving chunk from cache ${url} / ${start} / ${duration}`);
    res.end(data);
    clean();
  }

  if (start && duration) {
    preloadWorkQueueNextChunks(url, start);
  }

  req.on('close', () => {
    console.log(`[transcoder] serveChunk - client dropped`);
    cancel();
  });
};

const setWorkQueue = (req, res) => {
  let body = [];

  req.on('data', d => (body += d.toString()));

  req.on('end', () => {
    const lines = body.split('\n');

    cache.workQueue = [];

    for (const line of lines) {
      const matches = line.match('/chunk/([^/]*)/([^/]*)/([^/]*)');
      const url = decodeURIComponent(matches[1]);
      const start = Number(matches[2]);
      const duration = Number(matches[3]);

      cache.workQueue.push({url, start, duration});
    }

    if (cache.workQueue && cache.workQueue.length > 0) {
      const { url, start, duration } = cache.workQueue[0];
      preloadWorkQueueNextChunks(url, start - 1, duration);
    }

    res.writeHead(200);
    res.end(`work queued`);
  }); 
};

const preloadWorkQueueNextChunks = (url, start, duration) => {
  if (cache.workQueue) {
    for (let i = 0 ; i < cache.workQueue.length; ++i) {
      const chunk = cache.workQueue[i];

      if (chunk.url === url && chunk.start > start) {
        for (let j = 0; j < CONFIG.Transcoder.WorkQueueLimit && i + j < cache.workQueue.length; ++j) {
          const {url, start, duration} = cache.workQueue[i + j];
          console.log(`[transcoder] preloading chunk ${url} ${start} ${duration}`);
          loadChunk(url, start, duration);
        }

        break;
      }
    }
  }
};

const getKey = (url, start, duration) => {
  return url + start + duration;
};

const cleanCache = (clearAll) => {
  console.log(`[transcoder] cleaning the cache, clearAll: ${clearAll}`);
  
  if (clearAll) {
    cache = {};
  } else {
    // TODO clean the cache in a smart way
  }
};

const loadChunk = (url, start, duration, isServing, options) => {
  const cacheKey = getKey(url, start, duration);

  if (cache[cacheKey]) {
    console.log(`[transcoder] loadChunk from cache ${url} / ${start} / ${duration}`);
    return cache[cacheKey];
  }

  console.log(`[transcoder] loadChunk transcoding ${url} / ${start} / ${duration}`);

  cleanCache();

  if (!(start && duration)) {
    console.log(`[transcoder] killing previous processes...`);
    for (const key of Object.keys(cache)) {
      cache[key].cancel();
    }
  }

  const ffmpeg = CONFIG.Transcoder.FFMpegPath || 'ffmpeg';

  const child = spawn(ffmpeg, [
    start ? '-ss' : null, start ? start : null,
    duration ? '-t' : null , duration ? duration : null,
    '-i', url,

    '-y',
    '-strict', 'experimental',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-profile:v', 'baseline',
    '-level', '3.0',
    '-vcodec', 'libx264',
    '-acodec', 'aac',
    '-ac', '6',
    '-ab', '640k',
    '-max_muxing_queue_size', 1024,
    '-crf', '14',
    //'-avoid_negative_ts', '1',
    '-maxrate', '25M',
    '-bufsize', '10M', 
    //'-copyinkf',
    '-copyts',
    '-r', 24,
    '-pix_fmt', 'yuv420p',
    //'-map_metadata', -1,
    '-f', 'mpegts',

    '-hide_banner',

    'pipe:1'
  ].filter(op => op !== null ? true : false));

  cache[cacheKey] = {
    creationTime: Date.now(),
    isComplete: false,
    stream: child.stdout,
    data: null,
    cancel: () => child.kill('SIGINT'),
    clean: () => {
      console.log(`[transcoder] cleaning ${cacheKey}`);
      delete cache[cacheKey];
    }
  };

  //let chunks = [];

  //child.stdout.on('data', chunk => {
  //  chunks.push(chunk);
  //});

  child.stderr.on('data', (chunk) => {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(`[transcoder] memory use ${Math.round(used * 100) / 100} MB, Processes: ${Object.keys(cache).length}`);
    console.log('[ffmpeg] ' + chunk.toString())
    //const line = chunk.toString().toLowerCase();

    //const durationMatches = /duration: (\d\d):(\d\d):(\d\d).(\d\d)/gm.exec(line);
    //if (durationMatches && options && options.onDurationReceived) {
    //  const hours = Number(durationMatches[1]);
    //  const minutes = Number(durationMatches[2]);
    //  const seconds = Number(durationMatches[3]);
    //  const milliseconds = Number(durationMatches[4]);
    //  const durationSecs = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000.0;

    //  options.onDurationReceived(durationSecs);
    //}

    //const infoMatches = /fps=(.*) q=.*size=(.*)time=(.*) bitrate=/gm.exec(line);
    //if (infoMatches) {
    //  const info = {
    //    fps: infoMatches[1],
    //    size: infoMatches[2],
    //    time: infoMatches[3],
    //  };

    //  process.stdout.write(`[transcoder] ${JSON.stringify(info)}\r`);

    //  if (options && options.onInfo) {
    //    options.onInfo(info);
    //  }
    //}
  });

  child.on('exit', code => {
    if (code !== 0) {
      console.error(`[ffmpeg] error transcoding chunk ${url} / ${start} / ${duration}`);
      delete cache[cacheKey];
    } else if (cache[cacheKey]) {
      //cache[cacheKey].isComplete = true;
      //cache[cacheKey].data = Buffer.concat(chunks);
    }
  });

  return cache[cacheKey];
};

