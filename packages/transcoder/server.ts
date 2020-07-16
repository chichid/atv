import * as http from 'http';
import { spawn } from 'child_process';
import { Readable, Writable } from 'stream';
import * as Config from './config';
import { wait, readFile, fileStat, fileStream, fileExists, mkdir, rmdir, get } from 'common/utils';

interface VideoInfo {
  totalDuration: number;
  videoCodecs: string[];
  audioCodecs: string[];
};

interface LoadChunkResult {
  stdout: Readable;
  stdin: Writable;
  cancel: () => void;
  isComplete: () => boolean;
  contentType: string;
}

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
  const matches = req.url.match('/transcoder/[^/]*/([^/]*)/([^/]*)');
  const url = decodeURIComponent(matches[1]);
  const proxyPort = decodeURIComponent(matches[2]);

  if (cache.currentStream) {
    cache.currentStream.end();
    cache.currentStream = null;
  }

  let proxyURL: string = '';

  if (proxyPort && Config.UseProxy) {
    proxyURL = `http://${getRemoteIp(req)}:${proxyPort}`;
    console.log(`[transcoder] transcode - using proxy ${proxyURL}`);
  }

  loadVideoInfo(url, proxyURL);

  playlist.push(`#EXTM3U`);
  playlist.push(`#EXT-X-VERSION:4`);

  if (isLive) {
    console.log(`[transcoder] constructing live playlist, url ${url}`);
    const hlsDuration = 1;

    playlist.push(`#EXT-X-TARGETDURATION:${hlsDuration}`);
    playlist.push(`#EXT-X-MEDIA-SEQUENCE:0`);

    const liveUrl = getPlaylistUrl(url, null, null, isLive);

    for (let i = 1; i < Config.MaxDuration; ++i) {
      playlist.push(`#EXTINF:${hlsDuration},`);
      playlist.push(liveUrl);
    }
  } else { 
    console.log(`[transcoder] proxyVideo - VOD detected, fetching video info...`);

    createTmpFolder();

    const videoInfo = await loadVideoInfo(url, proxyURL);
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
  const remoteTranscoderURL: string = Config.RemoteTranscoder;
  const proxyPort: string = remoteTranscoderURL ? Config.ProxyServicePort : '';

  return `${remoteTranscoderURL || ''}/transcoder/transcode/${encodeURIComponent(url)}/${s}/${d}/${proxyPort}`;
};

const getRemoteIp = (req): string => {
 const ip = req.headers['x-forwarded-for'] || 
	 req.connection.remoteAddress || 
	 req.socket.remoteAddress ||
	 req.connection.socket.remoteAddress;

 if (ip === '::1') {
   return '127.0.0.1';
 } else {
   return ip.replace('::ffff:', '');
 } 
};

const transcode = async (req, res): Promise<void> => {
  const matches = req.url.match(`/transcoder/transcode/([^/]*)/([^/]*)/([^/]*)/([^/]*)`);
  const url = decodeURIComponent(matches[1]);
  const start = Number(matches[2]);
  const duration = Number(matches[3]);
  const proxyPort = matches[4] ? decodeURIComponent(matches[4]) : null;
  const isLive = start === -1;

  console.log(`[transcoder] transcode - ${req.method} - ${req.url}`);

  let proxyURL: string = '';

  if (proxyPort && Config.UseProxy) {
    proxyURL = `http://${getRemoteIp(req)}:${proxyPort}`;
    console.log(`[transcoder] transcode - using proxy ${proxyURL}`);
  }

  if (isLive) {
    const { stdout, isComplete, cancel, contentType } = await loadChunk(url, start, duration, proxyURL);

    if (cache.currentStream) {
      console.log(`[transcoder] stopping previous transcoding stream`);
      cache.currentStream.end();
      cache.currentStream = null;
    }

    console.log(`[transcoder] transcode - streaming content of chunk ${start} - ${duration}`);
    res.writeHead(200, {
      'Content-Type': 'video/MP2T',
    });

    stdout.pipe(res, { end: true });

    cache.currentStream = res;

    req.on('close', () => {
      console.log(`[transcoder] transcode - client dropped live stream ${url}`);
      cancel();
    });
  } else {
    const chunkFile = getChunkOutputFile(start, duration, '');

    if (!await fileExists(getChunkOutputFile(start+duration, duration, ''))) {
      loadChunk(url, start+duration, duration, proxyURL);
    }

    if (!await fileExists(chunkFile)) {
      const { isComplete } = await loadChunk(url, start, duration, proxyURL);

      console.log(`[transcoder] waiting for the chunk file to be generated ${chunkFile}`);
      do { await wait(500); } while(!isComplete())
    }

    console.log(`[transcoder] ${chunkFile} is now available streaming it`);
    const { size } = await fileStat(chunkFile);

    res.writeHead(200, {
      'Content-Type': 'video/MP2T',
      'Content-Length': size,
    });

    fileStream(chunkFile).pipe(res, {end: true});
  }
};

