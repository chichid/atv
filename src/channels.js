const { get, post, decodeBase64 } = require('./utils');

export const reloadChannels = (config) => async (req, res) => {
  console.log('[model] reloading channels...');
  await loadChannels(config);
  res.end();
};

export const loadChannels = async (config, path, query) => {
  console.log('[model] loading channels...');
  const rawSheetData = await get(config.ChannelConfigUrl);
  const channelConfig = JSON.parse(rawSheetData);

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
    console.warn(`No EPG found for the channel ${epgChannel}`);
    return [];
  }

  const { epgListings, baseURL, username, password, streamId } = await getSimpleDataTable(config, channel);

  return epgListings
    .filter(dt => dt.has_archive === 1)
    .sort((a, b) => b.start_timestamp - a.start_timestamp)
    .map(dt => {
      const duration = dt.stop_timestamp - dt.start_timestamp;
      const d = new Date(dt.start);
      const dateUrlComponent = `${d.getFullYear()}-${padDate(d.getMonth() + 1)}-${padDate(d.getDate())}:${padDate(d.getHours())}-${padDate(d.getMinutes())}`;

      return {
        programTitle: decodeBase64(dt.title),
        programSummary: decodeBase64(dt.description),
        start: dt.start,
        end: dt.end,
        duration,
        streamURL: `${baseURL}/timeshift/${username}/${password}/${Math.floor(duration / 60)}/${dateUrlComponent}/${streamId}.m3u8`,
      };
    });
};

const padDate = (n) => {
  const width = 2;
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
};

const getSimpleDataTable = async (config, channel) => {
  // TODO  a cleaner way of doing this is by getting it from the channel from the backend
  const urlParts = channel.streamURL.split('/');
  const baseURL = urlParts[0] + '//' + urlParts[2].split(':')[0];
  const username = urlParts[4];
  const password = urlParts[5];
  const streamId = urlParts[6].replace('.m3u8', '');

  const postData = {
    username,
    password,
    action: config.XstreamCodes.GetSimpleDataTable,
    stream_id: streamId
  };

  const rawPostResponse = await post(baseURL + '/player_api.php', postData, {
    'User-Agent': config.XStreamCodes,
  });

  const parsedResponse = JSON.parse(rawPostResponse);
  return {
    epgListings: parsedResponse.epg_listings,
    baseURL,
    username,
    password,
    streamId
  };
};

const parseChannelGroups = (channelConfig) => {
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

    channels.push({
      groupName,
      channelName,
      channelNameEncoded,
      logoURL,
      streamURL,
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
