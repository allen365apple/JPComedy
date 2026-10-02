import { access, mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceDir = path.join(root, 'public');
const releaseDir = path.join(root, 'public-release');
const source = JSON.parse(await readFile(path.join(root, 'content/public-data.json'), 'utf8'));
const staticFiles = ['index.html', 'app.js', 'catalog.mjs', 'glossary-core.mjs', 'glossary.mjs', 'styles.css', 'favicon.svg', 'profile-placeholder.svg'];
await mkdir(releaseDir, { recursive: true });
for (const file of staticFiles) await copyFile(path.join(sourceDir, file), path.join(releaseDir, file));

const assetPaths = new Set();
for (const group of source.data.groups) {
  if (group.cover?.startsWith('assets/')) assetPaths.add(group.cover);
  for (const image of group.article?.images || []) {
    if (image.src?.startsWith('assets/')) assetPaths.add(image.src);
  }
}
for (const relativePath of assetPaths) {
  const sourcePath = path.join(sourceDir, relativePath);
  await access(sourcePath);
  const targetPath = path.join(releaseDir, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

await writeFile(path.join(releaseDir, 'data.json'), JSON.stringify(source.data, null, 2) + '\n');
await writeFile(path.join(releaseDir, 'glossary-snapshot.json'), JSON.stringify(source.glossary, null, 2) + '\n');
await writeFile(path.join(releaseDir, 'site-config.js'), `// Public settings only; no password or token is stored here.\nwindow.JPCOMEDY_SITE = ${JSON.stringify({
  glossaryMode: 'cloud',
  cloud: { repository: 'allen365apple/jpcomedy-glossary', branch: 'main', apiBase: 'https://jpcomedy-glossary.allen365apple.workers.dev' },
}, null, 2)};\n`);
console.log(`Built public-release with ${source.data.groups.length} profiles and ${assetPaths.size} source-attributed image assets.`);
