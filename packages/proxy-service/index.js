const http = require('http');
const Config = require('./config');

let isInitialized = false;

(() => {
  if (isInitialized) {
    return;
  }

  isInitialized = true;

  http.createServer((req, res) => handleProxyRequest(req, res))
    .listen(Config.ServicePort, () => {
      const proxyOptions = getProxyOptions();
      process.stdout.write(`[proxy-service] proxy started at ${Config.ServicePort} `);
      console.log(proxyOptions);
    });
})();

const handleProxyRequest = (req, res) => {
  console.log(`[proxy-service] transcoderProxy - proxying request ${req.url}`);

  const proxyOptions = getProxyOptions();
  const options = {
    host: proxyOptions.host,
    port: proxyOptions.port,
    path: req.url,
    headers: {
      ...req.headers,
      'Proxy-Authorization': proxyOptions.credentials,
    },
  };

  http.get(options, (proxyRes) => {
    console.log(`[proxy-service] proxy responded by ${proxyRes.statusCode}, ${req.url}`);
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
};

const getProxyOptions = () => ({
  host: Config.RemoteProxyHost,
  port: Config.RemoteProxyPort,
  credentials: 'Basic ' + Buffer.from(Config.RemoteProxyUser + ':' + Config.RemoteProxyPass).toString('base64'),
});
