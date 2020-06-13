const http = require('http');
const url = require('url');
const request = require('request');
const cfg  = require('./config');

export const startServer = () => {
  const options = getProxyOptions();
  console.log(`[proxy-service] starting proxy service, ${options.protocol}://${options.hostname}:${options.port}`);

  http.createServer((req, res) => handleProxyRequest(req, res, options)).listen(cfg.ServicePort, () => {
    console.log(`[proxy-service] proxy started at ${cfg.ServicePort}`);
  });
};

const getProxyOptions = () => {
  const { protocol, hostname, port } = url.parse(cfg.ProxyUrl);

  return {
    hostname,
    protocol: protocol ? protocol.replace(':', '') : 'http',
    port: port || (protocol === 'https:' ? 443 : 80),
    credentials: 'Basic ' + Buffer.from(`${cfg.ProxyUser}:${cfg.ProxyPass}`).toString('base64'),
  };
};

const handleProxyRequest = (req, res, {protocol, credentials, hostname, port}) => {
  console.log(`[proxy-service] proxying request ${req.url}`);

  const options = {
    host: hostname,
    port: port,
    path: req.url,
    headers: {
      ...req.headers,
      'Proxy-Authorization': credentials,
    },
  };

  http.get(options, (proxyRes) => {
    console.log(`[proxy-service] proxy responded by ${proxyRes.statusCode}, ${req.url}`);
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
};

