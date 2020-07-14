import * as http from 'http';
import { spawn } from 'child_process';
import { Readable, Writable } from 'stream';
import { get } from 'common/utils';
import * as Config from './config';

interface VideoInfo {
  totalDuration: number;
  videoCodecs: string[];
  audioCodecs: string[];
};

const cache = {
  videoInfo: {},
  currentStream: null,
};

export const startServer = async () => {
  await checkConfig();

  createServer().listen(Config.Port, () => {
    console.log(`[transcoder] transcoding worker started at ${Config.Port}`);

    if (Config.EnableDiscovery) {
      throw new Error(`[transcoder] discovery is not yet supported`);
    }
  });
};

const checkConfig = async () => {
  if (Config.RemoteTranscoder && !Config.ProxyServicePort) {
    throw new Error(`[transcoder] bad config, when RemoteTranscoder is provided, please provide ProxyServicePort as well`);
  }
};

const createServer = () => {
  return http.createServer((req, res) => handleRequest(req, res));
};

const handleRequest = async (req, res): Promise<void> => {
  try {
    if (req.url.startsWith('/transcoder/ping')) {
      await ping(req, res);
    } else if (req.url.startsWith('/transcoder/live')) {
      await servePlaylist(req, res, true);
    } else if (req.url.startsWith('/transcoder/vod')) {
      await servePlaylist(req, res, false);
    } else if (req.url.startsWith('/transcoder/transcode')) {
      await transcode(req, res);
    } else {
      res.writeHead(404);
      res.end('resource not found');
    }
  } catch(e) {
    console.error(`[transcoder] exception in request ${req.url}, ${e.message}`);
    console.error(e.stack);
    res.writeHead(500);
    res.end(e.message);
  }
};

const ping = async (req, res): Promise<void> => {
  if (Config.RemoteTranscoder) {
    console.log(`[transcoder] sending ping to the remote transcoder ${Config.RemoteTranscoder}`);
    const response = await get(`${Config.RemoteTranscoder}/transcoder/ping`);
    console.log(`[transcoder] remote transcoder replied ${response}`);
  }

  console.log(`[transcoder] transcoder is now awake, sending pong...`);
  res.writeHead(200);
  res.end('pong');
};

const servePlaylist = async (req, res, isLive) => {
  const playlist = [];
  const matches = req.url.match('/transcoder/[^/]*/([^/]*)');
  const url = decodeURIComponent(matches[1]);

  if (cache.currentStream) {
    cache.currentStream.end();
    cache.currentStream = null;
  }

  loadVideoInfo(url);

  playlist.push(`#EXTM3U`);
  playlist.push(`#EXT-X-VERSION:4`);

  if (!isLive) {
    console.log(`[transcoder] proxyVideo - VOD detected, fetching video info...`);
    const videoInfo = await loadVideoInfo(url);
    const hlsDuration = Config.HlsChunkDuration;
    const totalDuration = videoInfo.totalDuration || Config.MaxDuration; 
    console.log(`[transcoder] constructing VOD playlist, totalDuration: ${totalDuration}, url ${url}`);

    playlist.push(`#EXT-X-TARGETDURATION:${hlsDuration}`);
    playlist.push(`#EXT-X-MEDIA-SEQUENCE:0`);

    let start = 0;
    while (start < videoInfo.totalDuration) {
      const chunkDuration = Math.min(videoInfo.totalDuration - start, hlsDuration);
      playlist.push(`#EXTINF:${hlsDuration},`);
      playlist.push(getPlaylistUrl(url, start, hlsDuration, isLive));
      start += chunkDuration;
    }
  } else { 
    console.log(`[transcoder] constructing live playlist, url ${url}`);
    const hlsDuration = 1;

    playlist.push(`#EXT-X-TARGETDURATION:${hlsDuration}`);
    playlist.push(`#EXT-X-MEDIA-SEQUENCE:0`);

    const liveUrl = getPlaylistUrl(url, null, null, isLive);

    for (let i = 1; i < Config.MaxDuration; ++i) {
      playlist.push(`#EXTINF:${hlsDuration},`);
      playlist.push(liveUrl);
    }
  } 

  playlist.push(`#EXT-X-ENDLIST`);

  res.writeHead(200, {
    'Content-Type': 'application/x-mpegURL',
  });

  res.end(playlist.join('\n'));
};

const getPlaylistUrl = (url: string, start: number, duration: number, isLive: boolean): string => {
  if (isLive) {
    const availableVideoInfo = getVideoInfo(url);
    let needTranscoding = false;
    
    if (availableVideoInfo) {
      const { audioCodecs, videoCodecs } = availableVideoInfo;
      const videoNeedTranscode = (videoCodecs && videoCodecs.some(c => c.indexOf('h264') === -1));
      const audioNeedTranscode = (audioCodecs && audioCodecs.some(c => c.indexOf('aac') === -1));
      needTranscoding = videoNeedTranscode || audioNeedTranscode;
    }

    if (!needTranscoding) {
      return url;
    }
  } 

  const s: string = isLive ? '-1' : String(start);
  const d: string = duration ? String(duration) : '0';
  const remoteTranscoderURL: string = Config.RemoteTranscoder || '';
  const proxyPort: string = remoteTranscoderURL ? Config.ProxyServicePort : '';

  return `${remoteTranscoderURL}/transcoder/transcode/${encodeURIComponent(url)}/${s}/${d}/${proxyPort}`;
};

