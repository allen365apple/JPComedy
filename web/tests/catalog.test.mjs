import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { filterGroups, matchesQuery, relatedGroups, escapeHtml } from '../public/catalog.mjs';
import { resolveWorkspace } from '../scripts/workspace.mjs';
const ws = resolveWorkspace(import.meta.url);
const data = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
const archive = JSON.parse(await readFile(path.join(ws, 'manzaiweek-archive/posts_all.json'), 'utf8'));
const shared = JSON.parse(await readFile(path.join(ws, 'jpcomedy-glossary/glossary.json'), 'utf8'));
const groups = data.groups;

test('all 27 pending introductions contain the audited additions', async () => {
  const edits = JSON.parse(await readFile(new URL('../content/detail-enrichment-2026-10-02.json', import.meta.url), 'utf8'));
  assert.equal(edits.profiles.length, 27);
  assert.equal(new Set(edits.profiles.map(p => p.id)).size, 27);
  for (const edit of edits.profiles) {
    const group = groups.find(g => g.id === edit.id);
    assert.ok(group && !group.article, edit.id);
    assert.ok(group.researchedArticle.text.includes(edit.append), edit.id);
    assert.equal(group.researchedArticle.enrichedAt, '2026-10-02');
    assert.ok(edit.sources.every(s => group.researchedArticle.sources.some(v => v.url === s.url)));
  }
});

test('resources distinguish competitions from television programmes', () => {
  for (const [id, category] of [['m1', '比賽'], ['r1', '比賽'], ['ippon', '節目'], ['yofukashi', '節目']]) {
    const resource = data.resources.find(r => r.id === id);
    assert.equal(resource.category, category);
    assert.ok(resource.description.length > 50);
    assert.ok(resource.searchTerms.length > 0);
    assert.ok(resource.sources.every(s => s.url.startsWith('https://')));
    assert.ok(resource.related.every(id => groups.some(g => g.id === id)));
  }
});

