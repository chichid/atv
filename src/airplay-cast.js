const fs = require('fs');
const URL = require('url');
const http = require('follow-redirects').http;
const bonjour = require('bonjour')();
const { spawn } = require('child_process'); 
const ffmpeg = require('fluent-ffmpeg');
const AirPlay = require('airplay-protocol');
const { post, get, wait, fileExists, readFile } = require('./utils');

const MAX_PRELOAD = 2;
let cache = {};

module.exports.atvPlay = (config) => async (req, res) => {
  console.log(`[airplay-cast] /play ${req.body.videoUrl} on apple tv: ${req.body.appleTvIP}`);

  try {
    const airplay = new AirPlay(req.body.appleTvIP);
    const airplayURL = `${req.body.transcoderUrl}/url/${encodeURIComponent(req.body.videoUrl)}`;
    airplay.play(airplayURL, err => {
      if (err) {
        console.error('Unable to play on apple tv');
      }

      console.log(`Playing transcoded video from ${airplayURL}`);
      res.end(`Playing on apple tv ${req.body.videoUrl}`);
    });
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end(JSON.stringify(e));
  }
};

http.createServer((req, res) => {
  if (req.url.startsWith('/preload')) {
    preloadChunk(req, res);
  } else if (req.url.startsWith('/chunk')) {
    serveChunk(req, res);
  } else if (req.url.startsWith('/url')) {
    serveUrlPlaylist(req, res);
  } else {
    res.writeHead(404);
  }
}).listen(8666, () => {
  console.log('transcoding worker started at 8666');
});

bonjour.publish({name: 'Cool Transcoder ' + Math.random()*100000000, type: 'http', port: 8666});

bonjour.find({ type: 'http' }, service => {
  console.log('Found an HTTP server:', service)
});

const getWorkerList = async () => new Promise((resolve, reject) => {
  resolve([
    'http://192.168.2.42:8666',
    'http://192.168.2.45:8666',
  ]);
});

const serveUrlPlaylist = async (req, res) => {
  // TODO detect the movie duration here
  const duration = 10;

  cleanCache(true);

  const workerList = await getWorkerList();
  const matches = req.url.match('/url/([^/]*)');
  const url = matches[1];
  console.log(`[aircast] serveUrlPlaylist - url ${url}`);

  const playlist = [];
  playlist.push(`#EXTM3U`);
  playlist.push(`#EXT-X-PLAYLIST-TYPE:VOD`);
  playlist.push(`#EXT-X-TARGETDURATION:${duration}`);
  playlist.push(`#EXT-X-VERSION:4`);
  playlist.push(`#EXT-X-MEDIA-SEQUENCE:0`);

  const preloadLists = {};
  const workerUrl = workerList[0];

  // TODO a good optimization is if we can invoke this loadChunk on the designed worker
  // as this will trigger it's cache
  const totalDuration = await new Promise(resolve => loadChunk(decodeURIComponent(url), 0, duration, false, {
    onDurationReceived: (duration) => resolve(duration),
  }));

  let currentWorker = 0;
  for (let i = 0; i < Math.floor(totalDuration / duration); ++i) {
    const workerUrl = workerList[currentWorker];
    const chunkUrl = `${workerUrl}/chunk/${url}/${i * duration}/${duration}`;

    if (!preloadLists[workerUrl]) {
      preloadLists[workerUrl] = [chunkUrl];
    } else {
      preloadLists[workerUrl].push(chunkUrl);
    }

    playlist.push(`#EXTINF:${duration},`);
    playlist.push(chunkUrl);

    currentWorker = (currentWorker + 1) % workerList.length;
  }

  playlist.push(`#EXT-X-ENDLIST`);

  for (const workerUrl in preloadLists) {
    post(workerUrl + '/preload', preloadLists[workerUrl].join('\n'), {
      'Content-Type': 'text/plain',
    }, true);
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-mpegURL'
  });

  res.end(playlist.join('\n'))
};

