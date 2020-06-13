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
  });
})();

const proxyVideo = async (req, res) => {
  const playlist = [];
  const matches = req.url.match('/proxy/([^/]*)');
  const url = decodeURIComponent(matches[1]);

  const videoInfo = await loadVideoInfo(url);
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
  } else { 
    console.log(`[transcoder] proxyVideo - totalDuration live stream, url ${url}`);

    playlist.push(`#EXT-X-TARGETDURATION:${1}`);
    playlist.push(`#EXT-X-MEDIA-SEQUENCE:0`);

    for (let i = 0; i < 3600 * 4; ++i) {
      playlist.push(`#EXTINF:${1},`);
      playlist.push(`/chunk/${encodeURIComponent(url)}/0/0`);
    }
  } 

  if (isVod || isLive) {
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
  const ffmpeg = CONFIG.Transcoder.FFMpegPath || 'ffmpeg';
  const crf = CONFIG.Transcoder.FFMpegCRF;
  const start = Number(s);
  const duration = Number(d);

  const { audioCodecs, videoCodecs } = await loadVideoInfo(url);

  const transcodeAudio = !audioCodecs || !audioCodecs.some(c => c.indexOf('aac') !== -1);
  const transcodeVideo = !videoCodecs || !videoCodecs.some(c => c.indexOf('h264') !== -1);

  const proxy = process.env.http_proxy || null;

  const options = [
    '-hide_banner',
    '-loglevel', 'quiet',

    Number(start) > 0 ? '-ss' : null, Number(start) > 0 ? start : null,
    Number(duration) > 0 ? '-t' : null , Number(duration) > 0 ? duration : null,
    '-http_proxy', `http://localhost:${CONFIG.Transcoder.ProxyPort}`,
    '-i', url,

    //'-y',
    //'-crf', crf,
    //'-strict', 'experimental',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    //'-profile:v', 'baseline',
    //'-level', '3.0',
    '-max_muxing_queue_size', '1024',
    //'-copyinkf',
    '-copyts',
    //'-r', 25,
    '-pix_fmt', 'yuv420p',
    //'-map_metadata', -1,
  ].filter(op => op !== null ? true : false);

  options.push('-acodec');
  if (transcodeAudio) {
    options.push('aac');
    options.push('-ab');
    options.push('640k');
  } else {
    options.push('copy');
  }

  options.push('-vcodec');
  if (transcodeVideo) {
    options.push('libx264');
  } else {
    options.push('copy');
  }

  options.push('-f');
  options.push('mpegts');

  options.push('pipe:1');

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

  let didExit = false;

  child.on('exit', error => {
    didExit = true;
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

  const proxy = process.env.http_proxy || null;
  const ffprobe = CONFIG.Transcoder.FFProbePath || 'ffprobe';
  const options = [
    proxy ? '-http_proxy' : null, proxy,
    '-i', url, 
    '-hide_banner', '-loglevel', 'fatal', '-show_error', '-show_format', 
    '-show_streams', '-show_programs', '-show_chapters', '-show_private_data', 
    '-print_format', 'json'
  ].filter(op => op !== null ? true : false);

  console.log(`[transcoder] ffprobe ${options.join(' ')}`);
  const child = spawn(module.exports.FFPROBE_PATH || 'ffprobe', options);

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
    let videoCodecs = null;
    let audioCodecs = null;

    const notNull = (item) => item ? true : false;

    try {
      const parsedOutput = JSON.parse(output);

      totalDuration = Number(parsedOutput.format.duration);
      videoCodecs = parsedOutput.streams.map(s => s.codec_type === 'video' ? s.codec_name.toLowerCase() : null).filter(notNull);
      audioCodecs = parsedOutput.streams.map(s => s.codec_type === 'audio' ? s.codec_name.toLowerCase() : null).filter(notNull);

    } catch(e) {
      console.log(`[transcoder] ffprobe failed to parse output, url ${url}`);
    }

    cache[url] = {
      totalDuration,
      videoCodecs,
      audioCodecs,
    };

    console.log(`[transcoder] ffprobe successful, url ${url}, ${JSON.stringify(cache[url])}`);

    resolve(cache[url]);
  });
});
