const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const { loadChannels } = require('./channels');

module.exports.getAsset = (config) => async (req, res, next) => {
  console.log(`[assets] getAsset ${req.path}`);
  const filePath = path.join(__dirname, req.path);
  await sendFile(config, req, res, filePath);
};

const getContext = async (config, path, query) => {
  const { epgPrograms, groups } = await loadChannels(config, path, query);

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
