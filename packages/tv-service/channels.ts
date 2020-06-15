const { get, postForm, decodeBase64 } = require('common/utils');
const Config = require('./config');

const cache = {
  groups: null,
  channels: null,
};

export const reloadChannels = async (req, res) => {
  console.log('[tv-service] reloading channels...');
  delete cache.groups;
  await fetchAllChannels();
};

export const getChannels = async (req, res) => {
  console.log('[tv-service] loading all channels...');
  const groups = await fetchAllChannels();
  res.json(groups);
};

export const getChannelConfig = async (req, res) => {
  res.json(Config);
};

export const getChannelDetails = async (req, res) => {
  const channelName = req.params.channelName;
  console.log(`[tv-service] channels - loading channel details ${channelName}`);
  
  if (!cache.channels) {
    await fetchAllChannels();
  }

  const channel = cache.channels.find(
    ({ channelName:cn }) => cn && cn.toLowerCase() === channelName.toLowerCase()
  );

  if (!channel) {
    console.warn(`[tv-service] channels - channel ${channelName} not found`);
    res.status(404);
    return;
  }

  const epgPrograms = await fetchEPG(channel);
  res.json({ ...channel, epgPrograms });
};

const fetchAllChannels = async () => {
  const channelConfig = await get(Config.ChannelConfigUrl);
  const { groups, channels } = parseChannelGroups(channelConfig);

  cache.groups = groups;
  cache.channels = channels;

  return groups;
};

const fetchEPG = async (channel) => {
  if (!channel.timeshiftURL) {
    console.warn(`[tv-service] channel ${channel.channelName} doesn't offer EPG`);
    return [];
  }

  const { epgListings, baseURL, username, password, streamId } = await getSimpleDataTable(channel.timeshiftURL);

  if (!epgListings) {
    console.warn(`[channels] channel ${channel.channelName} did not return any listings`);
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
        streamURL: `${Config.TranscoderURL}/${encodeURIComponent(streamURL)}`,
      };
    });

  return Object.keys(listingsByKey).map(k => listingsByKey[k]);
};

const padDate = (n) => {
  const width = 2;
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
};

const getSimpleDataTable = async (timeshiftURL) => {
  const urlParts = timeshiftURL.split('/');
  const baseURL = urlParts[0] + '//' + urlParts[2].split(':')[0];
  const username = urlParts[4];
  const password = urlParts[5];
  const streamId = urlParts[6].replace('.m3u8', '').replace('.ts', '');

  const postData = {
    username,
    password,
    action: Config.XstreamCodes.GetSimpleDataTable,
    stream_id: streamId
  };

  const response = await postForm(baseURL + '/player_api.php', postData, {
    'User-Agent': Config.XstreamCodes.UserAgent,
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
  const columns = channelConfig.values[0];
  const columnIndex = {};
  for (let i = 0; i < columns.length; ++i) {
    columnIndex[columns[i].toUpperCase()] = i;
  }

  const channels = [];
  const channelData = channelConfig.values.slice(1);
  for (const cfg of channelData) {
    const groupName = cfg[columnIndex['GROUPE']];
    const channelName = cfg[columnIndex['CHANNEL']];
    const channelNameEncoded = encodeURIComponent(cfg[columnIndex['CHANNEL']]);
    const logoURL = cfg[columnIndex['LOGOURL']];
    const streamURL = cfg[columnIndex['STREAMURL']];
    const timeshiftURL = cfg[columnIndex['TIMESHIFTURL']];
    const epgShift = Number(cfg[columnIndex['EPGSHIFT']] || 0);
    const epgDisplayShift = Number(cfg[columnIndex['EPGDISPLAYSHIFT']] || 0);

    channels.push({
      groupName,
      channelName,
      channelNameEncoded,
      logoURL,
      streamURL: `${Config.TranscoderUrl}/${encodeURIComponent(streamURL)}`,
      timeshiftURL,
      epgShift,
      epgDisplayShift,
      links: {
        'detail': `/channels/${channelNameEncoded}`,
      } 
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

  return { channels, groups: Object.keys(channelsByGroupName).map(k => channelsByGroupName[k])};
};
