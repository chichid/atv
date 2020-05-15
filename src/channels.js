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
  let channel = null;

  Object.keys(channelGroups).some(k => channelGroups[k].channels.some( c => {
    if (c.channelName && c.channelName.toLowerCase() === epgChannel.toLowerCase()) {
      channel = c;
      return true;
    }
  }));

  if (!channel) {
    console.warn(`No EPG found for the channel ${epgChannel}`);
    return [];
  }
  
  const simpleDataTable = await getSimpleDataTable(config, channel);

  return simpleDataTable.epgListings
    .sort((a, b) => b.start_timestamp- a.start_timestamp)
    .map(dt => ({
      programTitle: decodeBase64(dt.title),
      programSummary: decodeBase64(dt.description),
      start: dt.start,
      end: dt.end,
      duration: dt.end_timestamp - dt.start_timestamp,
      streamUrl: 'http://www.google.com',
    }));
};

const getSimpleDataTable = async (config, channel) => {
  // TODO  a cleaner way of doing this is by getting it from the channel from the backend
  const urlParts = channel.streamURL.split('/');
  const baseURL = urlParts[0] + '//' + urlParts[2].split(':')[0] + '/' + 'player_api.php';
  const username = urlParts[4];
  const password = urlParts[5];
  const streamId = urlParts[6].replace('.m3u8', '');
  
  const postData =  {
    username,
    password,
    action: config.XstreamCodes.GetSimpleDataTable,
    stream_id: streamId 
  };

  const rawPostResponse = await post(baseURL, postData, {
    'User-Agent': config.XStreamCodes,
  });

  const parsedResponse = JSON.parse(rawPostResponse);
  return {
    epgListings: parsedResponse.epg_listings,
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
    const logoURL = cfg[columnIndex.LOGOURL];
    const streamURL = cfg[columnIndex.STREAMURL];

    channels.push({
      groupName,
      channelName,
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
