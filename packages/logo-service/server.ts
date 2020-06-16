import * as http from 'http';
const sharp = require('sharp');
import { getBuffer } from 'common/utils';
import { Config } from './config';

export const startServer = () => {
  http.createServer((req, res) => handleRequest(req, res)).listen(Config.Port, () => {
    console.log(`[logo-service] server listening at ${Config.Port}`);
  });
};

const handleRequest = async (req, res) => {
  const url = req.url.replace('/','');
  const imageUrl = decodeURIComponent(url);

  try {
    console.log(`[logo-service] beautifying logo ${imageUrl}...`);
    const beautifulLogo = await beautifyLogo(imageUrl);

    res.setHeader('content-type', 'image/png');
    res.end(beautifulLogo);
  } catch (e) {
    console.error(`[logo-service] error ${e.message}, ${e.message}`);
    res.writeHead(500);
    res.end(e.message);
  }
};

const beautifyLogo = async (source: string) => {
  const inputBuffer = await getBuffer(source);

  const roundedCorners = Buffer.from(
    '<svg><rect fill="#fff" x="0" y="0" width="400" height="300" rx="50" ry="50"/></svg>'
  );

  const resizeOptions = {
    width: 200,
    height: 150,
    fit: 'inside',
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  };

  const input = await sharp(inputBuffer)
    .trim()
    .resize(resizeOptions)
    .toBuffer();

  return await sharp(roundedCorners)
    .composite([{ input }])
    .png()
    .toBuffer();
};
