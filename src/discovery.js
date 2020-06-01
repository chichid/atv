const dgram = require('dgram');
const os = require('os');
const { CONFIG } = require('./config');

const brothers = [];
const server = dgram.createSocket({type: 'udp4', reuseAddr: true});

const Messages = {
	Bonjour: 'Bonjour!',
	Bye: 'Bye',
};

(() => {
  console.log(`[discovery] discovery service initializing...`);
  server.bind(CONFIG.Discovery.Port);
})();

module.exports.getWorkerList = async () => new Promise((resolve, reject) => {
  resolve(brothers);
});

server.on('listening', () => {
  const address = server.address();
  console.log(`[discovery] discovery service listening at ${address.address}:${address.port}, sending bonjour message...`);

	server.setBroadcast(true);
	sendMessage(Messages.Bonjour);
});

server.on('close', () => {
  console.log(`[discovery] close event received, sending bye`);
	sendMessage(Messages.Bye);
});

server.on('error', (err) => {
  console.log(`[discovery] server error:\n${err.stack}`);
  server.close();
});

process.on('SIGINT', () => {
  console.log(`[discovery] SIGINT`);
	sendMessage(Messages.Bye);
	setTimeout(() => process.exit(), 500);
});

process.on('exit', () => {
  console.log(`[discovery] process will exit`);
	sendMessage(Messages.Bye);
});

server.on('message', (message, rinfo) => {
	const { port, address } = rinfo;
	const msg = message ? message.toString() : '';
	const indexOfBrother = brothers.indexOf(address);
	const isRegistered = indexOfBrother !== -1;

	if (!address.startsWith(CONFIG.Discovery.LanAddrPrefix)) {
		return;
	}

	if (msg === Messages.Bye && isRegistered) {
		console.log(`[discovery] unregistering device ${rinfo.address}:${rinfo.port}`);
		brothers.splice(indexOfBrother, 1);
	} else if (msg === Messages.Bonjour && !isRegistered){
		console.log(`[discovery] registering device ${rinfo.address}:${rinfo.port}`);
		brothers.push(address);
		sendMessage(Messages.Bonjour);
	}
});

const sendMessage = msg => {
	const message = Buffer.from(msg);

  for (const addr of getBroadcastAddresses()) {
    server.send(message, 0, message.length, CONFIG.Discovery.Port, addr)
  }
};

const getBroadcastAddresses = () => {
	let result = [];
	let interfaces = os.networkInterfaces();

	for (let i in interfaces) {
		for (let data of interfaces[i]) {
			if (data.family !== 'IPv4') continue;
			if (data.address === '127.0.0.1') continue;
			const address = data.address.split('.').map(e => parseInt(e));
			const netmask = data.netmask.split('.').map(e => parseInt(e));
			result.push(address.map((e, i) => (~netmask[i] & 0xff) | e).join('.'))
		}
	}

	return result;
}

