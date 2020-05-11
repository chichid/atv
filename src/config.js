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

export const CONFIG = {
  GoogleSheetURL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSH_6xRrqCC6aZ4V7SiorRLJIP_PVvhvbVCrnJht8_7eCYVCU9Dv7TcyV1jm9hVVcRiANA-lIs09Z2I/pubhtml',
  GoogleSheetConfigSheets: ['config', 'sources'],
  GoogleSheetLogoDimensions: '500x500',
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
