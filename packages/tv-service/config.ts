import * as path from 'path';
import { rcfg, cfg } from 'common/config';

export const UseSSL = cfg('USE_SSL', false);
export const Addr = cfg('TV_SERVICE_ADDR', null);
export const Port = cfg('TV_SERVICE_PORT', UseSSL ? 443 : 80);
export const BaseUrl = rcfg('TV_SERVICE_BASE_URL');
export const TranscoderUrl = rcfg('TRANSCODER_URL');

const GoogleSheetsEndpoint = 'https://sheets.googleapis.com/v4/spreadsheets';
const GoogleSheetId = '1XDyp6-zvlorSwmcQRizriub2pAleYskmyvrYOyfYXgA';
const GoogleSheetsApiKey = rcfg('GOOGLE_SHEETS_API_KEY');
const GoogleSheetConfigRange = 'Config!H:N';
export const ChannelConfigUrl = `${GoogleSheetsEndpoint}/${GoogleSheetId}/values/${GoogleSheetConfigRange}?key=${GoogleSheetsApiKey}`;

export const SSL = {
  Enabled: cfg('USE_SSL', false),
  Key: path.join(__dirname, '../appletv-bootstrapper/certificates/kortv.key'),
  Cert: path.join(__dirname, '../appletv-bootstrapper/certificates/kortv.pem'),
};

export const MimeMap = {
  default: 'text/plain',
  js: 'text/javascript',
  xml: 'text/xml',
};

export const XstreamCodes = {
  UserAgent: 'IPTVSmarters',
  GetSimpleDataTable: 'get_simple_data_table',
};

