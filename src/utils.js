const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const querystring = require('querystring');
const { URL } = require('url');

module.exports.setHeaders = (config) => (req, res, next) => {
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

module.exports.ping = (config) => (req, res) => {
  res.end('pong');
};

module.exports.writeFile = async (file, content) => new Promise((resolve, reject) => {
  fs.writeFile(file, content, (err) => {
    if (err) {
      reject(err);
    } else {
      resolve();
    }
  });
});

module.exports.writeJson = async (file, json, format) => {
  const serializedContent = format ? JSON.stringify(json) : JSON.stringify(json, null, ' ');
  await writeFile(file, serializedContent);
};

module.exports.get = (url, buffer) => new Promise((resolve, reject) => {
  if (url.startsWith('https://') || url.startsWith('http://')) {
    const httpFactory = url.startsWith('https://') ? https : http;

    httpFactory.get(url, (res) => {
      let data = buffer ? [] : '';

      res.on('data', (chunk) => {
        if (buffer) {
          data.push(chunk);
        } else {
          data += chunk;
        }
      });

      res.on('end', () => {
        if (buffer) {
          resolve(Buffer.concat(data));
        } else {
          resolve(data);
        }
      });
    }).on('error', err => reject(new Error(err)));
  } else if (url.startsWith('file://')) {
    fs.readFile(url.replace('file://', ''), (err, data) => {
      if (err) {
        reject(new Error(err));
      } else if (buffer) {
        resolve(data);
      } else {
        resolve(data.toString());
      }
    });
  } else {
    reject(new Error(`[get] Unsupported protocol in url: ${url}`));
  }
});

module.exports.post = async (url, data, headers) => new Promise((resolve, reject) => {
  const httpFactory = url.startsWith('https://') ? https : http;
  const { hostname, port, pathname } = new URL(url);

  const options = {
    hostname,
    port: port || (httpFactory === https) ? 443 : 80,
    path: pathname,
    method: 'POST',
    rejectUnauthorized: false,
    requestCert: true,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers
    },
  };

  const isFormEncoded = options.headers['Content-Type'] === 'application/x-www-form-urlencoded';
  const postData = isFormEncoded ? querystring.stringify(data) : JSON.stringify(data);
  options.headers['Content-Length'] = postData.length;

  console.log(`[POST] sending post request with data: ${JSON.stringify(options, null, '  ')}`);
  const req = httpFactory.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      resolve(data);
    });

    res.on('error', err => reject(err));
  });

  req.on('error', err => reject(err));

  req.write(postData);
  req.end();
});

module.exports.decodeBase64 = (data) => {
  const buff = Buffer.alloc(data.length, data, 'base64');
  return buff.toString('utf-8');
};
