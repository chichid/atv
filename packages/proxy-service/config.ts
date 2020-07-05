import { cfg } from 'common/config';

export const Addr = cfg('PROXY_SERVICE_ADDR', null);
export const ServicePort = cfg('PROXY_SERVICE_PORT');
export const PortMapping = cfg('PROXY_SERVICE_PATH_MAPPING', '');

