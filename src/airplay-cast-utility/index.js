const AirPlay = require('airplay-protocol');
const airplay = new AirPlay('192.168.2.39');

airplay.play('https://cdnamd-hls-globecast.akamaized.net/live/ramdisk/2m_monde/hls_video_ts/2m_monde.m3u8?checkedby:iptvcat.com', function (err) {
  if (err) throw err
 
  airplay.playbackInfo(function (err, res, body) {
    if (err) throw err
    console.log('Playback info:', body)
  });
});
