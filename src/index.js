const express = require('express'); ;
const { setHeaders, ping } = require('./utils');
const { getApplicationJs, getStaticResource } = require('./static-resources');
const { reloadChannels } = require('./channels');
const { atvPlay } = require('./airplay-cast');
const { startServer } = require('./server');
const { CONFIG } = require('./config');
const { logRequest } = require('./logger');

const app = express();

app.use(express.json());
app.use(logRequest(CONFIG));
app.use(setHeaders(CONFIG));

app.get('/ping', ping(CONFIG));
app.get('/appletv/js/application.js', getApplicationJs(CONFIG));
app.get('/assets/*', getStaticResource(CONFIG));

app.post('/reloadChannels', reloadChannels(CONFIG));
app.post('/play', atvPlay(CONFIG));

startServer(CONFIG, app);
