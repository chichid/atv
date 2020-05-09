const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const request = require('request');
const gis = require('g-i-s');

const args = process.argv.slice(2);
const outDir = args[0];
const atvDeployBasePath = "resources://" + args[1];
const targetDimensions = args[2].split('x').map(t => Number(t));
const CHANNELS_FILE = 'data/channels.json';

const channels = JSON.parse(fs.readFileSync(CHANNELS_FILE));

const getLogo = channel => new Promise((resolve, reject) => {
  gis(`"${channel}" transparent logo png`, (error, results) => {
    if (error) {
      reject(error);
    }
    else {
      resolve(results.map(r => r.url).slice(0, 10));;
    }
  });
});

const downloadFile = async (url, output) => new Promise((resolve, reject) => {
  request(url)
    .pipe(fs.createWriteStream(output))
    .on('finish', () => resolve())
    .on('error', err => reject(err));
});

(async function() {
  for (const group of channels.channelSelection) {
    for (const channel of group.channels) {
      console.log(`Generating logo for ${channel.name}...`);

      if (!channel.generatedLogo) {
        const logoUrls = await getLogo(channel.name);

        for (const logoUrl of logoUrls) {
          const output = outDir + '/' + channel.name + path.extname(logoUrl);
          const resizedOutput = outDir + '/resized';
          const resizedFileName = resizedOutput + '/' + channel.name + '.png';

          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true } );
          }

          if (!fs.existsSync(resizedOutput)) {
            fs.mkdirSync(resizedOutput, { recursive: true } );
          }

          try {
            await downloadFile(logoUrl, output);
          } catch(e) {
            console.warn(`Unable to download ${logoUrl}`);
            console.log(e);
            continue;
          }

          try {
            const s = sharp(output);
            const { width, height } = await s.metadata();

            if (width < targetDimensions[0] || height < targetDimensions[1]) {
              console.warn(`Url ${logoUrl} returned a file with low resolution...`);
            }

            await s.resize(targetDimensions[0], targetDimensions[1], {fit: 'fill'})
              .png()
              .toFile(resizedFileName);
          } catch(e) {
            console.warn(`Url ${logoUrl} returned a wrong image file`);
            continue;
          }

          channel.generatedLogo = atvDeployBasePath + '/' + channel.name + '.png';
          break;
        }
      }

      if (!channel.generatedLogo) {
        console.error(`Unable to generate a logo for ${channel.name}`);
      }
    }
  }

  console.log(`Writing the channels...`);
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, '  '));
})();
