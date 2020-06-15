import * as path from 'path';
import * as handlebars from 'handlebars';
import * as handlebarsAsync from 'handlebars-async';
import * as Config from './config';
import { get, fileExists, readFile } from 'common/utils';

handlebarsAsync(handlebars);

export const getTemplate = async (req, res) => {
  console.log(`[templates] getTemplate ${req.path}`);
  const filePath = path.join(__dirname, req.path);

  if (!await fileExists(filePath)) {
    res.writeHead(404);
    return;
  }

  const fileContent = await readFile(filePath);
  const content = await runTemplate(req.query, fileContent);

  res.end(content);
};

const runTemplate = (query, fileContent) => {
  const context = {
    query,
  };

  const getProperty = (obj, path) => {
    const selectorParts = (path.split && path.split('.')) || [];
    let selectedProperty: any = obj;

    for (const s of selectorParts) {
      selectedProperty = selectedProperty[s];
    }

    return selectedProperty;
  };

  const getUrl = (path) => {
    let url = `http${Config.UseSSL ? 's' : ''}://localhost:${Config.Port}${path}`;

    const matches = (url.match('{[^\\]]*}')) || [];
    for (const match of matches) {
      const path = match.replace('{', '').replace('}', '');
      const val = getProperty(context, path);
      url = url.replace(match, val);
    }

    return url;
  };

  handlebars.registerHelper('fetch', function(path, sel, opts) {
    const done = this.async();
    if (!path) {
      console.warn('[handlebars] fetch handler required parameter missing - path')
    }

    const selector = arguments.length > 2 ? sel : [];
    const options = arguments[arguments.length - 1];
    const url = getUrl(path);

    console.log(`[handlebars] fetch - ${url}, ${arguments.length > 2 ? sel : ''}`);

    get(url).then(data => {
      const selectedProperty = getProperty(data, sel);

      let result = '';
      if (selectedProperty instanceof Array) {
        for (const prop of selectedProperty) {
          result += options.fn(prop);
        }
      } else {
        result = options.fn(selectedProperty);
      }

      done(null, result);
    });
  });

  const template: any = handlebars.compile(fileContent) as any;

  return new Promise((resolve, reject) => template(context, function(err, result) {
    if (err) {
      reject(err);
    } else {
      resolve(result);
    }
  }));
};

