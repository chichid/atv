const AirPlay = require('airplay-protocol');
const airplay = new AirPlay('192.168.2.39');

module.exports = {
  castUrl
};

function castUrl(url) {
  console.log(`[airplay-cast] castUrl ${url}`);

  return new Promise((r, f) => {
    airplay.play(url, function (err) {
      if (err) {
        console.error(`Error playing video: ${url} \n ${err} `);
        f(err);
      }

      r();
    });
  });
}
