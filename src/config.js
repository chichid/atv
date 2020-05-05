const path = require('path');

const SSL = {
  Enabled: !!process.env.USE_SSL,
  Key: path.join(__dirname, '/assets/certificates/kortv.key'),
  Cert: path.join(__dirname, '/assets/certificates/kortv.pem'),
};

const MimeMap = {
  default: 'text/plain',
  js: 'text/javascript',
  xml: 'text/xml',
};

export const CONFIG = {
  AssetsFolder: 'assets',
  AppleTvAddress: '192.168.2.39',
  M3uDir: path.join(__dirname, '/config/m3u'),
  BaseUrl: process.env.BASE_URL,
  Profile: process.env.PROFILE,
  Port: process.env.PORT || (SSL.Enabled ? 443 : 80),
  SSL,
  MimeMap,
};
