const fs = require('fs');
const path = require('path');

const DevProfile = 'dev';
const ProdProfile = 'prod';
const Profile = process.env.PROFILE;
const SettingsFile = '../../settings.json';
const Settings = fs.existsSync(SettingsFile) ? JSON.parse(fs.readFileSync(SettingsFile)) : {};

const config = (key, defaultValue) => {
  let settingValue = process.env[key] || Settings[key] || null;

  if (typeof settingValue === 'string' && settingValue.startsWith('$')) {
    settingValue = process.env[settingValue.replace('$', '')];
  }

  const value = settingValue || defaultValue;
  console.log(`[common/config] ${key} = ${value}`)

  return value;
};

module.exports.Settings = Settings;
module.exports.cfg = config;

const UseSSL = process.env.USE_SSL === 'true' || Settings.USE_SSL;
const Addr = process.env.OPENSHIFT_NODEJS_IP || process.env.ADDR || Settings.Addr;
const Port = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || Settings.Port || (UseSSL ? 443 : 80);
const BaseUrl = process.env.BASE_URL || Settings.BASE_URL;
const AppleTvBootstraperFolder = '../appletv-bootstraper';
const SSL = {
  Enabled: UseSSL,
  Key: path.join(__dirname, AppleTvBootstraperFolder + '/certificates/kortv.key'),
  Cert: path.join(__dirname, AppleTvBootstraperFolder + '/certificates/kortv.pem'),
};

const GoogleSheetsEndpoint = 'https://sheets.googleapis.com/v4/spreadsheets';
const GoogleSheetsApiKey = process.env.GOOGLE_SHEETS_API_KEY || Settings.GOOGLE_SHEETS_API_KEY;
const GoogleSheetId = '1XDyp6-zvlorSwmcQRizriub2pAleYskmyvrYOyfYXgA';
const GoogleSheetConfigRange = 'Config!H:N';
if (!GoogleSheetsApiKey) {
  console.warn('[warning] - Config api Key for the google sheets not found, this is necessary for the channels API');
}

const MimeMap = {
  default: 'text/plain',
  js: 'text/javascript',
  xml: 'text/xml',
};

const XstreamCodes = {
  UserAgent: 'IPTVSmarters',
  GetSimpleDataTable: 'get_simple_data_table',
};

module.exports.CONFIG = {
  ChannelConfigUrl: `${GoogleSheetsEndpoint}/${GoogleSheetId}/values/${GoogleSheetConfigRange}?key=${GoogleSheetsApiKey}`,
  AssetsFolder: 'assets',
  AppleTvBootstraperFolder,
  BaseUrl,
  MainTemplate: BaseUrl + '/assets/index.xml',
  EpgTemplatePath: '/assets/epg.xml',
  Profile,
  Addr,
  Port,
  SSL,
  MimeMap,
  XstreamCodes,
};

if (Profile === ProdProfile) {
  console.log(module.exports.CONFIG);
}
