const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const { getContext } = require('model');

export const getStatic = (config) => async (req, res, next) => {
  if (req.method.toUpperCase() !== 'GET') {
    next();
    return;
  }

  console.log(`[get] ${req.originalUrl}`);
  const filePath = path.join(__dirname, config.AssetsFolder, req.originalUrl);

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
