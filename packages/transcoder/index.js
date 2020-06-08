const fs = require('fs');
const URL = require('url');
const http = require('follow-redirects').http;
const { spawn } = require('child_process'); 
const { post, get, wait, fileExists, readFile } = require('common/utils');
const { CONFIG } = require('common/config');
const { startDiscoveryService, getWorkerList } = require('./discovery');

(() => {
  http.createServer((req, res) => {
    if (req.url.startsWith('/proxy')) {
      proxyVideo(req, res);
    } else if (req.url.startsWith('/chunk')) {
      serveChunk(req, res);
    } else {
      res.writeHead(404);
      res.end('resource not found');
    }
  }).listen(CONFIG.Transcoder.Port, () => {
    console.log(`transcoding worker started at ${CONFIG.Transcoder.Port}`);

    if (CONFIG.Transcoder.EnableDiscovery) {
      startDiscoveryService();
    }
  });
})();

const proxyVideo = async (req, res) => {
  const playlist = [];
  const matches = req.url.match('/proxy/([^/]*)');
  const url = decodeURIComponent(matches[1]);
  const duration = 10;

  let videoInfo;

  if (!getVideoInfo(url)) {
    try {
      videoInfo = await loadVideoInfo(url);
    } catch(e) {
      console.error(`[transcoder] proxyVideo - exception in loadVideoInfo`);
    }
  }

  console.log(`[transcoder] proxyVideo - url ${url}`);

  playlist.push(`#EXTM3U`);
  playlist.push(`#EXT-X-VERSION:4`);
  playlist.push(`#EXT-X-ALLOW-CACHE:YES`);
  playlist.push(`#EXT-X-MEDIA-SEQUENCE:0`);

  if (videoInfo && videoInfo.totalDuration) {
    console.log(`[transcoder] proxyVideo - totalDuration: ${videoInfo.totalDuration}, url ${url}`);

    playlist.push(`#EXT-X-TARGETDURATION:${duration}`);

    let start = 0;
    while (start < videoInfo.totalDuration) {
      const chunkDuration = Math.min(videoInfo.totalDuration - start, duration);
      playlist.push(`#EXTINF:${chunkDuration},`);
      playlist.push(`/chunk/${encodeURIComponent(url)}/${start}/${chunkDuration}`);
      start += chunkDuration;
    }

    playlist.push(`#EXT-X-ENDLIST`);
  } else { 
    console.log(`[transcoder] proxyVideo - totalDuration is NaN, url ${url}`);

    playlist.push(`#EXT-X-TARGETDURATION:${1}`);
    playlist.push(`#EXTINF:${1},`);
    playlist.push(`/chunk/${encodeURIComponent(url)}/0/0`);

    playlist.push(`#EXT-X-ENDLIST`);
  } 

  res.writeHead(200, {
    'Content-Type': 'application/x-mpegURL',
  });

  res.end(playlist.join('\n'));
};

const serveChunk = async (req, res) => {
  const matches = req.url.match('/chunk/([^/]*)/([^/]*)/([^/]*)');
  const url = decodeURIComponent(matches[1]);
  const start = Number(matches[2]);
  const duration = Number(matches[3]);

  const { stream, cancel } = await loadChunk(url, start, duration);

  res.writeHead(200, {
    'Content-Type': 'video/MP2T',
  });

  console.log(`[transcoder] serve - streaming content of chunk ${start} - ${duration}`);
  stream.pipe(res, { end: true });

  req.on('close', () => {
    console.log(`[transcoder] serve - client dropped`);
    cancel();
  });
};

const parseCookies = async (req, res) => {
  const list = {};
  const rc = req.headers.cookie;
  rc && rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  }); 
  return list;
};

const loadChunk = async (url, start, duration) => {
  const ffmpeg = CONFIG.Transcoder.FFMpegPath || 'ffmpeg';

  const options = [
    start ? '-ss' : null, start ? start : null,
    duration ? '-t' : null , duration ? duration : null,
    '-i', url,

    '-y',
    '-strict', 'experimental',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-profile:v', 'baseline',
    '-level', '3.0',
    '-vcodec', 'h264',
    '-acodec', 'aac',
    '-ac', '6',
    '-ab', '640k',
    '-crf', '14',
    '-max_muxing_queue_size', '1024',
    '-copyts',
    '-r', 24,
    '-pix_fmt', 'yuv420p',
    '-map_metadata', -1,
    '-f', 'mpegts',

    '-hide_banner',

    'pipe:1'
  ].filter(op => op !== null ? true : false);

  const child = spawn(ffmpeg, options);

  child.stderr.on('data', data => {
    //const used = process.memoryUsage().heapUsed / 1024 / 1024;
    //console.log(`[transcoder] memory use ${Math.round(used * 100) / 100} MB`);
    //console.log('[ffmpeg] ' + data.toString())
  });

  child.on('exit', code => {
    if (code !== 0) {
      console.error(`[ffmpeg] error transcoding  ${url} / ${start} / ${duration}`);
    } 
  });

  return { 
    stream: child.stdout,
    cancel: () => child.kill('SIGINT'),
  };
};

const cache = {};

const loadVideoInfo = (url, noCache) => new Promise((resolve, reject) => {
  if (!noCache && cache[url]) {
    resolve(cache[url]);
    return;
  }

  const ffprobe = CONFIG.Transcoder.FFProbePath || 'ffprobe';
  const options = ['-i', url, '-hide_banner', '-loglevel', 'fatal', '-show_error', '-show_format', '-show_streams', '-show_programs', '-show_chapters', '-show_private_data', '-print_format', 'json']
  const child = spawn(module.exports.FFPROBE_PATH || 'ffprobe', options);

  console.log(`[transcoder] ffprobe ${options.join(' ')}`);

  let output = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stderr.on('data', chunk => {
    console.log(chunk.toString());
  });

  child.stdout.on('data', chunk => {
    output += chunk.toString();
  });

  child.on('error', err => {
    console.log(`[transcoder] ffprobe error, url ${url}`);
    console.error(err);
    reject(err);
  });

  child.on('close', () => {
    const parsedOutput = JSON.parse(output);
    cache[url] = {
      totalDuration: Number(parsedOutput.format.duration),
    };
    console.log(`[transcoder] ffprobe successful, url ${url}`);
    resolve(cache[url]);
  });
});
