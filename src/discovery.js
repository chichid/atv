module.exports.getWorkerList = async () => new Promise((resolve, reject) => {
  resolve([
    'http://192.168.2.42:8666',
    //'http://192.168.2.45:8666',
  ]);
});

module.exports.getMainWorker = async () => new Promise((resolve, reject) => {
  resolve('http://192.168.2.42:8666');
});
