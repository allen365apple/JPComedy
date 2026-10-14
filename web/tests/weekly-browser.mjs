import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.JPCOMEDY_URL || 'http://127.0.0.1:4173/';
const batch = JSON.parse(await readFile(new URL('../content/weekly-update-2026-10-14.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  for (const [id, summary] of Object.entries(batch.weeklyUpdates)) {
    await page.goto(base + '#/groups/' + id);
    await page.locator('#weekly-update-title').waitFor();
    assert.equal(await page.locator('.weekly-update .original-text').innerText(), summary.text);
    assert.equal(await page.locator('.weekly-update .article-meta a').getAttribute('href'), summary.url);
    assert.match(await page.locator('.weekly-update .article-context').innerText(), /並非作者全文/);
    await page.locator('.profile-hero img').first().waitFor();
    assert.ok(await page.locator('.profile-hero img').first().evaluate(img => img.complete && img.naturalWidth > 0));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, id);
    }
    console.log(`Verified ${id}: summary, original link, photo and responsive layout`);
  }
  await page.goto(base + '#/groups/takuro');
  await page.locator('#weekly-title').waitFor();
  assert.equal(await page.locator('#weekly-update-title').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Eight updated pages verified; old full-text article preserved.');
} finally { await browser.close(); }
