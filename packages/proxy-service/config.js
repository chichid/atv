const { cfg } = require('common/config');

module.exports = {
  ServicePort:  cfg('PROXY_SERVICE_PORT', 6666),
  ProxyUrl:     cfg('PROXY_SERVICE_URL'),
  ProxyUser:    cfg('PROXY_SERVICE_USER'),
  ProxyPass:    cfg('PROXY_SERVICE_PASS'),
};
