import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareFastData } from '../scripts/prepare-fast-data.mjs';

test('fast catalog retains searchable fields and complete profiles remain recoverable', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jpcomedy-fast-test-'));
  const source = JSON.parse(await readFile(new URL('../content/public-data.json', import.meta.url), 'utf8')).data;
  await prepareFastData(dir, source);
  const raw = await readFile(path.join(dir, 'catalog.json'), 'utf8');
  const catalog = JSON.parse(raw);
  assert.equal(catalog.groups.length, 265);
  assert.ok(Buffer.byteLength(raw) < Buffer.byteLength(JSON.stringify(source)) * 0.3);
  for (const group of catalog.groups) {
    const original = source.groups.find(g => g.id === group.id);
    assert.deepEqual(group.works, original.works.map(({ title, detail }) => ({ title, detail })));
    assert.equal(group.researchedArticle, undefined);
    const complete = JSON.parse(await readFile(path.join(dir, group.detailUrl), 'utf8'));
    assert.deepEqual(complete, original);
  }
});

test('profile filename changes when content changes, but not when it is unchanged', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jpcomedy-cache-test-'));
  const source = JSON.parse(await readFile(new URL('../content/public-data.json', import.meta.url), 'utf8')).data;
  source.groups = source.groups.slice(0, 1);
  await prepareFastData(dir, source);
  const before = JSON.parse(await readFile(path.join(dir, 'catalog.json'), 'utf8')).groups[0].detailUrl;
  await prepareFastData(dir, source);
  assert.equal(JSON.parse(await readFile(path.join(dir, 'catalog.json'), 'utf8')).groups[0].detailUrl, before);
  source.groups[0].headline += '更新';
  await prepareFastData(dir, source);
  assert.notEqual(JSON.parse(await readFile(path.join(dir, 'catalog.json'), 'utf8')).groups[0].detailUrl, before);
});
