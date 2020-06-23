import * as path from 'path';
import * as handlebars from 'handlebars';
import * as handlebarsAsync from 'handlebars-async';
import * as Config from './config';
import { get, fileExists, readFile } from 'common/utils';

handlebarsAsync(handlebars);

export const getTemplate = async (req, res) => {
  const resourcePath = 'templates/' + req.params.path;

  console.log(`[templates] getTemplate loading resource file, ${resourcePath}`);
  const filePath = path.join(__dirname, resourcePath);

  if (!await fileExists(filePath)) {
    res.writeHead(404);
    return;
  }

  const fileContent = await readFile(filePath);
  const content = await runTemplate(req, fileContent);

  res.end(content);
};

const getBaseUrl = (req) => {
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('host').toLowerCase().replace('http://','').replace('https://', '');
  const requestBaseUrl = `${protocol}://${host}`;
  const isLocalHost = host.toLowerCase().indexOf('localhost') !== -1 || host.indexOf('127.0.0.1') !== -1

  return isLocalHost ? Config.AppleTvRedirectedApp : requestBaseUrl;
};

const runTemplate = (req, fileContent: string) => new Promise((resolve, reject) => {
  if (fileContent.indexOf(Config.ClientSideTemplateTag) !== -1) {
    resolve(fileContent);
    return;
  }

  const context = {
    query: req.query,
    baseUrl: getBaseUrl(req),
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
    let url = `http://localhost:${Config.Port}${path}`;

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

    console.log(`[handlebars] fetch helper - ${url} - select: ${arguments.length > 2 ? sel : ''}`);

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
    }).catch(err => {
      const exp = { ...err, message: 'fetch helper error - ' + err.message  }
      console.error(`[handlebars] fetch helper failed - ${url} - ${exp.message}`);
      reject(exp);
      done();
    });
  });

  const template: any = handlebars.compile(fileContent) as any;

  template(context, function(err, result) {
    if (err) {
      reject(err);
    } else {
      resolve(result);
    }
  });
});

