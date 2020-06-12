const fs = require('fs');
const URL = require('url');
const { http, https } = require('follow-redirects');
const { spawn } = require('child_process'); 
const { post, get, wait, fileExists, readFile } = require('common/utils');
const { CONFIG } = require('common/config');
const { startDiscoveryService, getWorkerList } = require('./discovery');

const cache = {};

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
  const videoInfo = cache[url];

  if (typeof videoInfo === 'undefined') {
    await loadVideoInfo(url);
  }

  const isVod = videoInfo && videoInfo.totalDuration;
  const isLive = videoInfo && isNaN(videoInfo.totalDuration);
  const headers = req.headers;
  const userAgent = headers['user-agent'] || '';
  const isVlc = userAgent.toLowerCase().indexOf('vlc') !== -1;
  const isAppleTv = userAgent.toLowerCase().indexOf('apple tv') !== -1;
  const sessionId = headers['x-playback-session-id'];

  let delayResponse = false;

  if (isAppleTv) {

    if (!cache.playbackSessions) {
      cache.playbackSessions = { };
    }

    if(!cache.playbackSessions[sessionId]) {
      cache.playbackSessions[sessionId] = {
        ...req.headers,
        counter: 0,
        timestamp: Date.now(),
      };
    } else {
      cache.playbackSessions[sessionId].counter++;
    }
  }

  console.log(`[transcoder] proxyVideo - url ${url}, user-agent: ${userAgent}`);

  playlist.push(`#EXTM3U`);
  playlist.push(`#EXT-X-VERSION:4`);

  if (isVod) {
    const duration = 10;
    console.log(`[transcoder] proxyVideo - totalDuration: ${videoInfo.totalDuration}, url ${url}`);

    playlist.push(`#EXT-X-MEDIA-SEQUENCE:1`);
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

    const initialDuration = Number(CONFIG.Transcoder.InitialChunkDuration);
    const duration = Number(CONFIG.Transcoder.ChunkDuration);
    const maxLiveDuration = Number(CONFIG.Transcoder.MaxLiveStreamDuration);
    const latencyAdjuster = Number(CONFIG.Transcoder.LantencyAdjuster);
    const durationAdjuster = Number(CONFIG.Transcoder.DurationAdjuster);

    console.log(`[transcoder] initialDuration: ${initialDuration}, duration: ${duration}, maxLiveDuration: ${maxLiveDuration}, latencyAdjuster: ${latencyAdjuster}, durationAdjuster: ${durationAdjuster}`);
    if(isAppleTv && cache.playbackSessions[sessionId].counter <= initialDuration) {
      playlist.push(`#EXT-X-TARGETDURATION:${1}`);
      playlist.push(`#EXT-X-MEDIA-SEQUENCE:0`);
      playlist.push(`#EXTINF:${1},`);
      playlist.push(`/chunk/${encodeURIComponent(url)}/0/${initialDuration + durationAdjuster}`);
    } else {
      playlist.push(`#EXT-X-TARGETDURATION:${duration}`);
      playlist.push(`#EXT-X-MEDIA-SEQUENCE:1`);

      const playbackSessions = cache.playbackSessions && cache.playbackSessions[sessionId];
      const timestamp = playbackSessions ? playbackSessions.timestamp : Date.now();

      for (let i = 1; i < Math.floor(maxLiveDuration/duration); ++i) {
        playlist.push(`#EXTINF:${duration},`);
        playlist.push(`/chunk/${encodeURIComponent(url)}/-${timestamp + i*duration*1000 + latencyAdjuster}/${duration + durationAdjuster}`);
      }

      playlist.push(`#EXT-X-ENDLIST`);
    }
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

  if (cache.currentStream) {
    cache.currentStream.end();
    cache.currentStream = null;
  }

  const { stream, cancel } = await loadChunk(url, start, duration);

  res.writeHead(200, {
    'Content-Type': 'video/MP2T',
  });

  console.log(`[transcoder] serve - streaming content of chunk ${start} - ${duration}`);
  stream.pipe(res, { end: true });

  cache.currentStream = stream;

  req.on('close', () => {
    console.log(`[transcoder] serve - client dropped`);
    cancel();
  });
};

const loadChunk = async (url, s, d) => {
  const ffmpeg = CONFIG.Transcoder.FMpegPath || 'ffmpeg';
  const start = Number(s);
  const duration = Number(d);

  if ( start < 0 ) {
    const timestamp = -1 * start;
    console.log('[ffmpeg] waiting for timestamp ' + timestamp);
    while(Date.now() < timestamp) {
      await wait(10);
    }
    console.log('[ffmpeg] timestamp reached, moving forward');
  }
  
  const options = [
    Number(start) > 0 ? '-ss' : null, Number(start) > 0 ? start : null,
    Number(duration) > 0 ? '-t' : null , Number(duration) > 0 ? duration : null,
    '-http_proxy', `http://localhost:${CONFIG.Transcoder.ProxyPort}`,
    '-i', url,

    '-y',
    '-crf', '16',
    '-strict', 'experimental',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-profile:v', 'baseline',
    '-level', '3.0',
    '-vcodec', 'h264',
    '-acodec', 'aac',
    '-ac', '6',
    '-ab', '640k',
    '-max_muxing_queue_size', '1024',
    '-copyts',
    '-r', 25,
    '-pix_fmt', 'yuv420p',
    '-map_metadata', -1,
    '-f', 'mpegts',

    '-hide_banner',

    'pipe:1'
  ].filter(op => op !== null ? true : false);

  console.log('[ffmpeg] ffmpeg ' + options.join(' '));
  const child = spawn(ffmpeg, options);
  const cancel = () => child.kill('SIGINT');

  if (CONFIG.Transcoder.FFMpegDebugLogging) {
    child.stderr.on('data', data => {
      console.log('[ffmpeg] ' + data.toString())
    });
  }

  child.on('error', error => {
    console.error(`[ffmpeg] error transcoding  ${url} / ${start} / ${duration}`);
    console.error(error);
    cancel();
  });

  child.on('exit', error => {
    console.log(`[ffmpeg] exiting transcoding process ${url} / ${start} / ${duration}`);
  });

  return { 
    stream: child.stdout,
    cancel,
  };
};

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
