const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const BROWSERS = ['chrome', 'firefox'];

const COPY_FILES = [
  'popup.html',
  'popup.css',
  'popup.js',
  'background.js',
  'background-video-downloader.js',
  'video-downloader-popup.html',
  'video-downloader-popup.js',
  'video-downloader-popup.css',
  'watcher.js',
  'convert-image.html',
  'convert-image.js',
  'tab-switcher.html',
  'tab-switcher.css',
  'tab-switcher.js'
];

const COPY_DIRS = [
  'content',
  'lib',
  'icons',
  'assets'
];

const ICON_SIZES = [16, 48, 128];

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function generateIcons() {
  const sharp = require('sharp');
  const svgBuffer = fs.readFileSync(path.join(SRC, 'icons', 'icon.svg'));

  for (const size of ICON_SIZES) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(SRC, 'icons', `icon${size}.png`));
    console.log(`  Generated icon${size}.png`);
  }
}

async function build(browser) {
  const distPath = path.join(DIST, browser);
  console.log(`\nBuilding for ${browser}...`);

  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true });
  }
  fs.mkdirSync(distPath, { recursive: true });

  for (const file of COPY_FILES) {
    const src = path.join(SRC, file);
    const dest = path.join(distPath, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  Copied ${file}`);
    }
  }

  for (const dir of COPY_DIRS) {
    const src = path.join(SRC, dir);
    if (fs.existsSync(src)) {
      copyDir(src, path.join(distPath, dir));
      const svg = path.join(distPath, dir, 'icon.svg');
      if (fs.existsSync(svg)) fs.unlinkSync(svg);
      console.log(`  Copied ${dir}/`);
    }
  }

  const manifestSrc = path.join(SRC, `manifest.${browser}.json`);
  const manifestDest = path.join(distPath, 'manifest.json');
  fs.copyFileSync(manifestSrc, manifestDest);
  console.log(`  Copied manifest.${browser}.json -> manifest.json`);

  console.log(`  Done! Output: ${distPath}`);
}

async function main() {
  const target = process.argv[2];

  console.log('Generating icons...');
  await generateIcons();

  if (target && BROWSERS.includes(target)) {
    await build(target);
  } else {
    for (const browser of BROWSERS) {
      await build(browser);
    }
  }

  console.log('\nBuild complete!');
  console.log('  Chrome:  dist/chrome/  -> Load unpacked extension');
  console.log('  Firefox: dist/firefox/ -> web-ext run (or load temporary add-on)\n');
}

main().catch(console.error);
