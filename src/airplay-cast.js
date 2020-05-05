const AirPlay = require('airplay-protocol');

export const atvPlay = (config) => async (req, res) => {
  console.log(`[post] /play with url: ${req.body.videoUrl}`);

  const videoUrl = req.body.videoUrl;

  try {
    await castUrl(config.AppleTvAddress, videoUrl);
    res.end();
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end(JSON.stringify(e));
  }
};

const castUrl = (appleTvAddress, url) => new Promise((resolve, reject) => {
  const airplay = new AirPlay(appleTvAddress);

  airplay.play(url, (err) => {
    if (err) {
      console.error(`Error playing video: ${url} \n ${err} `);
      reject(err);
    }

    resolve();
  });
});
