const express = require('express'); ;
const { setHeaders, ping } = require('common/utils');
const { logRequest } = require('common/logger');
const { CONFIG } = require('common/config');
const { getApplicationJs, getStaticResource } = require('./static-resources');
const { reloadChannels } = require('./channels');
const { startServer } = require('./server');
const { getLogo } = require('./logos');

const app = express();

app.use(express.json());
app.use(logRequest(CONFIG));
app.use(setHeaders(CONFIG));

app.get('/logo', getLogo(CONFIG));
app.get('/ping', ping(CONFIG));
app.get('/appletv/js/application.js', getApplicationJs(CONFIG));
app.get('/assets/*', getStaticResource(CONFIG));
app.post('/reloadChannels', reloadChannels(CONFIG));

startServer(CONFIG, app);
