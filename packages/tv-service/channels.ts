import { get, postForm, decodeBase64 } from 'common/utils';
import * as Config from './config';
import { ChannelPayload, ChannelGroupPayload, Group, Channel, EpgProgram } from './model';

const cache = {
  groups: null,
  channels: null,
}

export const reloadChannels = async (req, res) => {
  console.log('[tv-service] reloading channels...');
  delete cache.groups;
  delete cache.channels;
  const { groups } = await fetchAllChannels();
  res.json(groups);
};

export const getChannels = async (req, res) => {
  console.log('[tv-service] getChannels waking up the transcoder...');
  get(`${Config.TranscoderUrl}/ping`);

  console.log('[tv-service] loading all channels...');
  const { groups } = await fetchAllChannels();
  res.json(groups);
};

export const getChannelDetails = async (req, res) => {
  const channelName = req.params.channelName;
  console.log(`[tv-service] channels - loading channel details ${channelName}`);
  
  const { channels } = await fetchAllChannels();

  const channel = channels.find(
    ({ name }) => name.toLowerCase() === channelName.toLowerCase()
  );

  if (!channel) {
    console.warn(`[tv-service] channels - channel ${channelName} not found`);
    res.status(404);
    res.end(`Channel ${channelName} Not Found`);
    return;
  }

  const epgPrograms = await fetchEPG(channel);
  res.json({ ...channel, epgPrograms });
};

const fetchAllChannels = async (): Promise<{ groups: Group[], channels: Channel[] }> => {
  if (cache.groups) {
    console.log(`[tv-service] returning channel groups form cache`);
    return {
      groups: cache.groups,
      channels: cache.channels,
    };
  }

  console.log(`[tv-service] calling GetChannelGroups...`);
  let channels = [];
  const groupsResponse = await get(Config.GoogleSheetActions.GetChannelGroups) as ChannelGroupPayload[];

  const groups = groupsResponse.map(groupPayload => {
    const group = {
      groupName: groupPayload.groupName,
      channels: groupPayload.channels.map(mapChannel),
    };

    channels = [...channels, ...group.channels];

    return group;
  });

  cache.channels = channels;
  cache.groups = groups;

  return {
    groups,
    channels,
  };
};

const mapChannel = (payload: ChannelPayload): Channel => {
  return {
    id: encodeURIComponent(payload.Channel),
    name: payload.Channel,
    logoUrl: payload.LogoUrl,
    streamUrl: `${Config.TranscoderUrl}/transcoder/live/${encodeURIComponent(payload.StreamUrl)}`,
    timeshiftUrl: payload.TimeshiftUrl,
    epgShift: Number(payload.EpgShift),
    epgDisplayShift: Number(payload.EpgDisplayShift),
  };
}

const fetchEPG = async (channel: Channel): Promise<EpgProgram[]> => {
  if (!process.env.http_proxy) { 
    throw new Error(`[tv-service] http_proxy not provided, this service needs the proxy set`);
  }

  if (!channel.timeshiftUrl) {
    console.warn(`[tv-service] channel ${channel.name} doesn't offer EPG`);
    return [];
  }

  const { epgListings, baseURL, username, password, streamId } = await getSimpleDataTable(channel.timeshiftUrl);

  if (!epgListings) {
    console.warn(`[channels] channel ${channel.name} did not return any listings`);
    return [];
  }

  const listingsByKey: { [key: string]: EpgProgram } = {};

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
      const streamUrl = `${baseURL}/timeshift/${username}/${password}/${Math.floor(duration / 60)}/${dateUrlComponent}/${streamId}.ts`;

      listingsByKey[key] = {
        key,
        programTitle,
        programSummary: decodeBase64(dt.description),
        day,
        start,
        end,
        duration,
        streamUrl: `${Config.TranscoderUrl}/transcoder/vod/${encodeURIComponent(streamUrl)}`,
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