test('directory includes the initial finalists, completed batches and the final source-coverage batch', () => {
  const firstBatch = ['reiwa-roman', 'batterys', 'jock-rock', 'daitaku', 'mayurika', 'tom-brown', 'long-coat-daddy', 'sayaka', 'new-york', 'oswald'];
  const secondBatch = ['tatoeba-honoo', 'ginger-cat', 'ichigo', 'lalande', 'tokyo-hoteison', 'member', 'kuroobi', 'konya-mo-hoshi-ga-kirei', 'nayuta', 'tensai-pianist'];
  const thirdBatch = ['rainbow', 'nekonisu', 'laparfait', 'dennis', 'shishigashira', 'hitsujineiri', 'suehirogarizu', 'kazoku-chahan', 'kingyo-bancho', 'nineteen'];
  const fourthArchiveBatch = ['synchronicity', 'stamina-pan', 'karatachi', 'nightingale-dance'];
  const fourthPptBatch = ['nakagawa-family', 'masuda-okada', 'football-hour', 'black-mayonnaise', 'tutorial', 'sandwichman'];
  const fifthPptBatch = ['tokyo-dynamite', 'nankai-candies', 'harisenbon', 'poison-girl-band', '2cho-kenju', 'speed-wagon', 'america-zarigani', 'ogiyahagi', 'dainoji', 'tetsu-and-tomo'];
  const sixthPptBatch = ['3ji-no-heroine', 'alco-and-peace', 'ungirls', 'unjash', 'elf', 'kakaroni', 'kamaitachi', 'kaminari', 'kishitakano', 'kyaeen', 'kingkong', 'cream-stew', 'the-mommy', 'savanna', 'summers', 'saraba-seishun-no-hikari', 'sissonne', 'jarujaru', 'jungle-pocket', 'cellulite-spa'];
  const seventhBatch = ['130r', '9ban-gai-retro', 'cacao', 'city', 'exit', 'tc-klaxon', 'einstein', 'impulse', 'impossible', 'oideyasukoga', 'okazu-club', 'oda-ueda', 'omiokuri-geinin-shinichi', 'carnation', 'kagaya', 'gakutensoku', 'kakeochi', 'kamomental', 'kitsune', 'gyobu'];
  const eighthBatch = ['kuwabata-ohara', 'kevins', 'kendo-kobayashi', 'kotei', 'cocorico', 'kotake-seigikan', 'cotton', 'the-tacchi', 'the-punch', 'zabungle', 'sarugorilla', 'sandal', 'gerardon', 'zigzag-ziggy', 'shizuru', 'shimoryu', 'shampoo-hat', 'school-zone', 'slim-club', 'zun'];
  const ninthBatch = ['soitsu-doitsu', 'diane', 'time-machine-3', 'dow90000', 'downtown', 'taka-and-toshi', 'dachou-club', 'double-higashi', 'tamons', 'chance-ooshiro', 'chocolate-planet', 'two-tribe', 'tonikaku-yasumura', 'tommies', 'drunk-dragon', 'tontsukatan', 'dozakura', 'ninety-nine', 'nakayama-kinnikun', 'nanamagari'];
  const tenthBatch = ['nicche', 'neptune', 'nelsons', 'party-chan', 'parpar', 'high-heel', 'hanako', 'bananaman', 'haraichi', 'hollywood-zakoshisho', 'haruna-ai', 'paroparo', 'panther', 'pumpkin-potato-fry', 'peace', 'hikorohee', 'biscuit-brothers', 'pyuto', 'hyouroku', 'fall-in-love'];
  const eleventhBatch = ['fukura-p', 'pekopa', 'henderson', 'borujuku', 'matsumoto-club', 'marseille', 'mikabo', 'minamikawa', 'maple-chogokin', 'mou-chugakusei', 'mogurider', 'momo', 'monster-engine', 'yasuko', 'young', 'yadan', 'yuchami', 'yoiko', 'rice', 'license'];
  const finalBatch = ['rubber-girl', 'ranjyatai', 'linear', 'linda-color-infinity', 'lucifer-yoshioka', 'rozan', 'lotch', 'robert', 'watari-119', 'yasuda-dai-circus', 'igo-shogi', 'ameagari-kesshitai', 'yasukiyo', 'kaerutei', 'marugame-jango', 'onigoe-tomahawk', 'kin-no-kuni', 'kuuki-kaidan', 'gekidan-hitori', 'tsukitei-hosei', 'mitorizu', 'ganso-ichigo-chan', 'benishoga', 'imai-raipachi', 'konno-buruma', 'sanshiro', 'mikazuki-manhattan', 'sanyuukan', 'jicho-kacho', 'haru-to-hikoki', 'morisanchu', 'chihara-bros', 'asakusa-kid', 'suteki-janai-ka', 'aiseki-start', 'tenjikunezumi', 'hakata-hanamaru-daikichi', 'hakuto-peach-yopipi', 'bakusho-mondai', 'shinagawa-shoji', 'heisei-nobushi-kobushi', 'akashiya-sanma', 'yasei-bakudan', 'wagyu'];
  assert.equal(finalBatch.length, 44);
  assert.equal(groups.length, 265);
  assert.equal(new Set(groups.map(g => g.id)).size, 265);
  assert.equal(groups.filter(g => g.type === 'duo').length, 223);
  assert.equal(groups.filter(g => g.type === 'trio').length, 15);
  assert.equal(groups.filter(g => g.type === 'ensemble').length, 2);
  assert.equal(groups.filter(g => g.type === 'solo').length, 25);
  assert.deepEqual(groups.slice(0, 10).map(g => g.achievements[0].competition.finalRank), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(filterGroups(groups)[0].id, 'takuro');
  assert.equal(filterGroups(groups, { type: 'duo' }).length, 223);
  assert.equal(filterGroups(groups, { type: 'trio' }).map(g => g.id).join(','), 'ginger-cat,3ji-no-heroine,cacao,dachou-club,tontsukatan,neptune,nelsons,party-chan,hanako,panther,yadan,linda-color-infinity,robert,yasuda-dai-circus,morisanchu');
  assert.ok(firstBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g.article && g.achievements.length && g.works.length && g.sources.length >= 2 && g.bilibiliSearchTerms.length >= 2 && g.videoResource;
  }));
  assert.ok(secondBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g.article && g.achievements.length && g.works.length && g.sources.length >= 2 && g.bilibiliSearchTerms.length >= 2 && g.videoResource;
  }));
  assert.ok(thirdBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g.article && g.achievements.length && g.works.length && g.sources.length >= 1 && g.bilibiliSearchTerms.length >= 2 && g.videoResource;
  }));
  assert.ok(fourthArchiveBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g.article && g.achievements.length && g.works.length && g.sources.length >= 1 && g.bilibiliSearchTerms.length >= 2 && g.videoResource;
  }));
  assert.ok(fourthPptBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return !g.article && g.achievements.length && g.works.length && g.sources.length >= 1 && g.bilibiliSearchTerms.length >= 2 && g.videoResource;
  }));
  assert.ok(fifthPptBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g && g.type === 'duo' && g.achievements.length && g.works.length && g.sources.length >= 2 && g.bilibiliSearchTerms.length >= 2 && g.photo.url;
  }));
  assert.ok(sixthPptBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g && !g.article && g.achievements.length && g.works.length && g.sources.length >= 2 && g.bilibiliSearchTerms.length >= 2 && g.photo.url;
  }));
  assert.ok(seventhBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g && !g.article && g.researchedArticle?.positioning && g.achievements.length && g.works.length && g.sources.length >= 2 && g.bilibiliSearchTerms.length >= 2 && g.photo.url;
  }));
  assert.ok(eighthBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g && !g.article && g.researchedArticle?.positioning && g.researchedArticle.positioningSources.length >= 2
      && g.achievements.length && g.works.length && g.sources.length >= 2
      && g.bilibiliSearchTerms.length >= 2 && g.photo.url
      && g.members.every(m => m.role.includes('照片左側') || m.role.includes('照片右側') || g.type === 'solo');
  }));
  assert.ok(eighthBatch.filter(id => groups.find(g => g.id === id).type !== 'solo').every(id => {
    const g = groups.find(group => group.id === id);
    return g.members.length === 2;
  }));
  assert.ok(ninthBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g && !g.article && g.researchedArticle?.positioning && g.researchedArticle.positioningSources.length >= 2
      && g.achievements.length && g.works.length && g.sources.length >= 2
      && g.bilibiliSearchTerms.length >= 2 && g.photo.url && g.cover;
  }));
  assert.ok(ninthBatch.filter(id => groups.find(g => g.id === id).type !== 'solo').every(id => {
    const g = groups.find(group => group.id === id);
    return g.members.length === (g.type === 'ensemble' ? 8 : g.type === 'trio' ? 3 : 2)
      && g.members.every(m => m.photoPosition && m.positionSource?.startsWith('https://'));
  }));
  assert.ok(tenthBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g && !g.article && g.researchedArticle?.positioning && g.researchedArticle.positioningSources.length >= 2
      && g.achievements.length && g.works.length && g.sources.length >= 2
      && g.bilibiliSearchTerms.length >= 2 && g.photo.url && g.cover
      && g.sources.every(source => source.url.startsWith('https://'));
  }));
  assert.ok(tenthBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g.members.length === (g.type === 'solo' ? 1 : g.type === 'trio' ? 3 : 2)
      && (g.type === 'solo' || g.members.every(m => m.photoPosition && m.positionSource?.startsWith('https://')));
  }));
  assert.ok(eleventhBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g && !g.article && g.researchedArticle?.positioning && g.researchedArticle.positioningSources.length >= 2
      && g.achievements.length && g.works.length && g.sources.length >= 2
      && g.bilibiliSearchTerms.length >= 2 && g.photo.url?.startsWith('https://') && g.cover
      && g.sources.every(source => source.url.startsWith('https://'));
  }));
  assert.ok(eleventhBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g.members.length === (g.type === 'solo' ? 1 : g.type === 'trio' ? 3 : g.type === 'ensemble' ? 4 : 2)
      && (g.type === 'solo' || g.type === 'ensemble' || g.members.every(m => m.photoPosition && m.positionSource?.startsWith('https://')));
  }));
  assert.ok(finalBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g && !g.article && g.researchedArticle?.positioning
      && g.researchedArticle.positioningSources.length >= 2
      && g.achievements.length && g.works.length && g.sources.length >= 2
      && g.bilibiliSearchTerms.length >= 2 && g.photo.url?.startsWith('https://') && g.cover
      && g.sources.every(source => source.url.startsWith('https://'));
  }));
  assert.ok(finalBatch.every(id => {
    const g = groups.find(group => group.id === id);
    return g.members.length === (g.type === 'solo' ? 1 : g.type === 'trio' ? 3 : 2)
      && (g.type === 'solo' || g.members.every(m => m.photoPosition && m.positionSource?.startsWith('https://')));
  }));
  assert.equal(groups.find(g => g.id === 'yasuko').achievements[0].year, 2023);
  assert.equal(groups.find(g => g.id === 'borujuku').members.length, 4);
  assert.equal(groups.find(g => g.id === 'yadan').members.map(m => m.photoPosition).join(','), 'left,center,right');
  assert.equal(groups.find(g => g.id === 'dow90000').members.find(m => m.jp === '蓮見翔').photoPosition, 'bottom-center');
  assert.equal(groups.find(g => g.id === 'tontsukatan').status, 'disbanded');
  assert.equal(groups.find(g => g.id === 'dachou-club').status, 'legacy-trio');
  assert.ok(groups.every(g => !g.videoUrl || g.videoResource?.kind));
  assert.deepEqual(filterGroups(groups, { type: 'solo' }).map(g => g.jp), ['バカリズム', 'お見送り芸人しんいち', 'ケンドーコバヤシ', 'こたけ正義感', 'チャンス大城', 'とにかく明るい安村', 'なかやまきんに君', 'ハリウッドザコシショウ', 'はるな愛', 'ヒコロヒー', 'ひょうろく', 'ふくらP', 'マツモトクラブ', 'みなみかわ', 'もう中学生', 'やす子', 'ゆうちゃみ', 'ルシファー吉岡', 'ワタリ119', '劇団ひとり', '月亭方正', '今井らいぱち', '紺野ぶるま', '思わず触れたくなるよぴぴ', '明石家さんま']);
  const solo = groups.find(g => g.type === 'solo');
  assert.equal(solo.rank, undefined);
  assert.equal(solo.article, null);
  assert.ok(solo.achievements.every(a => !a.competition));
  assert.ok(solo.works.length >= 3);
  assert.equal(data.meta.siteName, '日式搞笑大補帖');
  assert.equal(groups.find(g => g.id === 'chonmage-ramen').jp, 'ちょんまげラーメン');
  assert.ok(groups.find(g => g.id === 'chonmage-ramen').article.title.includes('インディアンス'));
});

