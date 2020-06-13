const { Settings } = require('common/config');

module.exports = {
  ServicePort: process.env.PROXY_SERVICE_PORT || Settings.PROXY_SERVICE_PORT || 6668,
  RemoteProxyHost: process.env.PROXY_HOST || Settings.TRANSCODER_PROXY_HOST,
  RemoteProxyPort: process.env.PROXY_PORT || Settings.TRANSCODER_PROXY_PORT,
  RemoteProxyUser: process.env.PROXY_USER || Settings.TRANSCODER_PROXY_USER,
  RemoteProxyPass: process.env.PROXY_PASS || Settings.TRANSCODER_PROXY_PASS,
};
