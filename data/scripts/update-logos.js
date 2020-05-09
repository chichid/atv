const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const logoDir = args[0];
const atvDeployBasePath = "resources://" + args[1];
const CHANNELS_FILE = 'data/channels.json';

if (!logoDir) {
  console.log("usage: node update-logos [logos-path]");
  process.exit(0);
}

const channels = JSON.parse(fs.readFileSync(CHANNELS_FILE));

console.log(`Reading logos from dir ${logoDir} ...`);
const logos = fs.readdirSync(logoDir);

const normalizeChannelName = (channelName) => channelName.replace(/ /g, '').toLowerCase();

for (const group of channels.channelSelection) {
  for (const channel of group.channels) {
    const name = normalizeChannelName(channel.name);
    const alternateNames = (channel.alternateNames && channel.alternateNames.map(normalizeChannelName)) || [];
    const logo = logos.find(l => l.indexOf(name) !== -1 || alternateNames.some(an => l.indexOf(an) !== -1))

    if (logo) {
      channel.approximativeLogo = atvDeployBasePath + '/' + logo;
    } else {
      console.warn(`Logo for channel ${name} not found`);
    }
  }
}

console.log(`Writing the channels`);
fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, '  '));

console.log('done');