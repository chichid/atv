#!/usr/bin/node

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const request = require('request').defaults({ rejectUnauthorized: false });
const URL = require('url');

const args = process.argv.slice(2);
const inputFile = args[0];
const outDir = args[1];

const source = fs.readFileSync(inputFile).toString();

const logos = source.split('\n')
	.map(line => {
		if (!line.startsWith("#EXTINF")) {
			return null;
		}

		const channelNameMatch = line.match(`tvg-name="([^"]*)"`);
		const extractedChannelName = (channelNameMatch && channelNameMatch[1]) || line.split(',')[1];
		const channel = extractedChannelName.trim()
			.replace(/\n/g, '')
			.replace(/\\/g, '')
			.replace(/\//g, '')
			.replace(/\*/g, '')
			.replace(/\|/g, '');

		const tvgLogoMatch = line.match(`tvg-logo="([^"]*)"`);
		const tvgLogo = tvgLogoMatch && tvgLogoMatch[1];

		if (tvgLogo && (tvgLogo.startsWith('http://') || tvgLogo.startsWith('https://'))) {
			return {
				channel,
				url: tvgLogo
			};
		} else if (tvgLogo) {
			console.warn(`skipping channel "${channel}" due to corrupt logo ${tvgLogo}`);
		} else {
			console.warn(`channel "${channel}" has no logo`);
			return null;
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

	const url = URL.parse(logo.url).href;
	console.log(url);
	request(encodeURI(url))
		.pipe(fs.createWriteStream(outFile))
		.on('error', err => console.error(`Error while loading ${url}: ${err}`))
		.on('finish', () => {
			console.log(`writing logo ${outFile} completed.`);
			resolve();
		});
});
//}

(async function() {
	const PARALLEL_REQUESTS = 100;
	for (let i = 0; i < logos.length; i += PARALLEL_REQUESTS) {
		const currentSlice = logos.slice(i, Math.min(i + PARALLEL_REQUESTS, logos.length));
		await Promise.all(currentSlice.map(cs => fetchLogo(cs).catch(e => console.error(e))));
	}

	console.log('done');
})();
