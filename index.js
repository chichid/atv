const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const path = require('path');

const isLocal = process.env.PORT ? false: true;
const PORT = process.env.PORT || 443
const app = express();

const mimeMap = {
	'js': 'text/javascript',
	'xml': 'text/xml',
};

const pathMap = {
	'js': '/assets/js',
	'xml': '/assets/templates',
};

app.use((req, res) => {
	const ext = path.extname(req.originalUrl).replace('.', '');
	const fileName = path.basename(req.originalUrl);
	const filePath = path.join(__dirname, pathMap[ext] || '/assets', pathMap[ext] ? fileName : req.originalUrl);
  const file = fs.readFileSync(filePath);

	res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", mimeMap[ext] || 'text/plain');
  res.removeHeader("Connection");
  res.removeHeader("X-Powered-By");
  res.removeHeader("Content-Length");
  res.removeHeader("Transfer-Encoding");

  res.end(file.toString());
});

const httpFactory = isLocal ? https : http;

const server = httpFactory.createServer({
	key: fs.readFileSync(__dirname + '/assets/certificates/kortv.key'),
	cert: fs.readFileSync(__dirname + '/assets/certificates/kortv.pem')
}, app);

server.listen(PORT, () => console.log('server started'));