const getRemoteIp = (req): string => {
 const ip = req.headers['x-forwarded-for'] || 
	 req.connection.remoteAddress || 
	 req.socket.remoteAddress ||
	 req.connection.socket.remoteAddress;

 if (ip === '::1') {
   return '127.0.0.1';
 } else {
   return ip;
 } 
};

const transcode = async (req, res): Promise<void> => {
  const matches = req.url.match(`/transcoder/transcode/([^/]*)/([^/]*)/([^/]*)/([^/]*)`);
  const url = decodeURIComponent(matches[1]);
  const start = Number(matches[2]);
  const duration = Number(matches[3]);
  const proxyPort = matches[4] ? decodeURIComponent(matches[4]) : null;

  console.log(`[transcoder] transcode - ${req.method} - ${req.url}`);

  let proxyURL: string = '';
  if (proxyPort) {
    proxyURL = `http://${getRemoteIp(req)}:${proxyPort}`;
    console.log(`[transcoder] transcode - using proxy ${proxyURL}`);
  }

  if (cache.currentStream) {
    console.log(`[transcoder] stopping previous transcoding stream`);
    cache.currentStream.end();
    cache.currentStream = null;
  }

  const { stdout, cancel } = await loadChunk(url, start, duration, proxyURL);

  console.log(`[transcoder] transcode - streaming content of chunk ${start} - ${duration}`);
  stdout.pipe(res, { end: true });

  cache.currentStream = res;

  res.writeHead(200, {
    'Content-Type': 'video/MP2T',
  });

  req.on('close', () => {
    console.log(`[transcoder] transcode - client dropped ${url}`);
    cancel();
  });
};

const loadChunk = async (input: string, start: number, duration: number, proxy: string): Promise<{stdout: Readable, stdin: Writable, cancel: () => void}> => {
  const ffmpeg = Config.FFMpegPath || 'ffmpeg';

  const options = [];

  if (Config.DebugLogging !== 'true') {
    options.push('-hide_banner', '-loglevel', 'quiet');
  }

  if (proxy) {
    options.push('-http_proxy', proxy);
  }

  if (Number(start) > 0) {
    options.push('-ss', String(start));
  }

  if (Number(duration) > 0) {
    options.push('-t', String(duration));
  }

  options.push('-i', input);

  options.push('-acodec');
  options.push('aac', '-ab', '640k', '-ac', '6');

  options.push('-vcodec');
  options.push('h264');
  options.push('-crf', '18');
  options.push('-s', '1280x720');
  options.push('-preset', 'ultrafast');
  options.push('-profile:v', 'baseline');
  options.push('-level', '3.0');
  options.push('-tune', 'zerolatency');
  options.push('-movflags', '+faststart');

  if (Config.FFMpegExtraVideoFlags) {
    options.push.apply(options, Config.FFMpegExtraVideoFlags.split(' '));
  }

  options.push('-avoid_negative_ts', 'make_zero', '-fflags', '+genpts');
  options.push('-max_muxing_queue_size', '1024');

  options.push('-strict', 'experimental');
  options.push('-r', '24');
  options.push('-pix_fmt', 'yuv420p');
  options.push('-f', 'mpegts');
  options.push('pipe:1');

  console.log('[ffmpeg] ffmpeg ' + options.join(' '));
  const child = spawn(ffmpeg, options);
  const cancel = () => child.kill('SIGINT');

  if (Config.DebugLogging === 'true') {
    child.stderr.on('data', data => {
      console.log('[transcoder-ffmpeg] ' + data.toString())
    });
  }

  child.on('error', error => {
    console.error(`[transcoder-ffmpeg] error transcoding  ${typeof input === 'string' ? input : 'pipe:0'} / ${start} / ${duration}`);
    console.log('error ---> ');
    console.error(error);
    console.log(`------`);

    cancel();
  });

  child.on('exit', code => {
    console.log(`[transcoder-ffmpeg] exiting transcoding process with code ${code} / ${input} / ${start} / ${duration}`);
  });

  return { 
    stdout: child.stdout,
    stdin: child.stdin,
    cancel,
  };
};

const getVideoInfo = (url): VideoInfo => {
  return cache.videoInfo[url];
};

const loadVideoInfo = (url, noCache = false) => new Promise<VideoInfo>((resolve, reject) => {
  if (!noCache && cache.videoInfo[url]) {
    resolve(cache.videoInfo[url]);
    return;
  }

  const proxy = process.env.http_proxy || null;
  const ffprobe = Config.FFProbePath || 'ffprobe';
  const options = [
    proxy ? '-http_proxy' : null, proxy || null,
    '-i', url, 
    '-hide_banner', '-loglevel', 'fatal', '-show_error', '-show_format', 
    '-show_streams', '-show_programs', '-show_chapters', '-show_private_data', 
    '-print_format', 'json'
  ].filter(op => op !== null ? true : false);

  console.log(`[transcoder] ffprobe ${options.join(' ')}`);
  const child = spawn(ffprobe, options);

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

    cache.videoInfo[url] = {
      totalDuration,
      videoCodecs,
      audioCodecs,
    };

    console.log(`[transcoder] ffprobe successful, url ${url}, ${JSON.stringify(cache.videoInfo[url])}`);

    resolve(cache.videoInfo[url]);
  });
});