test('homepage appends more artist cards continuously instead of paginating', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const CATALOG_BATCH_SIZE = 24/);
  assert.match(app, /id="load-more"[^>]*>顯示更多<\/button>/);
  assert.match(app, /grid\.insertAdjacentHTML\('beforeend', markup\)/);
  assert.match(app, /#load-more'\)\.addEventListener\('click', \(\) => updateCatalog\(false\)\)/);
  assert.doesNotMatch(app, /下一頁|上一頁/);
});

test('search resolves article translations, canonical glossary names, stage names and full-width text', () => {
  for (const query of ['拓朗','拓郎','たくろう','Ｔａｋｕｒｏ']) assert.equal(filterGroups(groups, { query })[0].id, 'takuro');
  for (const query of ['要石','Kaname Stone','零士','東峰零士']) assert.equal(filterGroups(groups, { query })[0].id, 'kaname-stone');
  assert.equal(filterGroups(groups, { query: '佐佐木隆史' })[0].id, 'evers');
  for (const query of ['笨蛋節奏', 'バカリズム', '升野英知', '重啟人生', '架空OL日記']) assert.equal(filterGroups(groups, { query })[0].id, 'bakarhythm');
  assert.equal(filterGroups(groups, { query: '不存在的組合' }).length, 0);
  assert.equal(filterGroups(groups, { query: '白桃ピーチよぴぴ' })[0].id, 'hakuto-peach-yopipi');
  assert.equal(filterGroups(groups, { query: '思わず触れたくなるよぴぴ' })[0].id, 'hakuto-peach-yopipi');
});

