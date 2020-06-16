import * as path from 'path';
import { rcfg, cfg } from 'common/config';

export const Port = cfg('TV_SERVICE_PORT', 8888);
export const Addr = cfg('TV_SERVICE_ADDR', null);
export const BaseUrl = rcfg('TV_SERVICE_BASE_URL');
export const TranscoderUrl = rcfg('TRANSCODER_URL', '/transcoder/proxy');

const GoogleSheetsEndpoint = 'https://sheets.googleapis.com/v4/spreadsheets';
const GoogleSheetId = '1XDyp6-zvlorSwmcQRizriub2pAleYskmyvrYOyfYXgA';
const GoogleSheetsApiKey = rcfg('GOOGLE_SHEETS_API_KEY');
const GoogleSheetConfigRange = 'Config!H:N';
export const ChannelConfigUrl = `${GoogleSheetsEndpoint}/${GoogleSheetId}/values/${GoogleSheetConfigRange}?key=${GoogleSheetsApiKey}`;

export const MimeMap = {
  default: 'text/plain',
  js: 'text/javascript',
  xml: 'text/xml',
};

export const XstreamCodes = {
  UserAgent: 'IPTVSmarters',
  GetSimpleDataTable: 'get_simple_data_table',
};

