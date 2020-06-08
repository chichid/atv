const fs = require('fs');
const URL = require('url');
const { http, https } = require('follow-redirects');
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
    console.log(`[transcoder] transcoding worker started at ${CONFIG.Transcoder.Port}`);

    if (CONFIG.Transcoder.EnableDiscovery) {
      startDiscoveryService();
    }

    startTranscoderProxy();
  });
})();

const startTranscoderProxy = () => {
  const proxyOptions = {
    host: CONFIG.Transcoder.RemoteProxyHost,
    port: CONFIG.Transcoder.RemoteProxyPort,
    credentials: 'Basic ' + Buffer.from(CONFIG.Transcoder.RemoteProxyUser + ':' + CONFIG.Transcoder.RemoteProxyPass).toString('base64'),
  };

  const nodeHttp = require('http');

  http.createServer((req, res) => {
    console.log(`[transcoder] transcoderProxy - proxying request ${req.url}`);
    const url = URL.parse(req.url);

    const options = {
      host: proxyOptions.host,
      port: proxyOptions.port,
      path: req.url,
      headers: {
        ...req.headers,
        'Proxy-Authorization': proxyOptions.credentials,
        'Host': url.hostname,
      },
    };

    nodeHttp.get(options, proxyRes => {
      console.log(`[transcoder] proxy responded by ${proxyRes.statusCode}, ${req.url}`);
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
  }).listen(CONFIG.Transcoder.ProxyPort, () => {
    console.log(`[transcoder] transcoder proxy started at ${CONFIG.Transcoder.ProxyPort}, options:`);
    console.log(proxyOptions);
  });
};

const proxyVideo = async (req, res) => {
  const playlist = [];
  const matches = req.url.match('/proxy/([^/]*)');
  const url = decodeURIComponent(matches[1]);
  const duration = 10;

  const videoInfo = await loadVideoInfo(url);

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

    playlist.push(`#EXT-X-TARGETDURATION:${60}`);
    playlist.push(`#EXTINF:${1},`);
    playlist.push(`/chunk/${encodeURIComponent(url)}/0/0`);

    playlist.push(`#EXTINF:${60},`);
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
    '-http_proxy', `http://localhost:${CONFIG.Transcoder.ProxyPort}`,
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
  const options = [
    '-http_proxy', `http://localhost:${CONFIG.Transcoder.ProxyPort}`,
    '-i', url, 
    '-hide_banner', '-loglevel', 'fatal', '-show_error', '-show_format', 
    '-show_streams', '-show_programs', '-show_chapters', '-show_private_data', 
    '-print_format', 'json'
  ];
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
    let totalDuration = null;

    try {
      const parsedOutput = JSON.parse(output);
      totalDuration = Number(parsedOutput.format.duration);
      console.log(`[transcoder] ffprobe successful, url ${url}`);
    } catch(e) {
      console.log(`[transcoder] ffprobe failed to parse output, url ${url}`);
    }

    cache[url] = {
      totalDuration
    };

    resolve(cache[url]);
  });
});
