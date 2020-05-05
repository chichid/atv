const express = require('express');
const { setHeaders } = require('./utils');
const { getStatic } = require('./static-resources');
const { reloadChannels } = require('./channels');
const { atvPlay } = require('./airplay-cast');
const { startServer } = require('./server');
const { CONFIG } = require('./config');

const app = express();
app.use(express.json());
app.use(setHeaders(CONFIG));
app.get('/application.js', getStatic(CONFIG));
app.get('/assets/:resource:', getStatic(CONFIG));
app.post('/reloadChannels', reloadChannels(CONFIG));
app.post('/play', atvPlay(CONFIG));

startServer(CONFIG, app);
