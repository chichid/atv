const fs = require('fs');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');

module.exports.wait = (duration) => new Promise((resolve, reject) => {
  setTimeout(resolve, duration);
});

module.exports.fileExists = (file) => new Promise((resolve, reject) => {
  fs.exists(file, exists => resolve(exists));
});

module.exports.readFile = (file) => new Promise((resolve, reject) => {
  fs.readFile(file, (err, content) => {
    if (err) {
      reject(err);
    } else {
      resolve(content)
    }
  });
});

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

module.exports.get = async (url) => {
  const response = await axios.get(url);
  return response.data;
};

module.exports.getBuffer = async (url) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
  });
  return response.data;
};

module.exports.post = async (url, postData, headers, logBody) => {
  const contentType = Object.keys(headers).find(k => k.toLowerCase() === 'content-type');
  let data = null; 

  switch(contentType) {
    case 'application/x-www-form-urlencoded':
      data = querystring.stringify(data);
      break;
    case 'application/json':
      data = JSON.stringify(data);
      break;
    default: {
      if (typeof postData === 'string') {
        data = postData;
      } else {
        data= JSON.stringify(postData);
      }
    }
  }

  const options = {
    url,
    data,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers
    },
  };

  if (logBody === true) {
    console.log(`[POST] sending post request with data: ${JSON.stringify(options, null, '  ')}`);
  } else {
    console.log(`[POST] sending post request ${url} `);
  }

  const response = await axios.request(options);
  return response.data;
};

module.exports.decodeBase64 = (data) => {
  const buff = Buffer.alloc(data.length, data, 'base64');
  return buff.toString('utf-8');
};

