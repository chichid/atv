const fs = require('fs');
const path = require('path');

const DevProfile = 'dev';
const ProdProfile = 'prod';
const Profile = process.env.PROFILE;
const SettingsFile = '../../settings.json';
const Settings = fs.existsSync(SettingsFile) ? JSON.parse(fs.readFileSync(SettingsFile)) : {};

const config = (key, defaultValue) => {
  let settingValue = process.env[key] || Settings[key] || null;

  if (typeof settingValue === 'string' && settingValue.startsWith('$')) {
    settingValue = process.env[settingValue.replace('$', '')];
  }

  const value = settingValue || defaultValue;
  console.log(`[common/config] ${key} = ${value}`)

  return value;
};

let isConfigInvalid = false;

const rcfg = (key, defaultValue) => {
  const value = config(key, defaultValue);

  if (!value) {
    console.error(`[common/config] missing required config ${key}`);
    isConfigInvalid = true;
  }

  return value;
};

module.exports.cfg = config;
module.exports.rcfg = rcfg;

