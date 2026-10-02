import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(webRoot, process.env.PUBLIC_DIR || 'public');
const required = ['index.html', 'app.js', 'catalog.mjs', 'glossary-core.mjs', 'glossary.mjs', 'site-config.js', 'styles.css', 'favicon.svg', 'data.json', 'glossary-snapshot.json'];
const forbiddenMarkers = [
  'local-preview-only',
  '/Users/',
  'BEGIN PRIVATE KEY',
  'ghp_',
  'github_pat_',
  'sk-',
];

async function assertFile(relativePath) {
  const filePath = path.join(publicRoot, relativePath);
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) throw new Error(`公開產物缺少檔案：public/${relativePath}`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.relative(publicRoot, path.join(directory, entry.name));
    if (entry.name.startsWith('.')) throw new Error(`公開產物包含隱藏檔案：public/${relative}`);
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name)));
    else files.push(relative);
  }
  return files;
}

for (const file of required) await assertFile(file);

const data = JSON.parse(await readFile(path.join(publicRoot, 'data.json'), 'utf8'));
const snapshot = JSON.parse(await readFile(path.join(publicRoot, 'glossary-snapshot.json'), 'utf8'));
if (!Array.isArray(data.groups) || data.groups.length === 0) throw new Error('公開 data.json 沒有藝人資料');
if (!snapshot.data?.talents || !Array.isArray(snapshot.data.others)) throw new Error('公開詞庫快照格式不完整');

const files = await walk(publicRoot);
const textFiles = files.filter((file) => /\.(html|js|mjs|css|json|svg|txt)$/i.test(file));
for (const relative of textFiles) {
  const text = await readFile(path.join(publicRoot, relative), 'utf8');
  const marker = forbiddenMarkers.find((value) => text.includes(value));
  if (marker) throw new Error(`公開檔案 ${relative} 含有禁止發布內容：${marker}`);
}

for (const group of data.groups) {
  if (group.cover && !group.cover.startsWith('http')) await assertFile(group.cover);
  if (group.article) {
    if (!group.article.url || !Array.isArray(group.article.images) || group.article.images.length === 0) {
      throw new Error(`公開藝人 ${group.id} 的《每週漫才》文章缺少來源或圖片`);
    }
    if (group.article.permission !== 'public-source-attributed') {
      throw new Error(`公開藝人 ${group.id} 的文章沒有標記為 source-attributed`);
    }
    for (const image of group.article.images) {
      if (!image.src || !image.credit) throw new Error(`公開藝人 ${group.id} 有圖片缺少來源標示`);
      if (image.permission !== 'public-source-attributed') throw new Error(`公開藝人 ${group.id} 的圖片沒有標記為 source-attributed`);
      if (!image.src.startsWith('http')) await assertFile(image.src);
    }
  }
}

console.log(`Public artifact verified: ${data.groups.length} profiles, ${snapshot.data.talents.length} glossary talents, ${snapshot.data.others.length} other terms, ${files.length} files.`);
