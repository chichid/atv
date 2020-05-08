const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const logoDir = args[0];
const atvDeployBasePath = "resources://" + args[1];

if (!logoDir) {
  console.log("usage: node update-logos [logos-path]");
  process.exit(0);
}

const channels = JSON.parse(fs.readFileSync('data/channels.json'));

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

console.log(JSON.stringify(channels, null, '  '));

console.log('done');
