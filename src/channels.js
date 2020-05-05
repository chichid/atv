const fs = require('fs');
const { get } = require('./utils');

const PAGE_SIZE = 100;
let CHANNELS = null;

export const reloadChannels = (config) => async () => {
  CHANNELS = null;
  await loadChannels();
};

const loadChannels = async (config) => {
  if (!CHANNELS) {
    console.log('[model] loadChannels, loading channels...');

    CHANNELS = [];
    const m3us = fs.readdirSync(config.M3uDir);

    for (const m3uSource of m3us) {
      const source = 'file://' + config.M3uDir + '/' + m3uSource;
      console.log('[model] loadChannels, adding m3u source ' + source + '...');

      const channels = await readM3u(source);
      CHANNELS = [...CHANNELS, ...channels];
    }
  }

  return CHANNELS;
};

const readM3u = async (url) => {
  const m3u = await get(url);
  const lines = m3u.split('\n').filter(l => !!l);

  const channels = [];

  for (let current_line = 0; channels.length < PAGE_SIZE && current_line < lines.length; ++current_line) {
    if (!lines[current_line].startsWith('#EXTINF')) {
      continue;
    }

    const parts = lines[current_line].split(',');
    const info = parts[0].trim();
    const name = parts[1].trim().replace(/,/g, '');
    const logo = info.match('tvg-logo="([^"]*)"')[1] || '';
    const url = lines[current_line + 1].replace('\n', '').trim();

    const channel = {
      id: channels.length,
      name,
      logo,
      url
    };

    channels.push(channel);
  }

  return channels;
};
