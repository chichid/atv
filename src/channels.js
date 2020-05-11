const fs = require('fs');
const { get, writeJson } = require('./utils');
const { JSDOM } = require('jsdom');

let channelGroups = null;

export const reloadChannels = (config) => async (req, res) => {
  channelGroups = null;
  await loadChannels(config);
  res.end();
};

export const loadChannels = async (config) => {
  if (!channelGroups) {
    console.log('[model] loading channels...');
    channelGroups = await loadChannelSelection(config);
  }

  return channelGroups;
};

const loadChannelSelection = async (config) => {
  console.log(`Getting sheet content...`);
  const sheetContent = await get(config.GoogleSheetURL);

  console.log(`Parsing sheet content...`);
  const parsedContent = new JSDOM(sheetContent);
  const { document } = parsedContent.window;

  const groups = parseChannelGroups(config, document);
  const groupsWithSources = await mergeSources(config, groups);

  return groupsWithSources;
};

const parseChannelGroups = (config, document) => {
  const groups = [];
  const sheetMenuItems = document.querySelector('[id="sheet-menu"]').querySelectorAll('li');
  const configurationSheets = config.GoogleSheetConfigSheets.map(s => s.toLowerCase());

  for (const menuItem of sheetMenuItems) {
    const id = menuItem.id.replace('sheet-button-', '');
    const groupName = menuItem.textContent;

    const isChannelsGroup = groupName && configurationSheets.indexOf(groupName.toLowerCase()) === -1;
    if (!isChannelsGroup) {
      continue;
    }

    const channels = parseGroupActiveChannels(config, id, document);

    groups.push({
      id, 
      groupName,
      channels,
    });
  }

  return groups;
};

const parseGroupActiveChannels = (config, groupId, document) => {
  const groupChannels = [];
  const channelRows  = document.querySelectorAll(`[id="${groupId}"] table tr`);

  for (const row of channelRows) {
    const columns = row.querySelectorAll(`td`);
    
    const active = parseChannelActive(config, columns);
    const channelName = parseChannelName(config, columns);
    const logoURL = parseChannelLogo(config, columns);

    if (channelName && active) {
      groupChannels.push({
        channelName,
        logoURL,
      });
    }
  }

  return groupChannels;
};

const parseChannelActive = (config, columns) => {
  return columns[0] && columns[0].innerHTML.indexOf('unchecked') !== -1 ? false : true
};

const parseChannelName = (config, columns) => {
  return (columns[2] && columns[2].textContent) || '';
};

const parseChannelLogo = (config, columns) => {
  return (columns[3] && columns[3].textContent) || '';
};

// TODO this must be moved to the google sheets backend
const mergeSources = async (config, groups) => {
  const m3uLists = await loadM3uLists(config);

  for (const group of groups) {
    for (const channel of group.channels) {
      const m3uSource = await findSource(m3uLists, channel.channelName);

      if (m3uSource) {
        channel.url = m3uSource.url;
      } else {
        console.error(`No sources found for the channel ${channel.channelName}`);
      }
    }
  }

  return groups;
};

const findSource = async (m3uLists, channelName) => m3uLists.find(m3uListItem => 
  m3uListItem.channelName && m3uListItem.channelName.toLowerCase().indexOf(channelName.toLowerCase()) !== -1 ||
  m3uListItem.channelName && channelName.toLowerCase().indexOf(m3uListItem.channelName.toLowerCase()) !== -1 
);

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
    const channelName = parts[1]
      .trim()
      .replace(/,/g, '')
      .replace(/\r/g, '')
      .replace(/\n/g, '')
      .split('|')
      .pop()
      .trim();

    const channel = {
      id: channelName + '_' + channels.length,
      channelName,
      logo,
      group,
      url,
      source,
    };

    channels.push(channel);
  }

  return channels;
};

