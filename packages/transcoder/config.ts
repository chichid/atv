const { rcfg, cfg } = require('common/config');

export const IptvHttpProxy = rcfg('IPTV_HTTP_PROXY', process.env.IPTV_HTTP_PROXY);
export const Port = cfg('TRANSCODER_PORT', 8666);
export const DebugLogging = cfg('TRANSCODER_DEBUG_LOGGING', false);
export const EnableDiscovery = cfg('TRANSCODER_ENABLE_DISCOVERY', false);
export const ChunkDuration = cfg('TRANSCODER_CHUNK_DURATION', 10);
export const MaxDuration = cfg('TRANSCODER_MAX_DURATION', 3600 * 4);
export const FFMpegPath = cfg('TRANSCODER_FFMPEG_PATH');
export const FFProbePath = cfg('TRANSCODER_FFPROBE_PATH');
export const FFMpegExtraVideoFlags = cfg('TRANSCODER_FFMPEG_EXTRA_VIDEO_FLAGS', '');

export const Discovery = {
  Port: cfg('TRANSCODER_DISCOVERY_PORT', 23456),
  LanAddrPrefix: cfg('TRANSCODER_DISCOVERY_LAN_PREFIX', '192.168'),
};

