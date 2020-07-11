import * as http from 'http';
import * as followRedirects from 'follow-redirects';
import { spawn } from 'child_process';
import { Readable, Writable } from 'stream';
import { wait, get } from 'common/utils';
import * as Config from './config';
import { startDiscoveryService, getWorkerList } from './discovery';

interface VideoInfo {
  totalDuration: number;
  videoCodecs: string[];
  audioCodecs: string[];
};

enum RequestMethod {
  Get = 'GET',
  Post = 'POST',
};

const cache = {
  videoInfo: {},
  currentStream: null,
};

export const startServer = () => {
  if (Config.IptvHttpProxy) {
    console.log(`[transcoder] setting the http proxy from the settings to ${Config.IptvHttpProxy}`);
    process.env.http_proxy = Config.IptvHttpProxy;
  }

  http.createServer((req, res) => handleRequest(req, res)).listen(Config.Port, () => {
    console.log(`[transcoder] transcoding worker started at ${Config.Port}`);

    if (Config.EnableDiscovery) {
      startDiscoveryService();
    }
  });
};

const handleRequest = async (req, res): Promise<void> => {
  try {
    if (req.url.startsWith('/transcoder/ping')) {
      await ping(req, res);
    } else if (req.url.startsWith('/transcoder/live')) {
      await servePlaylist(req, res, true);
    } else if (req.url.startsWith('/transcoder/vod')) {
      await servePlaylist(req, res, false);
    } else if (req.url.startsWith('/transcoder/chunk')) {
      await serveChunk(req, res);
    } else if (req.url.startsWith('/transcoder/remote-transcode')) {
      await remoteTranscode(req, res);
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
  console.log(`[transcoder] sending pong...`);
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

  playlist.push(`#EXTM3U`);
  playlist.push(`#EXT-X-VERSION:4`);

  if (!isLive) {
    console.log(`[transcoder] proxyVideo - VOD detected, fetching video info...`);
    const videoInfo = await loadVideoInfo(url);
    const hlsDuration = 10;
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

    for (let i = 1; i < Config.MaxDuration; ++i) {
      playlist.push(`#EXTINF:${hlsDuration},`);
      playlist.push(getPlaylistUrl(url, null, null, isLive));
    }
  } 

  playlist.push(`#EXT-X-ENDLIST`);

  res.writeHead(200, {
    'Content-Type': 'application/x-mpegURL',
  });

  res.end(playlist.join('\n'));
};

const getPlaylistUrl = (url: string, start: number, duration: number, isLive: boolean): string => {
  if (Config.RemoteTranscoder) {
    const s: string = isLive ? '-1' : String(start);
    const d: string = duration ? String(duration) : '0';
    return `${Config.RemoteTranscoder}/transcoder/remote-transcode/${encodeURIComponent(url)}/${s}/${d}`;
  } else {
    return `/transcoder/chunk/${encodeURIComponent(url)}/${start}/${duration}`;
  }
};

const remoteTranscode = async (req, res): Promise<void> => {
  if (!Config.RemoteTranscoder) {
    throw new Error(`[transcoder] remoteTranscode needs Config.RemoteTranscoder`);
  }

  console.log(`[transcoder] waking up the remote transcoder`);
  await get(`${Config.RemoteTranscoder}/transcoder/ping`);

  const matches = req.url.match(`/transcoder/remote-transcode/([^/]*)/([^/]*)/([^/]*)`);
  const url = decodeURIComponent(matches[1]);
  const start = Number(matches[2]);
  const duration = Number(matches[3]);


  if (url.startsWith('https')) {
    throw new Error('[transcoder] https is not supported yet for remote transcoder');
  }

  console.log(`[transcoder] using remote transcoder for ${url}, ${start}, ${duration}`);

  const postURL =new URL(Config.RemoteTranscoder);
  const postRequest = http.request({
    method: 'POST',
    hostname: postURL.hostname,
    port: postURL.port,
    path: `/transcoder/chunk/${encodeURIComponent(url)}/${start}/${duration}`,
  }, (postResponse) => {
    console.log(`[remote-trasncoder] got post response ${postResponse.statusCode}, now piping...`);

    if (postResponse.statusCode === 200) {
      res.writeHead(200, {
        'Content-Type': 'video/MP2T',
      });

      postResponse.on('data', chunk => {
        res.write(chunk);
      })
    }
  });

  console.log(`[transcoder] getting URL ${url}`);

  const getRequest = followRedirects.http.get(url, getResponse => {
    console.log(`[transcoder] get url response ${url}, ${getResponse.statusCode}`);

    getResponse.on('data', chunk => {
      postRequest.write(chunk);
    });

    getResponse.on('end', () => {
      console.log(`[transcoder] remote-transcode - finished remote transcoding ${url}`);
      postRequest.end();
    });
  });

  req.on('close', () => {
    console.log(`[transcoder] remote-transcoder - client hangout ${url}`);
    postRequest.abort();
    getRequest.abort();
  });
};

const serveChunk = async (req, res): Promise<void> => {
  const isGet = req.method.toUpperCase() === RequestMethod.Get;
  const isPost = req.method.toUpperCase() === RequestMethod.Post;

  if (!isGet && !isPost) {
    throw new Error(`[transcoder] serveChunk unkown method: ${req.method}`);
  }

  const matches = req.url.match(`/transcoder/chunk/([^/]*)/([^/]*)/([^/]*)`);
  const url = decodeURIComponent(matches[1]);
  const start = Number(matches[2]);
  const duration = Number(matches[3]);

  console.log(`[transcoder] serveChunk - ${req.method} - ${req.url}`);

  if (cache.currentStream) {
    cache.currentStream.end();
    cache.currentStream = null;
  }

  const { stdin, stdout, cancel } = await loadChunk(url, start, duration, isPost);

  if (isPost) {
    let buffer = [];
    let done = false;
    let closed = false;

    stdin.on('close', () => {
      closed = true;
    });

    req.on('data', (chunk: any) => {
      buffer.push(chunk);
    });

    req.on('end', () => {
      done = true;
    });

    const pollData = async () =>  {
      const data = buffer.shift();

      if (data && !closed) {
        stdin.write(data);
      }

      if (done && buffer.length === 0) {
        stdin.end();
      } else {
        await wait(5);
        pollData();
      }
    };

    pollData();
  }

  console.log(`[transcoder] serveChunk - streaming content of chunk ${start} - ${duration}`);
  stdout.pipe(res, { end: true });

  cache.currentStream = res;

  res.writeHead(200, {
    'Content-Type': 'video/MP2T',
  });

  req.on('close', () => {
    console.log(`[transcoder] serveChunk - client dropped`);
    cancel();
  });
};

const loadChunk = async (input: string, start: number, duration: number, useStdin: boolean): Promise<{stdout: Readable, stdin: Writable, cancel: () => void}> => {
  const ffmpeg = Config.FFMpegPath || 'ffmpeg';

  const isLive = !isNaN(start) && start < 0;
  let transcode = !isLive;

  //if (!isLive) {
  //  const { audioCodecs, videoCodecs } = await loadVideoInfo(url);
  //  const videoNeedTranscode = (videoCodecs && videoCodecs.some(c => c.indexOf('h264') === -1));
  //  const audioNeedTranscode = (audioCodecs && audioCodecs.some(c => c.indexOf('aac') === -1));
  //  transcoder = videoNeedTranscode || audioNeedTranscode;
  //}

  const options = [];

  if (Config.DebugLogging !== 'true') {
    options.push('-hide_banner', '-loglevel', 'quiet');
  }

  if (process.env.http_proxy) {
    options.push('-http_proxy', process.env.http_proxy);
  }

  if (Number(start) > 0) {
    options.push('-ss', String(start));
  }

  if (Number(duration) > 0) {
    options.push('-t', String(duration));
  }

  options.push('-i', useStdin ? 'pipe:0' : input);

  options.push('-acodec');
  if (transcode) {
    options.push('aac', '-ab', '640k', '-ac', '6');
  } else {
    options.push('copy');
  }

  options.push('-vcodec');
  if (transcode) {
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
  } else {
    options.push('copy');
  }

  if (!isLive) {
    options.push('-avoid_negative_ts', 'make_zero', '-fflags', '+genpts');
    options.push('-max_muxing_queue_size', '1024');
  } else {
    options.push('-copyts');
  }

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
