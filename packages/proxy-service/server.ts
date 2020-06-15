import * as http from 'http';
import * as url from 'url';
import * as httpProxy from 'http-proxy';
import * as Config from './config';

export const startServer = () => {
  const proxy = httpProxy.createProxyServer({}); 
  const pathMap = parsePathMapConfig();

  http.createServer(
    (req, res) => handleProxyRequest(proxy, pathMap, req, res)
  ).listen(Config.ServicePort, () => {
    console.log(`[proxy-service] proxy started at ${Config.ServicePort}`);
  });
};

const handleProxyRequest = (proxy, pathMap, req, res) => {
  const path: string = req.url;
  const pathConfig = pathMap[path];

  if (pathMap[path]) {
    proxy.web(req, res, {
      target: pathMap[path].target,
    });
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
