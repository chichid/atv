const { get, post, decodeBase64 } = require('common/utils');
const { CONFIG } = require('common/config');

module.exports.reloadChannels = (config) => async (req, res) => {
  console.log('[model] reloading channels...');
  await loadChannels(config);
  res.end();
};

module.exports.loadChannels = async (config, path, query) => {
  console.log('[model] loading channels...');
  const channelConfig = await get(config.ChannelConfigUrl);

  const groups = parseChannelGroups(channelConfig);
  const epgPrograms = path === config.EpgTemplatePath ? await loadEPGPrograms(config, query, groups) : {};

  return { groups, epgPrograms };
};

const loadEPGPrograms = async (config, query, channelGroups) => {
  const { epgChannel } = query;

  if (!epgChannel) {
    console.warn('[model] No epgChannel provided to loadEPGPrograms');
    return [];
  }

  let channel = null;

  Object.keys(channelGroups).some(k => channelGroups[k].channels.some(c => {
    if (c.channelName && c.channelName.toLowerCase() === epgChannel.toLowerCase()) {
      channel = c;
      return true;
    }
  }));

  if (!channel) {
    console.warn(`[channels] No EPG channel found for ${epgChannel}`);
    return [];
  }

  if (!channel.timeshiftURL) {
    console.warn(`[channels] Channel ${epgChannel} doesn't offer EPG`);
    return [];
  }

  const { epgListings, baseURL, username, password, streamId } = await getSimpleDataTable(config, channel.timeshiftURL);

  if (!epgListings) {
    console.warn(`[channels] Channel ${epgChannel} did not return any listings`);
    return [];
  }

  const listingsByKey = {};

  epgListings
    .filter(dt => dt.has_archive === 1)
    .sort((a, b) => b.start_timestamp - a.start_timestamp)
    .forEach(dt => {
      const programTitle = decodeBase64(dt.title);
      const key = `${programTitle}-${dt.start}-${dt.end}`;
      const duration = dt.stop_timestamp - dt.start_timestamp;

      const d = new Date(dt.start);
      const e = new Date(dt.end);
      const day = `${padDate(d.getMonth() + 1)}/${padDate(d.getDate())}`;
      const start = `${d.getHours() + channel.epgDisplayShift}:${padDate(d.getMinutes())}`;
      const end = `${e.getHours() + channel.epgDisplayShift}:${padDate(e.getMinutes())}`;

      const urlComponentDate = `${d.getFullYear()}-${padDate(d.getMonth() + 1)}-${padDate(d.getDate())}`;
      const urlComponentTime = `${padDate(d.getHours() + channel.epgShift)}-${padDate(d.getMinutes())}`;
      const dateUrlComponent = `${urlComponentDate}:${urlComponentTime}`;

      // TODO extension .ts is hardcoded, fix
      const streamURL = `${baseURL}/timeshift/${username}/${password}/${Math.floor(duration / 60)}/${dateUrlComponent}/${streamId}.ts`;

      listingsByKey[key] = {
        key,
        programTitle,
        programSummary: decodeBase64(dt.description),
        day,
        start,
        end,
        duration,
        streamURL: `${transcoderURL}/${encodeURIComponent(streamURL)}`,
      };
    });

  return Object.keys(listingsByKey).map(k => listingsByKey[k]);
};

const padDate = (n) => {
  const width = 2;
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
};

const getSimpleDataTable = async (config, timeshiftURL) => {
  const urlParts = timeshiftURL.split('/');
  const baseURL = urlParts[0] + '//' + urlParts[2].split(':')[0];
  const username = urlParts[4];
  const password = urlParts[5];
  const streamId = urlParts[6].replace('.m3u8', '').replace('.ts', '');

  const postData = {
    username,
    password,
    action: config.XstreamCodes.GetSimpleDataTable,
    stream_id: streamId
  };

  const response = await post(baseURL + '/player_api.php', postData, {
    'User-Agent': config.XstreamCodes.UserAgent,
  });

  return {
    epgListings: response.epg_listings,
    baseURL,
    username,
    password,
    streamId
  };
};

const parseChannelGroups = (channelConfig) => {
  const transcoderURL = CONFIG.Transcoder.BaseUrl;
  const columns = channelConfig.values[0];
  const columnIndex = {};
  for (let i = 0; i < columns.length; ++i) {
    columnIndex[columns[i].toUpperCase()] = i;
  }

  const channels = [];
  const channelData = channelConfig.values.slice(1);
  for (const cfg of channelData) {
    const groupName = cfg[columnIndex.GROUPE];
    const channelName = cfg[columnIndex.CHANNEL];
    const channelNameEncoded = encodeURIComponent(cfg[columnIndex.CHANNEL]);
    const logoURL = cfg[columnIndex.LOGOURL];
    const streamURL = cfg[columnIndex.STREAMURL];
    const timeshiftURL = cfg[columnIndex.TIMESHIFTURL];
    const epgShift = Number(cfg[columnIndex.EPGSHIFT] || 0);
    const epgDisplayShift = Number(cfg[columnIndex.EPGDISPLAYSHIFT] || 0);

    channels.push({
      groupName,
      channelName,
      channelNameEncoded,
      logoURL,
      streamURL: `${transcoderURL}/${encodeURIComponent(streamURL)}`,
      timeshiftURL,
      epgShift,
      epgDisplayShift,
    });
  }

  const channelsByGroupName = channels.reduce((groups, channel) => {
    if (!groups[channel.groupName]) {
      groups[channel.groupName] = {
        groupName: channel.groupName,
        channels: [],
      };
    }

    groups[channel.groupName].channels.push(channel);

    return groups;
  }, {});

  return channelsByGroupName;
};