const getChunkOutputFile = (start: number, end: number, suffix: string): string => {
  return Config.TmpFolder + '/' + start + '-' + end + '-' + suffix + '.ts';
};

const createTmpFolder = async () => {
  if (await fileExists(Config.TmpFolder)) {
    console.log(`[transcoder] deleting previous tmp folder...`);
    await rmdir(Config.TmpFolder);
  }

  console.log(`[transcoder] creating tmp folder...`);
  await mkdir(Config.TmpFolder);
};

const loadChunk = async (input: string, start: number, duration: number, proxy: string): Promise<LoadChunkResult> => {
  const ffmpeg = Config.FFMpegPath || 'ffmpeg';
  const isLive = start === -1;

  let contentType: string;
  const options = [];

  options.push('-y');

  if (!Config.DebugLogging) {
    options.push('-hide_banner', '-loglevel', 'quiet');
  } 

  if (proxy && Config.UseProxy) {
    options.push('-http_proxy', proxy);
  }

  if (Number(start) > 0) {
    options.push('-ss', String(start));
  }

  if (Number(duration) > 0) {
    options.push('-t', String(duration));
  }

  options.push('-i', input);

  if (Number(duration) > 0) {
    options.push('-t', String(duration));
  }

  options.push('-strict', 'experimental');

  options.push('-acodec', 'aac');
  options.push('-ab', '640k', '-ac', '6');

  options.push('-vcodec', 'libx264');
  //options.push('-crf', '18');
  options.push('-s', '1280x720');
  options.push('-preset', 'ultrafast');
  //options.push('-profile:v', 'baseline');
  //options.push('-level', '3.0');

  contentType = 'video/MP2T';

  //options.push('-max_muxing_queue_size', '1024');
  options.push('-pix_fmt', 'yuv420p');

  if (Config.FFMpegExtraVideoFlags) {
    options.push.apply(options, Config.FFMpegExtraVideoFlags.split(' '));
  }

  if (isLive) {
    options.push('-f', 'mpegts');
    options.push('pipe:1');
  } else {
    options.push('-avoid_negative_ts', 'make_zero');
    options.push('-fflags', '+genpts');
    //options.push('-map', '0');
    //options.push('-copyts');
    //options.push('-copyinkf');
    options.push('-f', 'mpegts');
    options.push(getChunkOutputFile(start, duration, ''));
  }

  console.log('[ffmpeg] ffmpeg ' + options.join(' '));
  const child = spawn(ffmpeg, options);
  const cancel = () => child.kill('SIGINT');

  let complete = false;
  const isComplete = (): boolean => complete;

  if (Config.DebugLogging) {
    child.stderr.on('data', data => {
      console.log('[transcoder-ffmpeg] ' + data.toString())
    });
  }

  child.on('error', error => {
    console.error(`[transcoder-ffmpeg] error transcoding  ${typeof input === 'string' ? input : 'pipe:0'} / ${start} / ${duration}`);
    console.log('error ---> ');
    console.error(error);
    console.log(`------`);

    complete = true;
    cancel();
  });

  child.on('exit', code => {
    console.log(`[transcoder-ffmpeg] exiting transcoding process with code ${code} / ${input} / ${start} / ${duration}`);
    complete = true;
  });

  return { 
    stdout: child.stdout,
    stdin: child.stdin,
    cancel,
    isComplete,
    contentType,
  };
};

const getVideoInfo = (url: string): VideoInfo => {
  return cache.videoInfo[url];
};

const loadVideoInfo = (url: string, proxy: string, noCache = false) => new Promise<VideoInfo>((resolve, reject) => {
  if (!noCache && cache.videoInfo[url]) {
    resolve(cache.videoInfo[url]);
    return;
  }

  const ffprobe = Config.FFProbePath || 'ffprobe';
  const options = [];

  if (proxy && Config.UseProxy) {
    options.push('-http_proxy', proxy);
  }

  options.push(
    '-i', url, 
    '-hide_banner', '-loglevel', 'fatal', '-show_error', '-show_format', 
    '-show_streams', '-show_programs', '-show_chapters', '-show_private_data', 
    '-print_format', 'json'
  );

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
