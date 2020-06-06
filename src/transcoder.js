const fs = require('fs');
const URL = require('url');
const http = require('follow-redirects').http;
const { spawn } = require('child_process'); 
const rimraf = require('rimraf');
const { post, get, wait, openFile, writeFile, fileExists, readFile } = require('./utils');
const { CONFIG } = require('./config');
const { startDiscoveryService, getWorkerList } = require('./discovery');

let workQueue = null;

(() => {
  http.createServer((req, res) => {
    if (req.url.startsWith('/workQueue')) {
      setWorkQueue(req, res);
    } else if (req.url.startsWith('/chunk')) {
      serveChunk(req, res);
    } else if (req.url.startsWith('/url')) {
      serveUrlPlaylist(req, res);
    } else {
      res.writeHead(404);
    }
  }).listen(CONFIG.Transcoder.Port, () => {
    console.log(`transcoding worker started at ${CONFIG.Transcoder.Port}`);
    startDiscoveryService();
  });
})();

const serveUrlPlaylist = async (req, res) => {
  const matches = req.url.match('/url/([^/]*)');
  const url = matches[1];
  const decodedURL = decodeURIComponent(url);

  await cleanTmpDir(true);

  let playlist = [];
  if (decodedURL.endsWith('.ts')) {
    playlist = await getWrappedPlaylist(url);
  } else {
    playlist = await getTranscodedPlaylist(url);
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-mpegURL'
  });

  res.end(playlist.join('\n'))
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

  const { totalDuration } = await getMovieInfo(url);

  const playlist = [];

  playlist.push(`#EXTM3U`);
  playlist.push(`#EXT-X-TARGETDURATION:${duration}`);
  playlist.push(`#EXT-X-VERSION:3`);
  playlist.push(`#EXT-X-ALLOW-CACHE:YES`);
  playlist.push(`#EXT-X-MEDIA-SEQUENCE:0`);

  const workQueue = {};
  const workerList = await getWorkerList();
  let currentWorker = 0;

  for (let i = 0; i < Math.floor(totalDuration / duration); ++i) {
    const workerUrl = workerList[currentWorker];
    const chunkUrl = `${workerUrl}/chunk/${url}/${i * duration}/${duration}`;

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

  for (const workerUrl in workQueue) {
    post(workerUrl + '/workQueue', workQueue[workerUrl].join('\n'), {
      'Content-Type': 'text/plain',
    }, true);
  }

  return playlist;
}

const serveChunk = async (req, res) => {
  const matches = req.url.match('/chunk/([^/]*)/([^/]*)/([^/]*)');
  const url = decodeURIComponent(matches[1]);
  const start = Number(matches[2]);
  const duration = Number(matches[3]);

  const { outputFile, lockFile } = getOutputFile(url, start, duration);

  console.log(`[transcoder] serveChunk streaming chunk ${url} / ${start} / ${duration}`);
  
  if (!await fileExists(outputFile)) {
    console.log(`[transcoder] serveChunk will load the file`);
    await loadChunk(url, start, duration, true);
  }

  console.log(`[transcoder] serving the file...`);
  serveFile(outputFile, lockFile, req, res);

  console.log(`[transcoder] preloading next chunks...`);
  preloadNextChunks(url, start);
};

const serveFile = async (file, lockFile, req, res) => {
  let streamed = 0;
  let isClosed = false;
  
  res.writeHead(200, {
    'Content-Type': 'video/MP2T',
  });

  console.log(`[transcoder] serveFile streaming ${file}`);

  if (!await fileExists(lockFile)) {
    console.log(`[transcoder] piping ${file}...`);
    fs.createReadStream(file).pipe(res);
    return;
  }

  console.log(`[transcoder] transcoding is not finished for ${file}, poll piping it...`);

  const poll = async () => {
    const fd = await openFile(file, 'r');
    const stream = fs.createReadStream(null, {
      fd,
      start: streamed
    });

    stream.on('data', chunk => {
      if (!isClosed) {
        res.write(chunk)
        streamed += chunk.length;
      }
    });

    stream.on('end', async () => {
      if (!isClosed && await fileExists(lockFile)) {
        setTimeout(() => poll(), 200);
      } else {
        console.log(`[transcoder] serveFile done streaming ${file}, streamed: ${streamed}`);
        res.end();
      }
    });
  };

  req.on('close', () => {
    isClosed = true;
  });

  poll();
};

