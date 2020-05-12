const { get } = require('./utils');

export const reloadChannels = (config) => async (req, res) => {
  console.log('[model] reloading channels...');
  await loadChannels(config);
  res.end();
};

export const loadChannels = async (config) => {
  console.log('[model] loading channels...');
  const channelGroups = await loadChannelSelection(config);
  return channelGroups;
};

const loadChannelSelection = async (config) => {
  const rawSheetData = await get(config.ChannelConfigUrl);
  const channelConfig = JSON.parse(rawSheetData);
  return parseChannelGroups(channelConfig);
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
