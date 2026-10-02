import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'public');
const committedDataPath = path.join(root, 'content/public-data.json');
const localDataText = await readFile(path.join(publicDir, 'data.json'), 'utf8').catch(() => null);
const localSnapshotText = await readFile(path.join(publicDir, 'glossary-snapshot.json'), 'utf8').catch(() => null);
if (!localDataText || !localSnapshotText) {
  if (!await readFile(committedDataPath, 'utf8').catch(() => null)) {
    throw new Error('找不到本機建置資料，也找不到已提交的 content/public-data.json');
  }
  console.log('未找到本機 archive 建置產物，沿用已提交的 content/public-data.json。');
  process.exit(0);
}
const localData = JSON.parse(localDataText);
const localSnapshot = JSON.parse(localSnapshotText);
const allowlist = JSON.parse(await readFile(path.join(root, 'content/public-allowlist.json'), 'utf8'));
const wanted = new Set(allowlist.profileIds);
const missing = allowlist.profileIds.filter((id) => !localData.groups.some((group) => group.id === id));
if (missing.length) throw new Error(`公開清單找不到藝人：${missing.join(', ')}`);
if (allowlist.weeklyArticlePolicy !== 'all-current-with-source' || allowlist.imagePolicy !== 'all-current-with-source') {
  throw new Error('公開清單必須明確指定目前文章與圖片皆保留來源後才能建置。');
}

const groups = localData.groups.filter((group) => wanted.has(group.id)).map((group) => {
  if (group.article) {
    if (!group.article.url || !Array.isArray(group.article.images) || group.article.images.length === 0) {
      throw new Error(`藝人 ${group.id} 的《每週漫才》文章缺少來源或圖片資料`);
    }
    for (const image of group.article.images) {
      if (!image.src || !image.credit) throw new Error(`藝人 ${group.id} 有圖片缺少來源標示`);
      if (image.permission !== 'local-preview-only') throw new Error(`藝人 ${group.id} 的圖片權限標記不符合目前來源政策`);
    }
  }
  if (group.photo && !group.photo.credit) throw new Error(`藝人 ${group.id} 缺少主照片來源標示`);
  return {
    ...group,
    article: group.article ? {
      ...group.article,
      permission: 'public-source-attributed',
      images: group.article.images.map((image) => ({ ...image, permission: 'public-source-attributed' })),
    } : null,
    photo: group.photo ? { ...group.photo, permission: 'public-source-attributed' } : group.photo,
    members: group.members.map(({ positionSource, ...member }) => member),
  };
});

const relatedIds = new Set(groups.map((group) => group.id));
const resources = localData.resources.map((resource) => ({
  ...resource,
  related: resource.related?.filter((id) => relatedIds.has(id)) || [],
}));
const glossary = {
  ...localSnapshot,
  source: 'JPComedy 共用漫才詞庫公開快照',
  permission: 'public-glossary-snapshot',
};
const output = {
  generatedAt: new Date().toISOString(),
  policy: {
    mode: allowlist.mode,
    weeklyArticles: allowlist.weeklyArticlePolicy,
    images: allowlist.imagePolicy,
    note: allowlist.note,
  },
  data: {
    ...localData,
    meta: {
      ...localData.meta,
      count: groups.length,
      glossarySource: glossary.source,
      publication: 'public-source-attributed',
    },
    groups,
    resources,
  },
  glossary,
};
await writeFile(committedDataPath, JSON.stringify(output, null, 2) + '\n');
console.log(`Prepared public source-attributed data: ${groups.length} profiles, ${glossary.data.talents.length} glossary talents, ${glossary.data.others.length} other terms. Current articles and images included.`);
