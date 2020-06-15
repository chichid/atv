const { cfg } = require('common/config');

export const ServicePort = cfg('PROXY_SERVICE_PORT', 6666);
export const PortMapping = cfg('PROXY_SERVICE_PATH_MAPPING', '');
