const AirPlay = require('airplay-protocol');

module.exports.atvPlay = (config) => async (req, res) => {
  console.log(`[airplay-cast] /play ${req.body.videoUrl} on apple tv: ${req.body.appleTvIP}`);

  try {
    const airplay = new AirPlay(req.body.appleTvIP);
    const airplayURL = `${req.body.transcoderUrl}/${encodeURIComponent(req.body.videoUrl)}`;
    airplay.play(airplayURL, err => {
      if (err) {
        console.error('Unable to play on apple tv');
      }

      console.log(`Playing transcoded video from ${airplayURL}`);
      res.end(`Playing on apple tv ${req.body.videoUrl}`);
    });
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end(JSON.stringify(e));
  }
};
