const os = require('os');
const spawn = require('child_process').spawn;

if (os.arch() === 'x32' || os.arch() === 'x64') {
  console.log(`[postinstall] installing sharp`);
  const sharpInstall = spawn('npm', ['install', 'sharp', '--no-save']);
  process.stdin.pipe(sharpInstall.stdin);
  sharpInstall.stdout.pipe(process.stdout);
  sharpInstall.stderr.pipe(process.stderr);
} else {
  console.warn(`Skipping sharp as it's only supported for x32 and x64`);
}
