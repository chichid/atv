const fs = require('fs');
const https = require('https');
const http = require('http');

module.exports.startServer = (config, app) => {
  const httpFactory = config.SSL.Enabled ? https : http;

  const server = httpFactory.createServer(!config.SSL.Enabled ? null : {
    key: fs.readFileSync(config.SSL.Key),
    cert: fs.readFileSync(config.SSL.Cert),
  }, app);

  server.listen(config.Port, () =>
    console.log(`server started on port ${config.Port} using ${httpFactory === http ? 'http' : 'https'}`)
  );
};
