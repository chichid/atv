import { rcfg, cfg } from 'common/config';

export const Addr = cfg('PROXY_SERVICE_ADDR', null);
export const ProxyPort = rcfg('PROXY_SERVICE_PORT', 4040);
export const ProxyPathMapping = cfg('PROXY_SERVICE_PATH_MAPPING', '');

