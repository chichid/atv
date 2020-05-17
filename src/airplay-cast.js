const { post } = require('./utils');

export const atvPlay = (config) => async (req, res) => {
  console.log(`[airplay-cast] /play with url: ${req.body.videoUrl}`);

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    const payload = {
      videoUrl: req.body.videoUrl,
    };

    await post('https://' + config.AppleTvAddress + '/play', payload, headers);

    res.end();
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end(JSON.stringify(e));
  }
};
