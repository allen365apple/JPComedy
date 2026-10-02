import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  counts, visibleItems, validateMapping, validateDraft, commitEditor,
  buildLinkIndex, linkForUnit, unitIndexForGroup, createMockBackend, createApi,
} from '../public/glossary-core.mjs';

const snapshot = JSON.parse(await readFile(new URL('../public/glossary-snapshot.json', import.meta.url), 'utf8'));
const data = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
const full = snapshot.data;

test('snapshot and artist pages cover the same complete shared artist roster', () => {
  assert.ok(full.talents.length >= 200, `expected the full talent list, got ${full.talents.length}`);
  assert.ok(full.others.length > 0);
  assert.equal(full.talents.length, data.groups.length, 'all glossary artists now have a profile page');
  for (const [jp, zh] of [['コウテイ', 'Kōtei'], ['ザブングル', 'Zabungle'], ['ずん', 'Zun']]) {
    const entry = full.talents.find(t => t.group?.jp.includes(jp));
    assert.equal(entry?.group.zh, zh, `${jp} must be included in the shared glossary snapshot`);
  }
  const c = counts(full);
  assert.equal(c.all, full.talents.filter(t => !t.disabled).length + full.others.filter(o => !o.disabled).length);
});

test('filters and search cover groups, solo, others, archived, members and notes', () => {
  const groups = visibleItems(full, { filter: 'groups' });
  assert.ok(groups.every(i => i.value.group && !i.value.disabled));
  const solo = visibleItems(full, { filter: 'solo' });
  assert.ok(solo.every(i => !i.value.group && !i.value.disabled));
  const others = visibleItems(full, { filter: 'others' });
  assert.ok(others.every(i => i.type === 'other'));
  // Member search: 東峰零士 is a member alias inside カナメストーン.
  const byMember = visibleItems(full, { filter: 'all', search: '東峰零士' });
  assert.ok(byMember.length >= 1);
  // Newly added second-batch entries are searchable.
  assert.ok(visibleItems(full, { filter: 'all', search: 'センチネル' }).length >= 1);
});

test('validation normalises aliases and rejects empty mappings', () => {
  const m = validateMapping({ jp: [' 金属バット ', '金属バット', ''], zh: ' 金屬球棒 ' }, '組合');
  assert.deepEqual(m.jp, ['金属バット']);
  assert.equal(m.zh, '金屬球棒');
  assert.throws(() => validateMapping({ jp: [''], zh: 'x' }, '組合'), /日文名稱/);
  assert.throws(() => validateMapping({ jp: ['x'], zh: '' }, '組合'), /繁中譯名/);
  assert.throws(() => validateDraft({ type: 'talent', draft: { group: null, members: [] } }), /成員/);
});

test('commitEditor adds and updates without touching other entries', () => {
  const before = full.talents.length;
  const added = commitEditor(full, { type: 'talent', isNew: true, draft: { group: { jp: ['テスト組'], zh: '測試組' }, members: [{ jp: ['甲'], zh: '甲' }] } });
  assert.equal(added.talents.length, before + 1);
  assert.equal(added.talents[0].group.zh, '測試組');
  assert.equal(full.talents.length, before, 'source data must not be mutated');
  const edited = commitEditor(full, { type: 'talent', isNew: false, index: 0, draft: { group: { jp: ['X'], zh: 'X譯' }, members: [{ jp: ['甲'], zh: '甲' }] } });
  assert.equal(edited.talents[0].group.zh, 'X譯');
});

test('artist links resolve stable ids in both directions for the complete roster', () => {
  const index = buildLinkIndex(data.groups);
  const kinzoku = full.talents.find(t => t.group && t.group.jp.includes('金属バット'));
  assert.equal(linkForUnit(kinzoku, index), 'kinzoku-bat');
  const group = data.groups.find(g => g.id === 'sentinel');
  const idx = unitIndexForGroup(full, group);
  assert.ok(idx >= 0 && full.talents[idx].group.jp.includes('センチネル'));
  for (const talent of full.talents) {
    assert.ok(linkForUnit(talent, index), `missing profile link for ${talent.group?.jp?.join('/') || talent.members?.[0]?.jp?.join('/')}`);
  }
  for (const artist of data.groups) assert.ok(full.talents.some(talent => linkForUnit(talent, index) === artist.id));
});

test('save uses SHA optimistic concurrency: the second editor gets 409, not a silent overwrite', async () => {
  const backend = createMockBackend(full, 'sha-base');
  const editorA = createApi({ mode: 'fixture', backend });
  const editorB = createApi({ mode: 'fixture', backend });
  const loadA = await editorA.load();
  const loadB = await editorB.load();
  assert.equal(loadA.sha, loadB.sha);
  // Editor A saves first on the shared base sha.
  const draftA = commitEditor(loadA.data, { type: 'other', isNew: true, draft: { jp: ['甲用語'], zh: '甲' } });
  const savedA = await editorA.save(draftA, loadA.sha);
  assert.notEqual(savedA.sha, loadA.sha);
  // Editor B still holds the stale base sha and must be rejected.
  const draftB = commitEditor(loadB.data, { type: 'other', isNew: true, draft: { jp: ['乙用語'], zh: '乙' } });
  await assert.rejects(() => editorB.save(draftB, loadB.sha), (e) => e.status === 409);
  // The server still holds editor A's data — B did not clobber it.
  assert.ok(backend.peek().data.others.some(o => o.jp.includes('甲用語')));
  assert.ok(!backend.peek().data.others.some(o => o.jp.includes('乙用語')));
  // Only after adopting the latest sha can B save (its own draft), never by blind SHA swap.
  const latest = await editorB.refresh();
  const merged = commitEditor(latest.data, { type: 'other', isNew: true, draft: { jp: ['乙用語'], zh: '乙' } });
  const savedB = await editorB.save(merged, latest.sha);
  assert.ok(savedB.data.others.some(o => o.jp.includes('甲用語')) && savedB.data.others.some(o => o.jp.includes('乙用語')));
});
