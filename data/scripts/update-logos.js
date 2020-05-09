const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const args = process.argv.slice(2);
const logoDir = args[0];
const atvDeployBasePath = "resources://" + args[1];
const targetDimensions = args[2].split('x').map(t => Number(t));
const CHANNELS_FILE = 'data/channels.json';

if (!logoDir) {
  console.log("usage: node update-logos [logos-path]");
  process.exit(0);
}

console.log(`Reading logos from dir ${logoDir} ...`);
const logos = fs.readdirSync(logoDir);

console.log(`Resizing logos...`);

const channels = JSON.parse(fs.readFileSync(CHANNELS_FILE));
const normalizeChannelName = (channelName) => channelName.replace(/ /g, '').toLowerCase();

const logosToResize = [];

for (const group of channels.channelSelection) {
  for (const channel of group.channels) {
    const name = normalizeChannelName(channel.name);
    const alternateNames = (channel.alternateNames && channel.alternateNames.map(normalizeChannelName)) || [];
    const logo = logos.find(l => l.indexOf(name) !== -1 || alternateNames.some(an => l.indexOf(an) !== -1))

    if (logo) {
      channel.approximativeLogo = atvDeployBasePath + '/' + logo;
      logosToResize.push(logo);
    } else {
      console.warn(`Logo for channel ${name} not found`);
    }
  }
}

console.log(`Writing the channels...`);
fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, '  '));

(async function() {
  for (const logo of logosToResize) {
    const logoPath = logoDir + '/' + logo;

    try { 
      const {width, height} = await sharp(logoPath).metadata();

      if (width > targetDimensions[0] || height > targetDimensions[1]) {
        // console.log(`Resizing logo ${logo}`);
      } else if (width < targetDimensions[0] || height < targetDimensions[1]) {
        console.log(`The logo ${logo} will look like garbage`);
      }
    } catch(e) {
      console.warn(`Problem with logo ${logo}, err: ${e}`);
    }
  }
})();

  
console.log('done');
