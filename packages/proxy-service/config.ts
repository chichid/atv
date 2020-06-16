import * as path from 'path';
import { cfg } from 'common/config';

export const UseSSL = cfg('USE_SSL', false);
export const Addr = cfg('PROXY_SERVICE_ADDR', null);
export const ServicePort = cfg('PROXY_SERVICE_PORT', (UseSSL ? 443 : 80));
export const PortMapping = cfg('PROXY_SERVICE_PATH_MAPPING', '');

export const SSL = {
  Enabled: UseSSL,
  Key: path.join(__dirname, '../appletv-bootstrapper/certificates/kortv.key'),
  Cert: path.join(__dirname, '../appletv-bootstrapper/certificates/kortv.pem'),
};
