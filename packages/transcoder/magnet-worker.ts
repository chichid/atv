import { Worker, parentPort, isMainThread, workerData } from 'worker_threads';
import * as Config from './config';

const cache = {
  currentTorrent: null,
};

const cleanup = async () => {
  if (cache.currentTorrent) {
    console.log(`[magnet-worker] closing previous server`)
    cache.currentTorrent.server.close();

    console.log(`[magnet-worker] closing previous torrent client`)
    await new Promise((resolve, reject) => cache.currentTorrent.webTorrentClient.destroy((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    }));

    cache.currentTorrent = null;
  }
};

const startTorrent = async (url: string): Promise<{ streamUrl: string }> => {
  await cleanup();

  // TODO config
  let server = null;
  const port = 9666;

  const WebTorrent = require('webtorrent');
  const webTorrentClient = new WebTorrent();
  console.log(`[magnet-worker] adding torrent for url ${url}`);

  const options = {
    path: Config.TmpFolder,
  };

  const torrent: any = await new Promise((resolve, reject) => webTorrentClient.add(url, options, torrent => {
    console.log(`[magnet-worker] added torrent ${url} successfully`);
    server = torrent.createServer();
    server.listen(port, err => {
      if (err) {
        reject(err);
      } else {
        console.log(`[magnet-worker] torrent for url server listening at ${port}`);
        resolve(torrent);
      }
    });
  }));

  cache.currentTorrent = {
    webTorrentClient,
    server, 
    torrent,
  };

  const extensions = Config.TorrentVideoFiles;
  const videoFile = torrent.files.find(torrentFile => extensions.some(ext => torrentFile.name.endsWith(ext)));

  if (!videoFile) {
    throw new Error(`torrent at url ${url} has no video files`)
  }

  const index: number = torrent.files.indexOf(videoFile);
  const outputFile: string = `http://localhost:${port}/${index}/${encodeURIComponent(videoFile.name)}`;

  console.log(`[magnet-worker] torrent ready for ${url}, videoOutput: ${outputFile}`);

  return {
    streamUrl: outputFile,
  };
}

(async () => {
  if (!isMainThread && workerData) {
    console.log(`[magnet-worker] starting magnet ${workerData.url}`)

    try {
      const { streamUrl } = await startTorrent(workerData.url);
      parentPort.postMessage({ streamUrl });
    } catch(e) {
      console.error(`[magnet-worker] error ${e.message}`);
      console.error(e.stack);
      parentPort.postMessage({err: e.message});
    }
  }
})();

