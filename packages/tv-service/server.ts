import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import * as express from 'express';
import * as Config from './config';
import { getTemplate } from './templates'
import { getChannelConfig, getChannels, getChannelDetails, reloadChannels } from './channels'

export const startServer = () => {
  if (!process.env.http_proxy) { 
    throw new Error(`[tv-service] http_proxy not provided, crashing to avoid a ban`);
  }

  const app = createApp();
  createServer(app).listen(Config.Port, Config.Addr, () =>
    console.log(`[tv-service] server started on port ${Config.Port}`)
  );
};

const createApp = () => {
  const app = express();

  app.use(express.json());
  app.use(setHeaders);
  app.get('/config', handler(getChannelConfig));
  app.get('/templates/:path', handler(getTemplate));
  app.get('/channels', handler(getChannels));
  app.get('/channels/:channelName', handler(getChannelDetails));
  app.post('/channels/reload', handler(reloadChannels));
  app.use(errorHandler);

  return app;
};

const createServer = (app) => {
  const httpFactory = Config.SSL.Enabled ? https : http;
  console.log(`[tv-service] creating server using ${httpFactory === https ? 'https' : 'http'}`);

  const serverConfig = !Config.SSL.Enabled ? null : {
    key: fs.readFileSync(Config.SSL.Key),
    cert: fs.readFileSync(Config.SSL.Cert),
  };

  return httpFactory.createServer(serverConfig, app);
};

const setHeaders = (req, res, next) => {
  res.removeHeader('Connection');
  res.removeHeader('X-Powered-By');
  res.removeHeader('Content-Length');
  res.removeHeader('Transfer-Encoding');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Allow-Headers');

  const ext = path.extname(req.originalUrl).replace('.', '');
  if (ext) {
    res.header('content-type', Config.MimeMap[ext] || Config.MimeMap.default);
  }

  next();
};

const handler = (fn) => {
  return (req, res, next) =>  {
    fn(req, res, next).catch(next);
  };
};

const errorHandler = (err, req, res, next) => {
  res.status(500).json({ message: err.message });
};
