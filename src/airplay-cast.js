const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const AirPlay = require('airplay-protocol');

ffmpeg.setFfmpegPath(ffmpegPath);
const airplay = new AirPlay('192.168.2.39');
const transcoderCtx = {};

export const atvPlay = (config) => async (req, res) => {
  console.log(`[airplay-cast] /play ${req.body.videoUrl}`);

  try {
    const airplayURL = `${config.BaseUrl}/transcode/${encodeURIComponent(req.body.videoUrl)}`;
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

export const atvTranscoder = (config) => async (req, res) => {
  const videoUrl = req.params.videoUrl;
  console.log(`[aircast] transcoding ${videoUrl}`);

  if (transcoderCtx.command && transcoderCtx.command.kill) {
    transcoderCtx.command.kill();
    delete transcoderCtx.command;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');

  transcoderCtx.command = ffmpeg(videoUrl, { timeout: 432000 })
    .addOptions([
      '-acodec aac',
      '-ac 6',
      '-ab 640k',
      '-maxrate 25M',
      '-bufsize 10M',
      '-preset ultrafast',
      '-profile:v baseline',
      '-level 3.0',
      '-vcodec libx264',
      '-s 1280x720',
      '-crf 14',
      '-pix_fmt yuv420p',
      '-r 24',
      '-movflags frag_keyframe+empty_moov',
      '-f mpegts',
      '-hls_flags single_file',
    ])
    .on('stderr', stderr => {
      console.error(stderr);
    })
    .on('error', err => {
      console.error(err);
    })
    .pipe(res, { end: true });

  req.on('close', () => {
    console.log('Closed by client');
    const command = transcoderCtx.command;

    if (command && command.kill) {
      try {
        delete transcoderCtx.command;
        command.kill();
      } catch (e) {
      }
    }
  });
};
