import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { profiles, resources, checkedAt, resultsSource, aliasSource, coverOrder, officialCovers, videoResources } from '../content/profiles.mjs';
import { resolveWorkspace } from './workspace.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Locate the source workspace without any machine-specific absolute path.
const workspace = resolveWorkspace(import.meta.url);
const archive = path.join(workspace, 'manzaiweek-archive');
const publicDir = path.join(root, 'public');
const sharedText = await readFile(path.join(workspace, 'jpcomedy-glossary/glossary.json'), 'utf8');
const pipelineText = await readFile(path.join(workspace, 'owarai-grillmaster/services/fixed_glossary/fixed_glossary.json'), 'utf8');
const shared = JSON.parse(sharedText);
const pipeline = JSON.parse(pipelineText);
const posts = JSON.parse(await readFile(path.join(archive, 'posts_all.json'), 'utf8'));
const credits = JSON.parse(await readFile(path.join(archive, 'media/CREDITS.json'), 'utf8'));
await mkdir(path.join(publicDir, 'assets'), { recursive: true });

/** Resolve one exact glossary alias, rejecting missing, disabled or ambiguous records. */
function talentFor(glossary, name) {
  const matches = glossary.talents.filter(t => !t.disabled && (t.group
    ? !t.group.disabled && t.group.jp.includes(name)
    : t.members.some(m => !m.disabled && m.jp.includes(name))));
  if (matches.length !== 1) throw new Error(`Expected one active glossary entry for ${name}`);
  return matches[0];
}

/** Use a small, readable top-level taxonomy; detailed tags remain secondary filters. */
function styleGroup(profile) {
  if (profile.styleGroup) return profile.styleGroup;
  if (profile.type === 'solo') return '單人表演';
  if (profile.type === 'ensemble') return '短劇／劇場式喜劇';
  const format = profile.format || '';
  if (/音樂|節奏/.test(format)) return '音樂／節奏式漫才';
  if (/情境|短劇|コント/.test(format)) return '短劇式漫才';
  if (/談話|しゃべくり/.test(format)) return '漫談式漫才';
  return '漫才（待分類）';
}

/** Import immutable source text and copy only the selected, user-supplied assets. */
async function importArticle(profile) {
  if (!profile.postSeq) return null;
  const post = posts.find(p => p.seq === profile.postSeq);
  const articleNames = [profile.jp, ...(profile.archiveNames || [])];
  if (!post || !articleNames.some(name => post.title.includes(name))) throw new Error(`Article mismatch: ${profile.id}`);
  const images = [];
  for (const file of post.images) {
    const credit = credits.images.find(i => i.file === file && i.post_id === post.post_id);
    if (!credit || !/^media\/[^/]+\.(jpg|png|webp)$/i.test(file)) throw new Error(`Image provenance missing: ${file}`);
    const target = `assets/${path.basename(file)}`;
    await copyFile(path.join(archive, file), path.join(publicDir, target));
    images.push({ src: target, credit: credit.credit, permission: 'local-preview-only' });
  }
  const video = new URL(post.youtube);
  video.searchParams.delete('si');
  return { id: post.post_id, title: post.title, text: post.text, publishedAt: post.time,
    url: post.permalink || post.url, provider: '每週漫才', images, videoUrl: video.href,
    permission: 'local-preview-only', textSha256: createHash('sha256').update(post.text).digest('hex') };
}

