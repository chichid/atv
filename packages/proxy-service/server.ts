import * as http from 'http';
import * as httpProxy from 'http-proxy';
import * as Config from './config';

export const startServer = () => {
  createServer().listen(Config.ServicePort, () => {
    console.log(`[proxy-service] proxy started at ${Config.ServicePort}`);
  });
};

const createServer = () => {
  console.log(`[tv-service] creating server ...`);

  const proxy = httpProxy.createProxyServer({}); 
  const pathMap = parsePathMapConfig();

  return http.createServer(proxyRequestHandler(proxy, pathMap));
};

const proxyRequestHandler = (proxy, pathMap) => (req, res) => {
  const path: string = '/' + req.url.split('/')[1];
  const pathConfig = pathMap[path];

  if (pathConfig) {
    console.log(`[proxy-service] proxy request ${req.url} to ${pathConfig.target}${req.url}`);
    try {
      proxy.web(req, res, {
        target: pathConfig.target,
        xfwd: true,
      });
    } catch(e) {
      console.error(`[proxy-service] unable to proxy request ${req.url}, error: ${e.message}`);
      res.writeHead(500);
      res.end(`[proxy-service] Unable to proxy request`);
    }
  } else {
    res.writeHead(404);
    res.end(`${path} not found`);
  }
};

const parsePathMapConfig = () => {
  const lines = Config.PortMapping instanceof Array ? Config.PortMapping : Config.PortMapping.split('\n');
  const map = {};

  const filteredLines = lines.filter(l => l && !(l.startsWith('#')));

  for (const line of filteredLines) {
    const parts = line.split(' ');

    if (parts.length !== 2) {
      throw new Error(`[proxy-service] unable to parse pathMap, this line is invalid ${line}`);
    }

    const path = parts[0];
    const target = parts[1];

    if (!path || !target) {
      throw new Error(`[proxy-service] invalid port map config, unable to find path or port, this line is invalid ${line}`);
    }

    console.log(`[proxy-service] mapping ${path} to ${target}`);
    map[path] = {
      path,
      target,
    };
  }

  return map;
};

const errorHandler = (err, req, res) => {
};
