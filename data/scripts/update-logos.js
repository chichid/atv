const fs = require('fs');
const sharp = require('sharp');

// TODO possible enhancement by providing the google drive folder directly
(async function main() {
  const args = process.argv.slice(2);
	const inputDir = args[0];
	const outputDir = args[1] || (args[0] + '/' + 'out');
	
  console.log(args);
  console.log(`Fixing Logos in ${inputDir}, output: ${outputDir}...`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const inputFiles = fs.readdirSync(inputDir);
  const roundedCorners = Buffer.from('<svg><rect fill="#fff" x="0" y="0" width="400" height="300" rx="25" ry="25"/></svg>');

  for (const file of inputFiles) {
    const filePath = inputDir + '/' + file;

    if (fs.lstatSync(filePath).isDirectory()) {
      continue;
    }

    if (file.indexOf('(') !== -1) {
      fs.unlink(filePath, () => {});
      continue;
    }

    try {
      const input = await sharp(filePath)
	.trim()
	.resize({
	  width: 300,
	  height: 250,
	  fit: 'inside',
	  background: { r: 255, g: 255, b: 255, alpha: 1 }
	})
	.toBuffer();

      await sharp(roundedCorners)
	.composite([{ input }])
	.toFile(outputDir + '/' + file);
    } catch(e) {
      console.error(`Unable to convert ${filePath}`);
      console.error(e);
    }
  }

  console.log(`Done Fixing Logos.`);
})();
