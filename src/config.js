const fs = require('fs');
const path = require('path');

const BaseUrl = process.env.BASE_URL;
const UseSSL = process.env.USE_SSL === 'true';
const Port = process.env.PORT || (UseSSL ? 443 : 80);
const Profile = process.env.PROFILE;
const GoogleSheetsApiKeyArg = process.env.GOOGLE_SHEETS_API_KEY;
const DevProfile = 'dev';
const ProdProfile = 'prod';

const DevSettingsFile = 'dev-settings.json';
const DevSettings = Profile === DevProfile && fs.existsSync(DevSettingsFile) ? JSON.parse(fs.readFileSync(DevSettingsFile)) : {};

const GoogleSheetsEndpoint = 'https://sheets.googleapis.com/v4/spreadsheets';
const GoogleSheetsApiKey = Profile === ProdProfile ? GoogleSheetsApiKeyArg : DevSettings.GOOGLE_SHEETS_API_KEY;
const GoogleSheetId = '1XDyp6-zvlorSwmcQRizriub2pAleYskmyvrYOyfYXgA';
const GoogleSheetConfigRange = 'Config!H:K';
if (!GoogleSheetsApiKey) {
  console.error('Fatal Error - Config api Key for the google sheets not found');
  process.exit(0);
}

const AppleTvBootstraperFolder = '/appletv-bootstraper';
const SSL = {
  Enabled: UseSSL,
  Key: path.join(__dirname, AppleTvBootstraperFolder + '/certificates/kortv.key'),
  Cert: path.join(__dirname, AppleTvBootstraperFolder + '/certificates/kortv.pem'),
};

const MimeMap = {
  default: 'text/plain',
  js: 'text/javascript',
  xml: 'text/xml',
};

export const CONFIG = {
  ChannelConfigUrl: `${GoogleSheetsEndpoint}/${GoogleSheetId}/values/${GoogleSheetConfigRange}?key=${GoogleSheetsApiKey}`,
  AssetsFolder: 'assets',
  AppleTvBootstraperFolder,
  AppleTvAddress: '192.168.2.39',
  BaseUrl,
  MainTemplate: BaseUrl + '/assets/templates/index.xml',
  EpgTemplatePath: '/assets/templates/epg.xml',
  Profile,
  Port,
  SSL,
  MimeMap,
};
