import { rcfg, cfg } from 'common/config';

export const Port = cfg('TV_SERVICE_PORT', 8888);
export const Addr = cfg('TV_SERVICE_ADDR', null);
export const TranscoderUrl = rcfg('TRANSCODER_URL', '/transcoder/proxy');
export const IptvHttpProxy = rcfg('IPTV_HTTP_PROXY', process.env.IPTV_HTTP_PROXY);
export const DefaultPageSize = 25;
export const ClientSideTemplateTag = '<!-- CLIENT_SIDE_TEMPLATE -->';

const GoogleSheetsEndpoint = rcfg('TV_SERVICE_GOOGLE_SHEET_ENDPOINT');
export const GoogleSheetActions = {
  GetSources: GoogleSheetsEndpoint + '?action=getSources',
  GetChannelGroups: GoogleSheetsEndpoint + '?action=getChannelGroups',
};

export const MimeMap = {
  default: 'text/plain',
  js: 'text/javascript',
  xml: 'text/xml',
  html: 'text/html',
};

export const XstreamCodes = {
  UserAgent: 'IPTVSmarters',
  GetSimpleDataTable: 'get_simple_data_table',
};

