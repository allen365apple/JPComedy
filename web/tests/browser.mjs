import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.JPCOMEDY_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
const failed = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) failed.push(response.url()); });
const data = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
const profileCount = data.groups.length;
const videoCount = data.groups.filter(g => g.videoUrl).length;
const qa = new URL('../qa/', import.meta.url);
await mkdir(qa, { recursive: true });

/** Navigate and verify page content rather than relying on arbitrary sleeps. */
async function visit(hash, selector) {
  await page.goto(base + hash);
  await page.locator(selector).first().waitFor();
}

/** Decode visible images so screenshots include images loaded below the initial viewport. */
async function readyImages() {
  await page.evaluate(async () => {
    const images = [...document.images].filter(img => img.getClientRects().length);
    for (const img of images) img.loading = 'eager';
    await Promise.all(images.map(img => img.decode()));
  });
}

try {
  await visit('', '.group-card');
  assert.equal(await page.locator('.group-card').count(), profileCount);
  assert.ok((await page.title()).includes('日式搞笑大補帖'));
  assert.ok(!(await page.locator('main').textContent()).includes('2025'));
  await page.locator('[data-type="solo"]').click();
  assert.equal(await page.locator('.group-card').count(), 1);
  await page.locator('[data-tag="奇怪邏輯"]').click();
  assert.equal(await page.locator('.group-card').count(), 1);
  await page.locator('#group-search').fill('拓朗');
  assert.equal(await page.locator('.group-card').count(), 0);
  await page.locator('#reset-filters').click();
  assert.equal(await page.locator('.group-card').count(), profileCount);
  await page.locator('#group-search').fill('拓朗');
  assert.equal(await page.locator('.group-card').count(), 1);
  await page.reload();
  await page.locator('.group-card').waitFor();
  assert.equal(await page.locator('#group-search').inputValue(), '拓朗');
  await page.locator('#group-search').fill('');
  await page.locator('#group-sort').selectOption('name');
  const firstByName = [...data.groups].sort((a,b) => a.jp.localeCompare(b.jp, 'ja'))[0];
  assert.ok((await page.locator('.card-link').first().getAttribute('href')).endsWith(firstByName.id));
  await page.locator('#group-search').fill('重啟人生');
  assert.equal(await page.locator('.group-card').count(), 1);
  assert.ok((await page.locator('.card-link').getAttribute('href')).endsWith('bakarhythm'));

  for (const g of data.groups) {
    await visit('#/groups/' + g.id, '.profile-hero');
    assert.equal(await page.locator('.profile-title h1').textContent(), g.zh);
    assert.equal(await page.locator('.profile-jp').textContent(), g.jp);
    assert.equal(await page.locator('.article-details summary').count(), 0);
    if (g.article) {
      assert.ok(await page.locator('.original-text').isVisible());
      assert.equal(await page.locator('.original-text').textContent(), g.article.text);
    } else {
      assert.equal(await page.locator('.weekly-section').count(), 0);
      assert.ok(!(await page.locator('.profile-main').textContent()).includes('M-1'));
      assert.equal(await page.locator('.career-list article').count(), 4);
    }
    await readyImages();
    assert.equal(await page.locator('.member-card').count(), g.members.length);
    assert.equal(await page.locator('.photo-members').count(), 0);
    assert.equal(await page.locator('.member-portrait').count(), 0);
    for (let i = 0; i < g.members.length; i++) {
      assert.equal(await page.locator('.member-card h3').nth(i).textContent(), g.members[i].zh);
      if (g.members[i].photoPosition === 'left') assert.match(await page.locator('.member-card .role').nth(i).textContent(), /畫面左邊/);
      if (g.members[i].photoPosition === 'right') assert.match(await page.locator('.member-card .role').nth(i).textContent(), /畫面右邊/);
    }
    assert.ok(!(await page.locator('main').textContent()).includes('他們的漫才，怎麼看'));
    await page.goto(base + '#/glossary?group=' + g.id);
    await page.locator('#glossary-focus a[href="#/groups/' + g.id + '"]').waitFor();
    assert.equal(await page.locator('#glossary-list .glossary-row').count(), 1);
    await page.locator('#glossary-focus a[href="#/groups/' + g.id + '"]').click();
    await page.locator('.profile-hero').waitFor();
    assert.ok(page.url().endsWith('/groups/' + g.id));
  }

  // Integrated 漫才詞庫: full glossary (incl. artists without a profile page),
  // in-tab editing, and drafts that survive navigation.
  await visit('#/glossary', '.glossary-row');
  const glossaryAll = Number(await page.locator('#gcount-all').textContent());
  assert.ok(glossaryAll > profileCount + 100, `glossary must include unbuilt artists (${glossaryAll})`);
  await page.locator('#glossary-search').fill('零士');
  await page.waitForFunction(() => document.querySelectorAll('#glossary-list .glossary-row').length >= 1);
  assert.ok((await page.locator('#glossary-list').textContent()).includes('東峰零士'));
  await page.locator('#glossary-search').fill('');
  // Unlock (fixture mode needs no password) reveals editing controls.
  assert.equal(await page.locator('#glossary-add-term:not([hidden])').count(), 0);
  await page.locator('#glossary-unlock-btn').click();
  await page.locator('#glossary-add-term:not([hidden])').waitFor();
  await page.locator('#glossary-add-term').click();
  await page.locator('#glossary-modal [data-alias-path]').first().fill('自動測試用語');
  await page.locator('#glossary-modal [data-field-path$=".zh"]').first().fill('自動測試');
  await page.locator('#glossary-apply').click();
  assert.ok((await page.locator('#glossary-list').textContent()).includes('自動測試用語'));
  assert.ok((await page.locator('#glossary-savestate').textContent()).includes('尚未儲存'));
  // Leave to an artist page and back: the unsaved draft must remain (in-tab nav).
  await page.evaluate(() => { location.hash = '#/groups/takuro'; });
  await page.locator('.profile-hero').waitFor();
  await page.evaluate(() => { location.hash = '#/glossary'; });
  await page.locator('.glossary-row').first().waitFor();
  assert.ok((await page.locator('#glossary-list').textContent()).includes('自動測試用語'), 'draft kept across in-tab navigation');
  assert.ok((await page.locator('#glossary-savestate').textContent()).includes('尚未儲存'), 'dirty state kept across navigation');
  await visit('#/resources', '.resource-card');
  await page.locator('[data-resource-filter="劇場"]').click();
  assert.equal(await page.locator('.resource-card:visible').count(), 1);
  await page.locator('[data-resource-filter="全部"]').click();
  assert.equal(await page.locator('.resource-card:visible').count(), 6);
  await visit('#/channels', '.channel-card');
  assert.equal(await page.locator('.channel-card').count(), videoCount);

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, selector] of [['', '.group-card'], ['#/groups/gokai-captain','.profile-hero'], ['#/groups/reiwa-roman','.profile-hero'], ['#/groups/bakarhythm','.profile-hero'], ['#/glossary','.glossary-row'], ['#/resources','.resource-card'], ['#/channels','.channel-card']]) {
      await visit(route, selector);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `Horizontal overflow: ${width}, ${route}`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await visit('', '.group-card'); await readyImages();
  await page.screenshot({ path: fileURLToPath(new URL('home-desktop.png', qa)), fullPage: true });
  await page.screenshot({ path: fileURLToPath(new URL('home-first-screen.png', qa)) });
  await visit('#/groups/takuro', '.profile-hero'); await readyImages();
  await page.screenshot({ path: fileURLToPath(new URL('profile-desktop.png', qa)), fullPage: true });
  await visit('#/groups/reiwa-roman', '.profile-hero'); await readyImages();
  await page.screenshot({ path: fileURLToPath(new URL('reiwa-roman-desktop.png', qa)), fullPage: true });
  await visit('#/groups/bakarhythm', '.profile-hero'); await readyImages();
  await page.screenshot({ path: fileURLToPath(new URL('bakarhythm-desktop.png', qa)), fullPage: true });
  await visit('#/resources', '.resource-card');
  await page.screenshot({ path: fileURLToPath(new URL('resources-desktop.png', qa)), fullPage: true });
  await visit('#/glossary', '.glossary-row');
  await page.screenshot({ path: fileURLToPath(new URL('glossary-desktop.png', qa)), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await visit('', '.group-card'); await readyImages();
  await page.screenshot({ path: fileURLToPath(new URL('home-mobile.png', qa)) });
  await visit('#/groups/kaname-stone', '.profile-hero');
  await readyImages();
  await page.screenshot({ path: fileURLToPath(new URL('profile-mobile.png', qa)), fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  const report = { checkedAt: new Date().toISOString(), browser: 'Chrome headless', profiles: profileCount, viewports: [320,390,768,1440], articleTextExact: true, articlesVisibleWithoutClick: true, glossaryRoundTrips: profileCount, glossaryFullCount: glossaryAll, glossaryEditDraftKept: true, styleAndTypeFiltering: true, worksSearch: true, soloProfile: true, memberPortraits: true, searchReload: true, glossaryAliasSearch: true, resourceFiltering: true, imageDecode: true, pageErrors: errors, failedLocalResponses: failed };
  await writeFile(new URL('browser-report.json', qa), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