test('style and artist type filters combine rather than replacing each other', () => {
  assert.deepEqual(filterGroups(groups, { tag:'奇怪邏輯', type:'solo' }).map(g=>g.id), ['bakarhythm']);
  assert.equal(filterGroups(groups, { tag:'超現實', type:'solo' }).length, 0);
  assert.equal(filterGroups(groups, { query:'拓郎', tag:'超現實' }).length, 0);
  const shortForm = filterGroups(groups, { style: '短劇式漫才' });
  assert.ok(shortForm.length > 0);
  assert.ok(shortForm.every(g => g.styleGroup === '短劇式漫才'));
});

test('all group and member translations are exact glossary values; verified aliases are explicit', () => {
  for (const g of groups) {
    const record = shared.talents.find(t => t.group ? t.group.jp.includes(g.jp) : t.members.some(m => m.jp.includes(g.jp)));
    assert.equal(g.zh, (record.group || record.members[0]).zh);
    for (const m of g.members) assert.equal(m.zh, record.members.find(x=>x.jp.includes(m.glossaryJp || m.jp)).zh);
  }
  const reiji = groups.find(g=>g.id==='kaname-stone').members.find(m=>m.jp==='零士');
  assert.equal(reiji.match, 'verified-stage-name');
  assert.ok(reiji.aliasSource.startsWith('https://www.maseki.co.jp/'));
});

