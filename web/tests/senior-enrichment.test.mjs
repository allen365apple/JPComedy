import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { profiles } from '../content/profiles.mjs';

const batch = JSON.parse(await readFile(new URL('../content/senior-enrichment-2026-10-14.json', import.meta.url), 'utf8'));

test('eight senior profiles receive detailed, dated, source-backed introductions', () => {
  assert.equal(batch.profiles.length, 8);
  assert.equal(profiles.length, 271);
  for (const entry of batch.profiles) {
    const profile = profiles.find(item => item.id === entry.id);
    assert.ok(profile);
    assert.ok(!profile.postSeq, 'weekly articles must not be overridden');
    assert.deepEqual(profile.researchedArticle, entry.researchedArticle);
    assert.deepEqual(profile.works, entry.works);
    assert.equal(profile.researchedArticle.checkedAt, '2026-10-14');
    assert.ok(profile.researchedArticle.text.length >= (entry.id === 'downtown' ? 500 : 800));
    assert.ok(profile.researchedArticle.text.split('\n\n').length >= 5);
    assert.ok(profile.researchedArticle.sources.length >= 3);
    assert.ok(profile.works.length >= 2);
    for (const item of [...profile.researchedArticle.sources, ...profile.works]) {
      assert.equal(new URL(item.url).protocol, 'https:');
    }
  }
});

test('enrichment leaves other artists and base identity data unchanged', async () => {
  const base = JSON.parse(await readFile(new URL('../content/profiles.json', import.meta.url), 'utf8'));
  const enriched = new Set(batch.profiles.map(item => item.id));
  for (const original of [...base.profiles, ...(base.profilesSupplement || [])]) {
    const updated = profiles.find(item => item.id === original.id);
    if (updated.weeklyUpdate) {
      const { weeklyUpdate, sources, aliases, ...after } = updated;
      const { sources: beforeSources, aliases: beforeAliases, ...before } = original;
      assert.deepEqual(after, before);
      assert.deepEqual(sources.slice(0, beforeSources.length), beforeSources);
      assert.ok((beforeAliases || []).every(alias => aliases.includes(alias)));
    } else if (!enriched.has(original.id)) assert.deepEqual(updated, original);
    else {
      const { researchedArticle, works, ...before } = original;
      const { researchedArticle: articleAfter, works: worksAfter, ...after } = updated;
      assert.deepEqual(after, before);
    }
  }
});

test('Downtown keeps a concise summary with personal roles and historical status', () => {
  const group = profiles.find(item => item.id === 'downtown');
  assert.ok(group.researchedArticle.text.length < 1000);
  assert.ok(group.researchedArticle.text.includes('2025 年結束'));
  assert.ok(group.researchedArticle.text.includes('IPPONグランプリ'));
  assert.ok(group.works.some(item => item.kind.includes('松本個人')));
  assert.ok(group.works.some(item => item.kind.includes('濱田主持')));
});
