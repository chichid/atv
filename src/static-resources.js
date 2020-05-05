const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const { getContext } = require('./model');

export const getStaticResource = (config) => async (req, res, next) => {
  console.log(`[static-resources] getStaticResource ${req.path}`);
  const filePath = path.join(__dirname, req.path);
  await loadFile(config, req, res, filePath);
};

export const getApplicationJs = (config) => async (req, res) => {
  console.log('[static-resources] getApplicationJs');
  const filePath = path.join(__dirname, config.AssetsFolder, '/js/application.js');
  await loadFile(config, req, res, filePath);
};

const loadFile = async (config, req, res, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end();
      return;
    }

    const fileContent = fs.readFileSync(filePath).toString();
    const template = handlebars.compile(fileContent);
    const context = await getContext(config);
    const compiledTemplate = template(context);
    res.end(compiledTemplate);
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end(e);
  }
};
