import { rcfg, cfg } from 'common/config';

export const IptvHttpProxy = rcfg('IPTV_HTTP_PROXY', process.env.IPTV_HTTP_PROXY);
export const Port = cfg('TV_SERVICE_PORT', 8888);
export const Addr = cfg('TV_SERVICE_ADDR', null);
export const TranscoderUrl = rcfg('TRANSCODER_URL');
export const AppleTvRedirectedApp = rcfg('TV_SERVICE_REDIRECTED_APP', 'https://kortv.com');
export const DefaultPageSize = 25;
export const ClientSideTemplateTag = '<!-- CLIENT_SIDE_TEMPLATE -->';
export const YoutubeUrlPrefix = cfg('YOUTUBE_URL_PREFIX', 'https://www.youtube.com/embed/'); 

export const MimeMap = {
  default: 'text/plain',
  js: 'text/javascript',
  xml: 'text/xml',
  html: 'text/html',
};

const GoogleSheetsEndpoint = rcfg('TV_SERVICE_GOOGLE_SHEET_ENDPOINT');
export const GoogleSheetActions = {
  GetSources: GoogleSheetsEndpoint + '?action=getSources',
  GetChannelGroups: GoogleSheetsEndpoint + '?action=getChannelGroups',
};

export const XstreamCodes = {
  UserAgent: 'IPTVSmarters',
  GetSimpleDataTable: 'get_simple_data_table',
  DefaultVodType: 'movies',
  GetVodInfo: 'get_vod_info',
};

export const Tmdb = {
  Endpoint: cfg('TV_SERVICE_TMDB_ENDPOINT', 'https://api.themoviedb.org/3'),
  ApiKey: rcfg('TV_SERVICE_TMDB_API_KEY'),
  Language: cfg('TV_SERVICE_TMDB_LANGUAGE', 'FR'),
  TypeTrailer: 'Trailer',
  SiteYoutube: 'Youtube',
};