const serveChunk = async (req, res) => {
  const matches = req.url.match('/chunk/([^/]*)/([^/]*)/([^/]*)');
  const url = decodeURIComponent(matches[1]);
  const start = Number(matches[2]);
  const duration = Number(matches[3]);

  const {isComplete, stream, data, cancel} = loadChunk(url, start, duration, true);

  res.writeHead(200, {
    'Content-Type': 'video/MP2T',
  });

  if (!isComplete) {
    console.log(`[aircast] [streaming] serveChunk streaming chunk ${url} / ${start} / ${duration}`);
    stream.pipe(res, { end: true });
  } else {
    console.log(`[aircast] serveChunk serving chunk from cache ${url} / ${start} / ${duration}`);
    res.end(data);
  }

  preloadNextChunks(url, start);

  req.on('close', () => cancel());
};

const preloadChunk = (req, res) => {
  let body = [];

  req.on('data', d => (body += d.toString()));

  req.on('end', () => {
    const lines = body.split('\n');

    cache.preloadQueue = [];

    for (const line of lines) {
      const matches = line.match('/chunk/([^/]*)/([^/]*)/([^/]*)');
      const url = decodeURIComponent(matches[1]);
      const start = Number(matches[2]);
      const duration = Number(matches[3]);

      cache.preloadQueue.push({url, start, duration});

      res.writeHead(200);
      res.end(`preloading ${url} / ${start} / ${duration}`);
    }
  });
};

const preloadNextChunks = (url, start, duration) => {
  if (cache.preloadQueue) {
    for (let i = 0 ; i < cache.preloadQueue.length; ++i) {
      const chunk = cache.preloadQueue[i];

      if (chunk.url === url && chunk.start > start) {
        for (let j = 0; j < MAX_PRELOAD && i + j < cache.preloadQueue.length; ++j) {
          const {url, start, duration} = cache.preloadQueue[i + j];
          console.log(`[aircast] Preloading chunk ${url} ${start} ${duration}`);
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
  console.log(`[aircast] cleaning the cache, clearAll: ${clearAll}`);
  
  if (clearAll) {
    cache = {};
  } else {
    // TODO clean the cache in a smart way
  }
};

const loadChunk = (url, start, duration, isServing, options) => {
  const cacheKey = getKey(url, start, duration);

  if (cache[cacheKey]) {
    console.log(`[aircast] loadChunk cache returns ${url} / ${start} / ${duration}`);
    return cache[cacheKey];
  }

  console.log(`[aircast] loadChunk transcoding ${url} / ${start} / ${duration} / ${isServing}`);

  cleanCache();

  const child = spawn('ffmpeg', [
    '-ss', start,
    '-t', duration,
    '-i', url,

    '-y',
    '-strict', 'experimental',
    '-preset', 'ultrafast',
    '-profile:v', 'baseline',
    '-level', '3.0',
    '-vcodec', 'libx264',
    '-s', '1280x720',
    '-acodec', 'aac',
    '-ac', '6',
    '-ab', '640k',
    '-crf', '14',
    '-avoid_negative_ts', '1',
    '-maxrate', '25M',
    '-bufsize', '10M', 
    '-copyinkf',
    '-copyts',
    '-r', 24,
    '-pix_fmt', 'yuv420p',
    '-map_metadata', -1,
    '-f', 'mpegts',

    '-hide_banner',

    'pipe:1'
  ].filter(op => op !== null ? true : false));

  cache[cacheKey] = {
    creationTime: Date.now(),
    isComplete: false,
    stream: child.stdout,
    data: null,
    cancel: () => child.kill(),
  };

  let chunks = [];

  child.stdout.on('data', chunk => {
    chunks.push(chunk);
  });

  child.stderr.on('data', (chunk) => {
    // console.error('[ffmpeg] ' + chunk.toString())
    const line = chunk.toString().toLowerCase();
    const matches = /duration: (\d\d):(\d\d):(\d\d).(\d\d)/gm.exec(line);
    if (matches) {
      const hours = Number(matches[1]);
      const minutes = Number(matches[2]);
      const seconds = Number(matches[3]);
      const milliseconds = Number(matches[4]);

      if (options && options.onDurationReceived) {
        const durationSecs = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000.0;
        console.log("Duration " + durationSecs);
        options.onDurationReceived(durationSecs);
      }
    }
  });

  child.on('exit', code => {
    if (code !== 0) {
      console.error(`[ffmpeg] error transcoding chunk ${url} / ${start} / ${duration}`);
      delete cache[cacheKey];
    } else if (cache[cacheKey]) {
      cache[cacheKey].isComplete = true;
      cache[cacheKey].data = Buffer.concat(chunks);
    }
  });

  return cache[cacheKey];
};

