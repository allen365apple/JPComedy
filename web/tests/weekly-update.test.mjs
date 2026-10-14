import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { profiles } from '../content/profiles.mjs';
import { filterGroups } from '../public/catalog.mjs';

const batch = JSON.parse(await readFile(new URL('../content/weekly-update-2026-10-14.json', import.meta.url), 'utf8'));
const data = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));

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
    assert.ok(group.researchedArticle.text.length > 300);
    assert.ok(group.researchedArticle.positioningSources.length >= 2);
    await access(new URL('../public/' + group.cover, import.meta.url));
  }
});

test('eight new Weekly summaries are explicitly attributed and do not replace old full text', () => {
  assert.equal(Object.keys(batch.weeklyUpdates).length, 8);
  for (const [id, summary] of Object.entries(batch.weeklyUpdates)) {
    const group = data.groups.find(g => g.id === id);
    assert.deepEqual(group.weeklyUpdate, summary);
    assert.ok(summary.isSummary && summary.text && summary.publishedAt);
    assert.match(summary.url, /^https:\/\/www\.facebook\.com\/61571407746423\/posts\/\d+$/);
    assert.equal(group.article, null);
  }
  assert.equal(data.groups.filter(g => g.article).length, 64);
  assert.ok(profiles.find(g => g.id === 'nanamagari').researchedArticle);
  assert.equal(filterGroups(data.groups, { query: '七曲' })[0].id, 'nanamagari');
  assert.equal(filterGroups(data.groups, { query: '回憶財閥' })[0].id, 'omoide-zaibatsu');
});

test('summary UI distinguishes editorial summary from the original author text', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /以下為本站整理的重點摘要，並非作者全文/);
  assert.match(app, /閱讀完整原文/);
  assert.match(app, /esc\(source\.text\)/);
});
