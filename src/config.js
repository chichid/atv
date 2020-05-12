const path = require('path');

const BaseUrl = process.env.BASE_URL;

const AppleTvBootstraperFolder = '/appletv-bootstraper';

const SSL = {
  Enabled: process.env.USE_SSL === 'true',
  Key: path.join(__dirname, AppleTvBootstraperFolder + '/certificates/kortv.key'),
  Cert: path.join(__dirname, AppleTvBootstraperFolder + '/certificates/kortv.pem'),
};

const MimeMap = {
  default: 'text/plain',
  js: 'text/javascript',
  xml: 'text/xml',
};

const GoogleSheetsEndpoint = 'https://sheets.googleapis.com/v4/spreadsheets';
const GoogleSheetsApiKey = 'AIzaSyCX3P9E6hDiosLJsgHygfDFn3OAIBAUQd0';
const GoogleSheetId = '1XDyp6-zvlorSwmcQRizriub2pAleYskmyvrYOyfYXgA';
const GoogleSheetConfigRange = 'Config!H:K';

export const CONFIG = {
  ChannelConfigUrl: `${GoogleSheetsEndpoint}/${GoogleSheetId}/values/${GoogleSheetConfigRange}?key=${GoogleSheetsApiKey}`,
  AssetsFolder: 'assets',
  AppleTvBootstraperFolder,
  AppleTvAddress: '192.168.2.39',
  M3uDir: path.join(__dirname, '../data/m3u'),
  ChannelList: path.join(__dirname, '../data/channels.json'),
  PiconsDir: path.join(__dirname, '../data/picons'),
  PiconsBaseUrl: 'resource://picons',
  BaseUrl,
  MainTemplate: BaseUrl + '/assets/templates/index.xml',
  Profile: process.env.PROFILE,
  Port: process.env.PORT || (SSL.Enabled ? 443 : 80),
  SSL,
  MimeMap,
};
