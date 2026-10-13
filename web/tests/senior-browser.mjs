import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.JPCOMEDY_URL || 'http://127.0.0.1:4173/';
const batch = JSON.parse(await readFile(new URL('../content/senior-enrichment-2026-10-14.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir(new URL('../qa/', import.meta.url), { recursive: true });

try {
  for (const entry of batch.profiles) {
    await page.goto(base + '#/groups/' + entry.id);
    await page.locator('#researched-title').waitFor();
    assert.equal(await page.locator('#researched-title').innerText(), '詳細介紹');
    assert.equal(await page.locator('.researched-section .original-text').innerText(),
      entry.researchedArticle.positioning + '\n\n' + entry.researchedArticle.text);
    assert.equal(await page.locator('#weekly-title').count(), 0);
    const sources = await page.locator('.researched-section .article-meta a').count();
    assert.ok(sources >= 3);
    if (entry.id === 'downtown') {
      await page.locator('.researched-section').scrollIntoViewIfNeeded();
      await page.screenshot({ path: new URL('../qa/senior-downtown-desktop.png', import.meta.url).pathname });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `${entry.id}: mobile horizontal overflow`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log(`Verified ${entry.id}: full article, sources, mobile layout`);
  }
  await page.goto(base + '#/groups/takuro');
  await page.locator('#weekly-title').waitFor();
  assert.equal(await page.locator('#researched-title').count(), 0);
  assert.deepEqual(errors, []);
  console.log('8 enriched profiles verified; Weekly Manzai rendering preserved; no page errors.');
} finally {
  await browser.close();
}
