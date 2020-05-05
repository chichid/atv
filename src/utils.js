const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

export const setHeaders = (config) => (req, res, next) => {
  res.removeHeader('Connection');
  res.removeHeader('X-Powered-By');
  res.removeHeader('Content-Length');
  res.removeHeader('Transfer-Encoding');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Allow-Headers');

  const ext = path.extname(req.originalUrl).replace('.', '');
  res.setHeader('Content-Type', config.MimeMap[ext] || config.MimeMap.default);

  next();
};

export const get = url => new Promise((resolve, reject) => {
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
    }).on('error', err => reject(new Error(err)));
  } else if (url.startsWith('file://')) {
    fs.readFile(url.replace('file://', ''), (err, data) => {
      if (err) {
        reject(new Error(err));
      } else {
        resolve(data.toString());
      }
    });
  } else {
    reject(new Error(`[get] Unsupported protocol in url: ${url}`));
  }
});
