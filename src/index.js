const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const path = require('path');
const handlebars = require('handlebars');
const { castUrl } = require('./airplay-cast');

const PROFILE = process.env.PROFILE;
const USE_SSL = process.env.USE_SSL === 'true' ? true : false;
const PORT = process.env.PORT || (USE_SSL ? 443 : 80);
const M3U_DIR = "src/config/m3u";
const HOME_URL = process.env.HOME_URL;
const app = express();

const mimeMap = {
	'js': 'text/javascript',
	'xml': 'text/xml', 
};

const pathMap = {
	'js': '/assets/js',
	'xml': '/assets/templates',
};

let CHANNELS = null;

const get = url => new Promise((resolve, reject) => {
  if (url.startsWith('https://') || url.startsWith('http://')) {
    const httpFactory = url.startsWith('https://') ? https : http;

    httpFactory.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data);
      });
    }).on('error', () => reject());
  } else if (url.startsWith('file://')){
    fs.readFile(url.replace('file://', ''), (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.toString());
      } 
    });
  } else {
    reject(`[get] Unsupported protocol in url: ${url}`);
  }
});

const readM3u = async (url) => {
  const m3u = await get(url);
  const lines = m3u.split('\n').filter(l => l ? true : false);

  console.log(lines);

  const channels = [];

  for (let current_line = 0; current_line < lines.length; ++current_line) {
		if (!lines[current_line].startsWith("#EXTINF")) {
      continue;
		}

    const keyVals = {};

    const parts = lines[current_line].split(' ');
    parts.forEach(p => {
      const keyVal = p.split('=');
      const key = keyVal[0];
      const val = keyVal[1];
      keyVals[key] = val;
    });

    const channel = {
      id: channels.length, 
      name: lines[current_line].split(',')[1],
      logo: (keyVals['tvg-logo'] || "").replace(/"/g, ""),
      url: lines[current_line+1]
    };

    channels.push(channel);
  }

  return channels;
};

const loadChannels = async () => {
  if (!CHANNELS) {
    console.log('[context] loading channels...');
    CHANNELS = [];
    const m3us = fs.readdirSync(M3U_DIR);

    for (const m3uSource of m3us) {
      const source = 'file://' + M3U_DIR + '/' + m3uSource;
      console.log('[context] loading m3u source ' + source + '...');

      const channels = await readM3u(source);
      CHANNELS = [...CHANNELS, ...channels];
    }
  }
};

const reloadChannels = async () => {
  CHANNELS = null;
  await loadChannels();
};

const getContext = async () => {
  await loadChannels();

  return {
    HOME_URL,
    CHANNELS
  }
};

app.use(express.json()) 

app.use((req, res, next) => {
	const ext = path.extname(req.originalUrl).replace('.', '');

  res.removeHeader("Connection");
  res.removeHeader("X-Powered-By");
  res.removeHeader("Content-Length");
  res.removeHeader("Transfer-Encoding");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers");
  res.setHeader("Content-Type", mimeMap[ext] || 'text/plain');

  next();
});

app.use(async (req, res, next) => {
  if (req.method.toUpperCase() !== "GET") {
    next();
    return;
  }

  console.log(`[get] ${req.originalUrl}`);

	const ext = path.extname(req.originalUrl).replace('.', '');
	const fileName = path.basename(req.originalUrl);
	const filePath = path.join(__dirname, pathMap[ext] || '/assets', pathMap[ext] ? fileName : req.originalUrl);

  try {
    const fileContent = fs.readFileSync(filePath).toString();
    const template = handlebars.compile(fileContent);
    const context = await getContext();
    const compiledTemplate = template(context);
    res.end(compiledTemplate);
  } catch(e) {
    console.error(e);
    res.writeHead(500);
    res.end(e);
  }
});

app.post('/play', async (req, res) => {
  console.log(`[post] /play`);
  console.log(req.body);

  const videoUrl = req.body.videoUrl;

  try {
    await castUrl(videoUrl);
    res.end();
  } catch(e) {
    console.error(e);
    res.writeHead(500);
    res.end(JSON.stringify(e));
  }
});

app.post('/reloadChannels', async (req, res) => {
  await reloadChannels();
  res.end();
});

const httpFactory = USE_SSL ? https : http;

const server = httpFactory.createServer({
	key: fs.readFileSync(__dirname + '/assets/certificates/kortv.key'),
	cert: fs.readFileSync(__dirname + '/assets/certificates/kortv.pem')
}, app);

server.listen(PORT, () => console.log('server started on port ' + PORT + ' using ' + (USE_SSL ? 'https' : 'http')));

