// 最後更新：2026-11-23 10:10（台北時間）
// 誰幫忙的：ChatGPT Codex（GPT-6；Codex 桌面版）
// 修改摘要：使用共用工作區的原始貼文驗證十篇授權文章。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { profiles } from '../content/profiles.mjs';
import { filterGroups } from '../public/catalog.mjs';
import { resolveWorkspace } from '../scripts/workspace.mjs';
import path from 'node:path';

const batch = JSON.parse(await readFile(new URL('../content/weekly-update-2026-10-14.json', import.meta.url), 'utf8'));
const data = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
const authorized = JSON.parse(await readFile(new URL('../content/weekly-authorized-2026-10-14.json', import.meta.url), 'utf8'));
const workspace = resolveWorkspace(import.meta.url);
const archive = path.join(workspace, 'manzaiweek-archive');
const originalBatch = JSON.parse(await readFile(path.join(archive, 'apify-check-2026-10-14.json'), 'utf8'));
const recovered = await Promise.all(['2026-10-26', '2026-11-02'].map(async date => (
  JSON.parse(await readFile(path.join(archive, `actor-posts-${date}-recovered-2026-11-16.json`), 'utf8'))
)));
const originals = [...originalBatch.posts, ...recovered.flat()];

test('glossary snapshot has its update date without relabelling old basic artist data', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../public/glossary-snapshot.json', import.meta.url), 'utf8'));
  assert.equal(snapshot.generatedAt, '2026-10-18');
  assert.equal(data.groups.find(g => g.id === 'takuro').checkedAt, '2026-10-02');
});

test('six source-checked duos are added once with whole-group photos and glossary identities', async () => {
  assert.equal(batch.newProfiles.length, 6);
  assert.equal(batch.pending.length, 1);
  assert.equal(batch.pending[0].jp, 'おーばーすぺっく');
  for (const entry of batch.newProfiles) {
    const group = data.groups.find(g => g.id === entry.id);
    const glossary = batch.glossaryEntries.find(g => g.group.jp.includes(entry.jp));
    assert.equal(group.zh, glossary.group.zh);
    assert.equal(group.checkedAt, '2026-10-14');
    assert.equal(group.members.length, 2);
    assert.deepEqual(group.members.map(m => m.jp), batch.coverOrder[group.id]);
    assert.deepEqual(group.members.map(m => m.photoPosition), ['left', 'right']);
    assert.ok(group.photo.credit && group.photo.url.startsWith('https://'));
    assert.equal(group.researchedArticle, undefined);
    assert.ok(group.weeklyUpdate.text.length > 100);
    await access(new URL('../public/' + group.cover, import.meta.url));
  }
});

test('ten authorized Weekly texts retain exact full posts or complete original sections', () => {
  assert.equal(Object.keys(batch.weeklyUpdates).length, 8);
  assert.equal(Object.keys(authorized.weeklyUpdates).length, 10);
  for (const [id, article] of Object.entries(authorized.weeklyUpdates)) {
    const group = data.groups.find(g => g.id === id);
    assert.deepEqual(group.weeklyUpdate, article);
    assert.equal(article.isSummary, false);
    assert.equal(article.permission, 'user-confirmed-authorized');
    const original = originals.find(p => String(p.postId) === article.id);
    assert.ok(original && original.text.includes(article.text));
    if (article.contentKind === 'full-post') assert.equal(article.text, original.text);
    assert.equal(article.textSha256, createHash('sha256').update(article.text).digest('hex'));
    assert.equal(group.researchedArticle, undefined);
    const url = new URL(article.url);
    assert.equal(url.origin, 'https://www.facebook.com');
    if (url.pathname === '/permalink.php') {
      assert.equal(url.searchParams.get('id'), '61571407746423');
      assert.match(url.searchParams.get('story_fbid') || '', /^pfbid[a-zA-Z0-9]+$/);
    } else {
      assert.equal(url.pathname, `/61571407746423/posts/${article.id}`);
    }
    assert.equal(group.article, null);
  }
  assert.equal(data.groups.filter(g => g.article).length, 64);
  assert.equal(profiles.find(g => g.id === 'nanamagari').researchedArticle, undefined);
  assert.equal(filterGroups(data.groups, { query: '七曲' })[0].id, 'nanamagari');
  assert.equal(filterGroups(data.groups, { query: '回憶財閥' })[0].id, 'omoide-zaibatsu');
});

test('Weekly text takes precedence over any optional editorial feature', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(g\.weeklyUpdate\) return weeklyArticle\(g\)/);
  assert.match(app, /完整原文/);
  assert.match(app, /刊載授權/);
  assert.doesNotMatch(app, /以下為本站整理的重點摘要/);
  assert.match(app, /閱讀完整原文/);
  assert.match(app, /esc\(source\.text\)/);
});
