const { cfg } = require('common/config');

const Discovery = {
  Port: cfg('TRANSCODER_DISCOVERY_PORT', 23456),
  LanAddrPrefix: cfg('TRANSCODER_DISCOVERY_LAN_PREFIX', '192.168'),
};

export const Config = {
  Discovery,
  BaseUrl: cfg('TRANSCODER_URL', 'http://localhost:8666'),
  Port: cfg('TRANSCODER_PORT', 8666),
  DebugLogging: cfg('TRANSCODER_DEBUG_LOGGING', false),
  EnableDiscovery: cfg('TRANSCODER_ENABLE_DISCOVERY', false),
  ChunkDuration: cfg('TRANSCODER_CHUNK_DURATION', 10),
  FFMpegPath: cfg('TRANSCODER_FFMPEG_PATH'),
  FFProbePath: cfg('TRANSCODER_FFPROBE_PATH'),
};
