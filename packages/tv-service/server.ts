import * as http from 'http';
import * as url from 'url';
import * as path from 'path';
import * as express from 'express';
import * as Config from './config';
import { getTemplate } from './templates'
import { getChannels, getChannelDetails, reloadChannels } from './channels'
import { getMovieCategories, getMovies } from './movies';

export const startServer = () => {
  if (!process.env.http_proxy && Config.HttpProxy) {
    console.log(`[tv-service] setting the http proxy from the settings to ${Config.HttpProxy}`);
    process.env.http_proxy = Config.HttpProxy;
  }

  const app = createApp();
  http.createServer(app).listen(Config.Port, Config.Addr, () =>
    console.log(`[tv-service] server started on port ${Config.Port}`)
  );
};

const createApp = () => {
  const app = express();

  app.use(express.json());
  app.use(setHeaders);
  app.post('/tv-service/reloadChannels', handler(reloadChannels));
  app.get('/tv-service/templates/:path', handler(getTemplate));
  app.get('/tv-service/movies', handler(getMovies));
  app.get('/tv-service/movies/categories', handler(getMovieCategories));
  app.get('/tv-service/channels', handler(getChannels));
  app.get('/tv-service/channels/:channelName', handler(getChannelDetails));
  app.post('/tv-service/channels/reload', handler(reloadChannels));
  app.use(errorHandler);

  return app;
};

const setHeaders = (req, res, next) => {
  res.removeHeader('Connection');
  res.removeHeader('X-Powered-By');
  res.removeHeader('Content-Length');
  res.removeHeader('Transfer-Encoding');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Allow-Headers');

  const { pathname } = url.parse(req.url);
  const ext = path.extname(pathname).replace('.', '');

  if (ext) {
    res.header('content-type', Config.MimeMap[ext] || Config.MimeMap.default);
  }

  next();
};

const handler = (...fns: Function[]) => {
  return (req, res, next) =>  {
    for (const fn of fns) {
      fn(req, res, next).catch(next);
    }
  };
};

const errorHandler = (err, req, res, next) => {
  res.status(500).json({ message: err.message });
};
