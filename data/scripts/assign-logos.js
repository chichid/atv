#!/usr/bin/node
const fs = require('fs');

const args = argv.slice(2);
const logoDir = args[1];
const channels = JSON.parse(fs.readFileSync('data/channels.json'));

console.log('done');
