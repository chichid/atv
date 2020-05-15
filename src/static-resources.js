const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const { loadChannels } = require('./channels');

export const getStaticResource = (config) => async (req, res, next) => {
  console.log(`[static-resources] getStaticResource ${req.path}`);
  const filePath = path.join(__dirname, req.path);
  await sendFile(config, req, res, filePath);
};

export const getApplicationJs = (config) => async (req, res) => {
  console.log('[static-resources] getApplicationJs');
  const filePath = path.join(__dirname, config.AppleTvBootstraperFolder, 'application.js');
  await sendFile(config, req, res, filePath);
};

const getContext = async (config, path, query) => {
  const {epgPrograms, groups} = await loadChannels(config, path, query);

  return {
    query,
    config,
    groups,
    epgPrograms,
  };
};

const sendFile = async (config, req, res, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end();
      return;
    }

    const fileContent = fs.readFileSync(filePath).toString();
    const template = handlebars.compile(fileContent);
    const context = await getContext(config, req.path, req.query);
    const compiledTemplate = template(context);
    res.end(compiledTemplate);
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end(e);
  }
};