test('all original articles remain byte-for-byte intact and every copied image exists', async () => {
  for (const g of groups) {
    await access(new URL('../public/' + g.cover, import.meta.url));
    if (!g.article) continue;
    const post = archive.find(p => p.post_id === g.article.id);
    assert.equal(g.article.text, post.text);
    assert.equal(g.article.publishedAt, post.time);
    for (const img of g.article.images) await access(new URL('../public/' + img.src, import.meta.url));
  }
});

test('every non-Weekly-Manzai detailed profile opens with a source-backed industry position', () => {
  const detailed = groups.filter(g => !g.article);
  assert.equal(detailed.length, 201);
  for (const g of detailed) {
    assert.ok(g.researchedArticle?.positioning, `${g.id} is missing its industry position`);
    assert.ok(g.researchedArticle.positioningSources.length >= 2, `${g.id} needs positioning sources`);
    assert.ok(g.researchedArticle.positioningSources.every(s => s.url.startsWith('https://')));
  }
  assert.ok(groups.filter(g => g.article).every(g => !g.researchedArticle?.positioning));
});

test('industry position is rendered inline as the opening of the detailed introduction', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /\[source\.positioning, source\.text\]\.filter\(Boolean\)\.join\('\\n\\n'\)/);
  assert.match(app, /<p class="original-text">\$\{esc\(text\)\}<\/p>/);
  assert.doesNotMatch(app, /positioning-note|<h4>在日本搞笑界的位置<\/h4>/);
});

test('related recommendations exclude self and require an overlapping style', () => {
  for (const group of groups) for (const related of relatedGroups(groups, group)) {
    assert.notEqual(related.id, group.id);
    assert.ok(related.tags.some(t => group.tags.includes(t)));
  }
});

test('source text is escaped and editorial links contain no unsupported URL schemes', () => {
  assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
  for (const g of groups) {
    assert.ok(g.sources.every(s => s.url.startsWith('https://')));
    assert.equal(g.photo.permission, 'local-preview-only');
    if (g.article) assert.equal(g.article.permission, 'local-preview-only');
    assert.ok(matchesQuery(g, g.jp));
  }
});

test('duo members retain source-backed cover order for left/right labels', () => {
  for (const g of groups.filter(g => g.type === 'duo')) {
    assert.deepEqual(g.members.map(m => m.photoPosition), ['left', 'right']);
    assert.ok(g.members.every(m => m.positionSource.startsWith('https://')));
    assert.equal(new Set(g.members.map(m => m.jp)).size, 2);
  }
  const don = groups.find(g => g.id === 'don-decollete');
  assert.equal(don.members[0].jp, '小橋共作');
  assert.equal(don.members[0].role, '吐槽');
  assert.equal(groups.find(g => g.id === 'mama-tart').members[0].jp, '檜原洋平');
  assert.deepEqual(groups.find(g => g.id === 'ameagari-kesshitai').members.map(m => m.jp), ['宮迫博之', '蛍原徹']);
  assert.deepEqual(groups.find(g => g.id === 'haru-to-hikoki').members.map(m => m.jp), ['土岡哲朗', 'ぐんぴぃ']);
  assert.deepEqual(groups.find(g => g.id === 'asakusa-kid').members.map(m => m.jp), ['玉袋筋太郎', '水道橋博士']);
  assert.deepEqual(groups.find(g => g.id === 'chihara-bros').members.map(m => m.jp), ['千原ジュニア', '千原せいじ']);
});

test('name sort is deterministic and removed teaching sections do not leak into generated data', () => {
  const expected = [...groups].sort((a,b) => a.jp.localeCompare(b.jp, 'ja'));
  assert.deepEqual(filterGroups(groups, { sort: 'name' }).map(g => g.id), expected.map(g => g.id));
  assert.ok(groups.every(g => !('watch' in g) && !('forYou' in g)));
});
