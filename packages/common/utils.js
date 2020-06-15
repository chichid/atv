const fs = require('fs');
const path = require('path');
const url = require('url');
const axios = require('axios');
const https = require('https');
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
      resolve(content.toString())
    }
  });
});

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

module.exports.get = async (uri) => {
  const parsedUrl = url.parse(process.env.http_proxy);
  const response = await axios.get(uri, {
    httpsAgent: getAxiosHttpsAgent(),
    proxy: getAxiosProxy(uri) 
  });

  return response.data;
};

module.exports.getBuffer = async (uri) => {
  const response = await axios.get(uri, {
    proxy: getAxiosProxy(uri),
    httpsAgent: getAxiosHttpsAgent(),
    responseType: 'arraybuffer',
  });

  return response.data;
};

module.exports.postForm = (url, postData, headers, logBody) => {
  return module.exports.post(url, postData, {
    ...headers,
    'Content-Type': 'application/x-www-form-urlencoded',
  }, logBody);
};

module.exports.post = async (url, postData, headers, logBody) => {
  const contentType = Object.keys(headers).find(k => k.toLowerCase() === 'content-type');
  let data = null; 

  switch(headers[contentType]) {
    case 'application/x-www-form-urlencoded':
      data = querystring.stringify(postData);
      break;
    case 'application/json':
      data = JSON.stringify(postData);
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
    proxy: getAxiosProxy(url),
    headers,
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

const getAxiosHttpsAgent = () => {
  return new https.Agent({
    rejectUnauthorized: false,
  });
};

const getAxiosProxy = (uri) => {
  if (uri.indexOf('localhost') || uri.indexOf('127.0.0.1') !== -1) {
    return null;
  }

  if (!process.env.http_proxy)  {
    return null;
  }
  
  const proxyUrl = url.parse(process.env.http_proxy);
  const authParts = proxyUrl.auth && proxyUrl.auth.split(':');
  
  return {
    host: proxyUrl.hostname,
    port: proxyUrl.port,
    auth: !authParts ? null : {
      username: decodeURIComponent(authParts[0]),
      password: decodeURIComponent(authParts[1]),
    },
  };
};
