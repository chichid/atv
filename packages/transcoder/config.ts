const { rcfg, cfg } = require('common/config');

export const Port = cfg('TRANSCODER_PORT', 8666);
export const DebugLogging = cfg('TRANSCODER_DEBUG_LOGGING', 'false') === 'true';
export const EnableDiscovery = cfg('TRANSCODER_ENABLE_DISCOVERY', 'false') === 'true';
export const HlsChunkDuration = Number(cfg('TRANSCODER_HLS_CHUNK_DURATION', 5));
export const MaxDuration = cfg('TRANSCODER_MAX_DURATION', 3600 * 4);
export const FFMpegPath = cfg('TRANSCODER_FFMPEG_PATH');
export const FFProbePath = cfg('TRANSCODER_FFPROBE_PATH');
export const FFMpegExtraVideoFlags = cfg('TRANSCODER_FFMPEG_EXTRA_VIDEO_FLAGS', '');
export const RemoteTranscoder = cfg('TRANSCODER_REMOTE_TRANSCODER');
export const ProxyServicePort = cfg('PROXY_SERVICE_PORT');
export const UseProxy = cfg('TRANSCODER_USE_PROXY', 'true') === 'true';
export const TmpFolder = cfg('TRANSCODER_TMP_FOLDER', 'tmp');

export const Discovery = {
  Port: cfg('TRANSCODER_DISCOVERY_PORT', 23456),
  LanAddrPrefix: cfg('TRANSCODER_DISCOVERY_LAN_PREFIX', '192.168'),
};