const setWorkQueue = (req, res) => {
  let body = [];

  req.on('data', d => (body += d.toString()));

  req.on('end', () => {
    const lines = body.split('\n');

    workQueue = [];

    for (const line of lines) {
      const matches = line.match('/chunk/([^/]*)/([^/]*)/([^/]*)');
      const url = decodeURIComponent(matches[1]);
      const start = Number(matches[2]);
      const duration = Number(matches[3]);

      workQueue.push({url, start, duration});
    }

    if (workQueue && workQueue.length > 0) {
      const { url, start, duration } = workQueue[0];
      preloadNextChunks(url, start + duration - 1, duration);
    }

    res.writeHead(200);
    res.end(`work queued`);
  });
};

const preloadNextChunks = (url, start, duration) => {
  if (workQueue) {
    for (let i = 0 ; i < workQueue.length; ++i) {
      const chunk = workQueue[i];

      if (chunk.url === url && chunk.start > start) {
        for (let j = 0; j < CONFIG.Transcoder.WorkQueueLimit && i + j < workQueue.length; ++j) {
          const {url, start, duration} = workQueue[i + j];
          console.log(`[transcoder] preloading chunk ${url} ${start} ${duration}`);
          loadChunk(url, start, duration);
        }

        break;
      }
    }
  }
};

const cleanTmpDir = async (clearAll) => new Promise((resolve) => {
  console.log(`[transcoder] cleaning the tmp dir, clearAll: ${clearAll}`);
  
  if (clearAll) {
    rimraf(CONFIG.Transcoder.TmpDir, () => resolve());
  } else {
    // TODO clean the cache in a smart way
    resolve();
  }
});

const getOutputFile = (url, start, duration) => {
  const baseDir = `${CONFIG.Transcoder.TmpDir}/${encodeURIComponent(url)}`;

  return {
    baseDir,
    outputFile: `${baseDir}/${start}__${duration}`,
    lockFile: `${baseDir}/${start}__${duration}.lock`,
  }
};

const loadChunk = async (url, start, duration) => {
  console.log(`[transcoder] loadChunk is transcoding ${url} / ${start} / ${duration}`);

  const { baseDir, outputFile, lockFile } = getOutputFile(url, start, duration);

  if (!await fileExists(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  await writeFile(lockFile);

  const child = spawn('ffmpeg', [
    '-ss', start,
    '-t', duration,
    '-i', url,

    '-y',
    '-strict', 'experimental',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    //'-profile:v', 'baseline',
    //'-level', '3.0',
    '-vcodec', 'libx264',
    '-s', '1280x720',
    '-acodec', 'aac',
    '-ac', '6',
    '-ab', '640k',
    '-crf', '14',
    //'-avoid_negative_ts', '1',
    //'-maxrate', '25M',
    //'-bufsize', '10M', 
    //'-copyinkf',
    '-copyts',
    //'-start_at_zero',
    '-r', 24,
    '-pix_fmt', 'yuv420p',
    '-map_metadata', -1,
    '-f', 'mpegts',

    '-hide_banner',

    outputFile,
  ].filter(op => op !== null ? true : false));

  //child.stderr.on('data', (chunk) => {
    // TODO only output this when logging is set to debug 
    //console.error('[ffmpeg] ' + chunk.toString())
  //});

  let didExit = false;
  
  child.on('exit', code => {
    if (code !== 0) {
      console.error(`[ffmpeg] error transcoding chunk ${url} / ${start} / ${duration}`);
    } else {
      console.log(`[transcoder] loadChunk is done transcoding ${url} / ${start} / ${duration}`);
    }

    fs.unlink(lockFile, () => {});
    didExit = true;
  });

  do {
    await wait(200);
  } while(!didExit && !await fileExists(outputFile))
};

const getMovieInfo = async (url) => {
  // TODO implement
  const totalDuration = 3600 * 4;

  const info = {
    totalDuration,
  };

  console.log(`[transcoder] getMovieInfo - movieInfo ${JSON.stringify(info)}`);
  return info;
};
