const express = require('express'); ;
const { setHeaders, ping } = require('./utils');
const { getApplicationJs, getStaticResource } = require('./static-resources');
const { reloadChannels } = require('./channels');
const { atvPlay, atvTranscoder } = require('./airplay-cast');
const { startServer } = require('./server');
const { CONFIG } = require('./config');
const { logRequest } = require('./logger');
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
app.post('/play', atvPlay(CONFIG));
app.get('/transcode/:videoUrl', atvTranscoder(CONFIG));

startServer(CONFIG, app);
