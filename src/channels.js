const { get } = require('./utils');
const { JSDOM } = require('jsdom');

export const reloadChannels = (config) => async (req, res) => {
  console.log('[model] reloading channels...');
  // TODO perform any caching here
  await loadChannels(config);
  res.end();
};

export const loadChannels = async (config) => {
  console.log('[model] loading channels...');
  const channelGroups = await loadChannelSelection(config);
  return channelGroups;
};

const loadChannelSelection = async (config) => {
  console.log('Getting sheet content...');
  const sheetContent = await get(config.GoogleSheetURL);

  console.log('Parsing sheet content...');
  const parsedContent = new JSDOM(sheetContent);
  const { document } = parsedContent.window;

  return parseChannelGroups(config, document);
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
  const channelRows = document.querySelectorAll(`[id="${groupId}"] table tr`);

  for (const row of channelRows) {
    const columns = row.querySelectorAll('td');

    const active = parseChannelActive(config, columns);
    const channelName = parseChannelName(config, columns);
    const logoURL = parseChannelLogo(config, columns);
    const url = parseChannelM3u8Url(config, columns);

    if (channelName && active) {
      groupChannels.push({
        channelName,
        logoURL,
        url,
      });
    }
  }

  return groupChannels;
};

const parseChannelActive = (config, columns) => {
  return !(columns[0] && columns[0].innerHTML.indexOf('unchecked') !== -1);
};

const parseChannelName = (config, columns) => {
  return (columns[2] && columns[2].textContent) || '';
};

const parseChannelLogo = (config, columns) => {
  return (columns[3] && columns[3].textContent) || '';
};

const parseChannelM3u8Url = (config, columns) => {
  return (columns[4] && columns[4].textContent) || '';
};
