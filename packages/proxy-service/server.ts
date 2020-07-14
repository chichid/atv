import * as http from 'http';
import * as URL from 'url';
import * as httpProxy from 'http-proxy';
import * as Config from './config';

export const startServer = () => {
  createReverseProxyServer().listen(Config.ProxyPort, () => {
    console.log(`[proxy-service] reverse proxy started at ${Config.ProxyPort}`);
  });
};

const createReverseProxyServer = () => {
  console.log(`[proxy-service] creating reverse proxy server ...`);

  const proxy = httpProxy.createProxyServer({}); 
  const pathMap = parsePathMapConfig();

  return http.createServer(reverseProxyRequestHandler(proxy, pathMap));
};

const reverseProxyRequestHandler = (proxy, pathMap) => (req, res) => {
  try {
    const path: string = '/' + req.url.split('/')[1];
    const pathConfig = pathMap[path];
    const isHttpUrl = req.url.toLowerCase().startsWith('http://');
    const isHttpsUrl = req.url.toLowerCase().startsWith('https://');

    if (isHttpUrl || isHttpsUrl) {
      console.log(`[proxy-service] forward proxy url ${req.url}`);

      const url = URL.parse(req.url);

      proxy.web(req, res, {
        target: url,
        prependPath: false,
      });
    } else if (pathConfig) {
      console.log(`[proxy-service] reverse proxy request ${req.url} to ${pathConfig.target}`);

      proxy.web(req, res, {
        target: pathConfig.target,
        xfwd: true,
      });
    } else {
      console.log(`[proxy-service] ${req.url} not found`);
      res.writeHead(404);
      res.end(`${path} not found`);
      return;
    }

  } catch(e) {
    console.error(`[proxy-service] proxy handler error ${e.message}, ${req.url}`);
    console.error(e);
    res.writeHead(500);
    res.end(e.message);
  }
};

const parsePathMapConfig = () => {
  const pathMapping = Config.ProxyPathMapping;
  const lines = pathMapping instanceof Array ? pathMapping : pathMapping.split('\n');
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

