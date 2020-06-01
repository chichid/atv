const { get } = require('./utils');

let sharp;
try {
	sharp = require('sharp');
} catch(e) {
	sharp = null;
	console.warn(`[logos] [warning] Sharp is not available on the current device, skipping`);
}

module.exports.getLogo = (config) => async (req, res) => {
  if (!sharp) {
	  throw "Not available for the current device";
  }

  const imageUrl = req.query.url;

  try {
    const beautifulLogo = await beautifyLogo(imageUrl);
    res.setHeader('Content-Type', 'image/png');
    res.end(beautifulLogo);
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end(e.message);
  }
};

module.exports.beautifyLogo = async (source) => {
  if (!sharp) {
	  throw "Not available for the current device";
  }

  try {
    console.log(`Beautifying logo ${source}...`);

    const inputStream = await get(source, true);
    const roundedCorners = Buffer.from(
      '<svg><rect fill="#fff" x="0" y="0" width="400" height="300" rx="50" ry="50"/></svg>'
    );

    const input = await sharp(inputStream)
      .trim()
      .resize({
        width: 200,
        height: 150,
        fit: 'inside',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .toBuffer();

    return await sharp(roundedCorners)
      .composite([{ input }])
      .png()
      .toBuffer();
  } catch (e) {
    console.error(`Unable to convert ${source}`);
    console.error(e);
  }
};
