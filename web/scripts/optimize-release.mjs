import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { prepareFastData } from './prepare-fast-data.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.JPCOMEDY_SHARP_MODULE || 'sharp');
const root = fileURLToPath(new URL('../public-release/', import.meta.url));
const data = JSON.parse(await readFile(path.join(root, 'data.json'), 'utf8'));
await mkdir(path.join(root, 'assets/optimized'), { recursive: true });
const cache = new Map();

/** Create a resized WebP derivative without cropping, upscaling or modifying the source photo. */
async function variant(relative, width) {
  if (!relative?.startsWith('assets/') || relative.endsWith('.svg')) return relative;
  const key = `${relative}:${width}`;
  if (cache.has(key)) return cache.get(key);
  const input = await readFile(path.join(root, relative));
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  const output = `assets/optimized/${path.parse(relative).name}-${hash}-${width}.webp`;
  await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(root, output));
  cache.set(key, output);
  return output;
}

for (const group of data.groups) {
  const original = group.cover;
  group.coverSmall = await variant(original, 480);
  group.cover = await variant(original, 960);
  for (const image of group.article?.images || []) image.src = await variant(image.src, 1100);
  for (const image of group.memberPhotos || []) image.src = await variant(image.src, 960);
}
await writeFile(path.join(root, 'data.json'), JSON.stringify(data));
await prepareFastData(root, data);
const version = createHash('sha256').update(JSON.stringify(data)).update(await readFile(path.join(root, 'app.js'))).digest('hex').slice(0, 12);
const configFile = path.join(root, 'site-config.js');
await writeFile(configFile, (await readFile(configFile, 'utf8')).replace('window.JPCOMEDY_SITE = {', `window.JPCOMEDY_SITE = {\n  "assetVersion": "${version}",`));
const indexFile = path.join(root, 'index.html');
let html = await readFile(indexFile, 'utf8');
html = html.replace('./site-config.js', `./site-config.js?v=${version}`).replace('./app.js', `./app.js?v=${version}`);
html = html.replace('</head>', `<link rel="preload" href="./catalog.json?v=${version}" as="fetch" crossorigin>\n<link rel="preload" href="./${data.groups[0].cover}" as="image" fetchpriority="high">\n</head>`);
await writeFile(indexFile, html);
console.log(`Prepared fast catalog, ${data.groups.length} on-demand profiles and ${cache.size} WebP derivatives; originals preserved.`);
