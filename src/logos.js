const sharp = require('sharp');
const { get } = require('./utils');

export const getLogo = (config) => async (req, res) => {
  const imageUrl = req.query.url;

  try {
    const beautifulLogo = await beautifyLogo(imageUrl);
    res.setHeader('Content-Type', 'image/png');
    res.end(beautifulLogo);
  } catch(e) {
    console.error(e);
    res.writeHead(500);
    res.end(e.message);
  }
};

export const beautifyLogo = async (source) => {
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
  } catch(e) {
    console.error(`Unable to convert ${source}`);
    console.error(e);
  }
};
