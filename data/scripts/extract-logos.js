#!/usr/bin/node

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const request = require('request');

const args = process.argv.slice(2);
const inputFile = args[0];
const outDir = args[1];

const source = fs.readFileSync(inputFile).toString();

const logos = source.split('\n')
	.map(line => {
		if (!line.startsWith("#EXTINF")) {
			return null;
		}

		const channel = line.split(',')[1].trim().replace(/\n/g, '');
		const matches = line.match(`tvg-logo="([^]*)"`);

		if (!matches || !matches[1]) {
			console.warn(`channel "${channel}" has no logo`);
			return null;
		} else {
			return {
				channel,
				url: matches[1]
			};
		}
	})
	.filter(logo => logo ? true : false);

if (!fs.existsSync(outDir)) {
	fs.mkdirSync(outDir, { recursive: true });
}

//for (const logo in logos.slice(0, 1)) {
const fetchLogo = (logo) => new Promise(resolve => {
	const ext = path.extname(logo.url);
	const normalizeChannel = logo.channel.replace(/ /g, '').toLowerCase();
	const outFile = path.join(outDir, normalizeChannel + ext);

	request(logo).pipe(fs.createWriteStream(outFile)).on('finish', () => {
		console.log(`writing logo ${outFile} completed.`);
		resolve();
	});
});
//}

(async function() {
	const PARALLEL_REQUESTS = 25;
	for (let i = 0; i < logos.length; i += PARALLEL_REQUESTS) {
		const currentSlice = logos.slice(i, Math.min(i + PARALLEL_REQUESTS, logos.length));
		await Promise.all(currentSlice.map(fetchLogo));
	}

	console.log('done');
})();