/** Join official metadata, editorial text, archive sources and glossary names by identity. */
async function buildProfile(p) {
  const entry = talentFor(shared, p.jp);
  const pipelineEntry = talentFor(pipeline, p.jp);
  if (JSON.stringify(entry) !== JSON.stringify(pipelineEntry)) throw new Error(`Glossary conflict: ${p.jp}`);
  const members = p.memberDetails.map(m => {
    const matches = entry.members.filter(x => !x.disabled && x.jp.includes(m.glossaryJp || m.jp));
    if (matches.length !== 1) throw new Error(`Member identity unresolved: ${m.jp}`);
    return { ...m, zh: matches[0].zh, glossaryAliases: matches[0].jp,
      match: m.glossaryJp ? 'verified-stage-name' : 'exact', aliasSource: m.glossaryJp ? aliasSource : null };
  });
  const article = await importArticle(p);
  const photo = officialCovers[p.id] || { ...article?.images[0], credit: '每週漫才存檔', url: article?.url };
  if (!photo.src) throw new Error(`Cover missing: ${p.id}`);
  await access(path.join(publicDir, photo.src));
  const type = p.type || 'duo';
  if (type === 'duo') {
    const order = coverOrder[p.id];
    if (!order || order.length !== members.length || !members.every(m => order.includes(m.jp))) throw new Error(`Cover identities missing: ${p.id}`);
    members.sort((a, b) => order.indexOf(a.jp) - order.indexOf(b.jp));
    members.forEach((m, i) => { m.photoPosition = i === 0 ? 'left' : 'right'; m.positionSource = photo.url; });
  }
  const canonical = entry.group || entry.members.find(m => m.jp.includes(p.jp));
  const { memberDetails, watch, forYou, rank, score, m1Id, repechage, ...rest } = p;
  const achievements = p.achievements || (m1Id ? [{ kind: '比賽', year: 2025, title: 'M-1 Grand Prix',
    detail: rank === 1 ? '冠軍' : `決賽第 ${rank} 名${repechage ? '（敗者復活）' : ''}`, url: resultsSource,
    competition: { finalRank: rank, firstRoundScore: score, repechage: !!repechage } }] : []);
  return { ...rest, type, styleGroup: styleGroup(p), zh: canonical.zh, glossaryAliases: canonical.jp,
    members, article, cover: photo.src, photo: { ...photo, permission: 'local-preview-only' }, checkedAt,
    achievements, works: p.works || [], videoUrl: p.videoUrl || article?.videoUrl,
    videoResource: videoResources[p.id] || null,
    sources: [
      ...(p.sources || []),
      ...(m1Id ? [{ label: 'M-1 官方組合資料', url: `https://www.m-1gp.com/combi/${m1Id}.html`, covers: '結成年、成員、讀音、出身與所屬' },
        { label: 'M-1 官方歷年成績', url: resultsSource, covers: '2025 比賽經歷' }] : []),
      ...(article ? [{ label: '每週漫才原文', url: article.url, covers: '介紹、風格與常見分工；存檔照片左右標示' }] : []),
      ...(officialCovers[p.id] ? [{ label: `圖片來源：${photo.credit}`, url: photo.url, covers: '本頁藝人照片；成員位置依來源標註' }] : []),
      ...(p.id === 'kaname-stone' ? [{ label: 'Maseki 官方成員資料', url: aliasSource, covers: '零士與東峰零士的身分對照' }] : [])] };
}

const groups = await Promise.all(profiles.map(buildProfile));
const data = { meta: { checkedAt, siteName: '日式搞笑大補帖', count: groups.length,
  sourcePostCount: posts.length, glossarySha256: createHash('sha256').update(sharedText).digest('hex'),
  glossarySource: '../jpcomedy-glossary/glossary.json', pipelineMatched: true,
  publication: 'local-preview-only', resultsSource }, groups, resources };
await writeFile(path.join(publicDir, 'data.json'), JSON.stringify(data, null, 2) + '\n');
const report = {
  checkedAt, groups: groups.length, members: groups.reduce((n,g) => n + g.members.length, 0),
  sharedAndPipelineMatch: true, glossarySha256: data.meta.glossarySha256,
  entries: groups.map(g => ({ id: g.id, type: g.type, jp: g.jp, zh: g.zh, articleTitle: g.article?.title || null,
    note: g.note || null, members: g.members.map(m => ({ jp: m.jp, zh: m.zh, glossaryAliases: m.glossaryAliases, match: m.match, aliasSource: m.aliasSource })) })),
  suggestedGlossaryAdditions: [{ group: 'カナメストーン', member: '東峰零士', alias: '零士', evidence: aliasSource, applied: false }]
};
await writeFile(path.join(root, 'glossary-crosswalk.json'), JSON.stringify(report, null, 2) + '\n');

// Ship a versioned, read-only snapshot of the complete shared glossary so the
// integrated 漫才詞庫 page can browse/edit every talent, member, program and
// term in fixture mode, and fall back to it when the live API is unavailable.
const glossaryActiveTalents = shared.talents.filter(t => !t.disabled).length;
const glossarySnapshot = {
  generatedAt: checkedAt,
  source: '../jpcomedy-glossary/glossary.json',
  sha256: data.meta.glossarySha256,
  counts: { talents: shared.talents.length, activeTalents: glossaryActiveTalents, others: shared.others.length },
  permission: 'read-only-snapshot',
  data: shared
};
await writeFile(path.join(publicDir, 'glossary-snapshot.json'), JSON.stringify(glossarySnapshot, null, 2) + '\n');
const { prepareFastData } = await import('./prepare-fast-data.mjs');
await prepareFastData(publicDir, data);

console.log(`Built ${groups.length} profiles, ${report.members} member mappings, ${groups.filter(g => g.article).length} complete source articles. Glossary snapshot: ${shared.talents.length} talents, ${shared.others.length} others. No source files modified.`);
