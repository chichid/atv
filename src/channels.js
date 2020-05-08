const fs = require('fs');
const { get, writeJson } = require('./utils');

let allChannels = null;

export const reloadChannels = (config) => async (req, res) => {
  allChannels = null;
  await loadChannels(config);
  res.end();
};

export const putSelectionChannel = (config) => async (req, res) => {
  const channel = req.body;
  try {
    const updatedChannelSelection = await addChannelSelection(config, channel);
    res.type('json');
    res.json(updatedChannelSelection);
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end(e.message);
  }
};

export const loadChannels = async (config) => {
  if (!allChannels) {
    console.log('[model] loading channels...');
    const m3uChannels = await loadM3uLists(config);
    const filteredChannels = await filterChannels(config, m3uChannels);
    allChannels = await groupChannels(config, filteredChannels);
    console.log('[model] channels loaded successfully.');
  }

  return allChannels;
};

const filterChannels = async (config, channels) => {
  const { channelSelection } = await readChannelSelection(config);

  const channelSources = channelSelection.flatMap(group => group.channels.map(channel => {
    const isSource = (sc, nameAlternative) => sc.name
      .toLowerCase()
      .indexOf(nameAlternative.toLowerCase()) !== -1;

    const sources = channels.filter(sc =>
      isSource(sc, channel.name) ||
      (channel.alternateNames && channel.alternateNames.some(na => isSource(sc, na)))
    );

    if (sources.length > 0) {
      // TODO this is the right spot to introduce some preferred source setting
      const alternativeSources = sources.slice(1);

      return {
        ...sources[0],
        name: channel.name.trim(),
        logo: channel.logo || sources[0].logo || '',
        groupName: group.groupName,
        alternativeUrls: alternativeSources.map(s => s.url),
        alternativeLogos: alternativeSources.map(s => s.logo),
      };
    } else {
      console.warn(`[channels] channel ${channel.name} doesn't have any sources`);
      return null;
    }
  }));

  return channelSources.filter(c => c !== null);
};

const groupChannels = async (config, channels) => {
  // TODO implement channel deduplication and grouping
  // For example the same channel coming from different m3us must not be listed multiple times
  const groups = channels.reduce((acc, channel) => {
    if (!acc[channel.groupName]) {
      acc[channel.groupName] = [channel];
    } else {
      acc[channel.groupName].push(channel);
    }

    return acc;
  }, {});

  return Object.keys(groups).map(groupName => ({
    groupName,
    channels: groups[groupName],
  }));
};

const loadM3uLists = async (config) => {
  let channels = [];
  const m3uFiles = fs.readdirSync(config.M3uDir);

  for (const m3uSource of m3uFiles) {
    const source = m3uSource.indexOf('://') !== -1 ? m3uSource : 'file://' + config.M3uDir + '/' + m3uSource;
    console.log('[model] loadChannels, adding m3u source ' + source + '...');

    const m3uChannels = await readM3u(source);
    channels = [...channels, ...m3uChannels];
  }

  return channels;
};

const readM3u = async (source) => {
  const m3u = await get(source);
  const lines = m3u.split('\n').filter(l => !!l);

  const channels = [];

  for (let current_line = 0; current_line < lines.length; ++current_line) {
    if (!lines[current_line].startsWith('#EXTINF')) {
      continue;
    }

    const line = lines[current_line];
    const parts = line.split(',');
    const logo = line.match('tvg-logo="([^"]*)"')[1] || '';
    const group = line.match('group-title="([^"]*)"')[1] || '';
    const url = lines[current_line + 1]
      .replace('\n', '')
      .trim();
    const name = parts[1]
      .trim()
      .replace(/,/g, '')
      .replace(/\r/g, '')
      .replace(/\n/g, '')
      .split('|')
      .pop()
      .trim();

    const channel = {
      id: name + '_' + channels.length,
      name,
      logo,
      group,
      url,
      source,
    };

    channels.push(channel);
  }

  return channels;
};

const readChannelSelection = async (config) => {
  const channelsSelection = await get('file://' + config.ChannelList);
  return JSON.parse(channelsSelection);
};

const addChannelSelection = async (config, { groupId, channelName, alternateNames }) => {
  const payloadAlternateNames = alternateNames || [];
  const channels = await readChannelSelection(config);
  const { channelSelection } = channels;

  const updatedSelection = [...channelSelection];
  const group = updatedSelection.find(g => g.id === groupId);

  if (!group) {
    throw new Error(`Group not found ${groupId}`);
  } else {
    if (!group.channels) {
      group.channels = [];
    }

    const channelNames = [channelName, ...payloadAlternateNames].map(c => c.toLowerCase());

    const channel = group.channels.find(c =>
      channelNames.indexOf(c.name.toLowerCase()) !== -1 ||
      (c.alternateNames && channelNames.some(cn => c.alternateNames.some(an => cn.toLowerCase() === an.toLowerCase())))
    );

    if (channel) {
      const updatedAlternateNames = channel.alternateNames || [];
      const capitalizeWord = w => w[0].toUpperCase() + w.slice(1).toLowerCase();
      const capitalize = c => c.split(' ').map(capitalizeWord).join(' ');

      const alternateNameSet = new Set([
        capitalize(channel.name),
        ...updatedAlternateNames.map(capitalize),
        ...channelNames.map(capitalize)
      ]);

      channel.alternateNames = [...alternateNameSet].slice(1);
    } else {
      group.channels.push({
        name: channelName,
        alternateNames
      });
    }
  }

  const updatedChannels = {
    ...channels,
    channelSelection: updatedSelection,
  };

  writeJson(config.ChannelList, updatedChannels);

  return updatedSelection;
};
