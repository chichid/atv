const { cfg } = require('common/config');

export const Config = {
  Port: cfg('LOGO_SERVICE_PORT', 7891),
};
