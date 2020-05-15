const { get } = require('./utils');

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

  return [{
    programTitle: 'Program 1',
    programSummary: 'Program 1',
    start: '20:00',
    end: '20:30',
    streamUrl: 'http://www.google.com',
  }, {
    programTitle: 'Title',
    programSummary: 'Program 2',
    start: '20:00',
    end: '20:30',
    streamUrl: 'http://www.google.com',
  }];
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
