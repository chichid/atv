const fs = require('fs');
const { beautifyLogo } = require('../src/logos');

// TODO possible enhancement by providing the google drive folder directly
(async function main() {
	const args = process.argv.slice(2);
	const inputDir = args[0];
	const outputDir = args[1] || (args[0] + '/' + 'out');

	console.log(args);
	console.log(`Fixing Logos in ${inputDir}, output: ${outputDir}...`);

	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	const inputFiles = fs.readdirSync(inputDir);

	for (const file of inputFiles) {
		const filePath = inputDir + '/' + file;

		if (fs.lstatSync(filePath).isDirectory()) {
			continue;
		}

		const buffer = await beautifyLogo('file://' + filePath);
    fs.writeFileSync(outputDir + '/' + file, buffer);

		if (file.indexOf('(') !== -1) {
			fs.unlink(filePath, () => {});
			continue;
		}
	}

	console.log(`Done Fixing Logos.`);
})();
