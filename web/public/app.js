import { filterGroups, matchesQuery, relatedGroups, escapeHtml as esc } from './catalog.mjs';
let glossaryModule;
const profileRequests = new Map();
let routeVersion = 0;

/** Reuse successful profile requests, and let a failed request be retried. */
async function loadProfile(group) {
  if (!group.detailUrl) return group;
  if (!profileRequests.has(group.id)) {
    profileRequests.set(group.id, fetch(`./${group.detailUrl}`).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).catch(error => { profileRequests.delete(group.id); throw error; }));
  }
  return profileRequests.get(group.id);
}

const main = document.querySelector('#main');
const arrow = '<span aria-hidden="true">↗</span>';
const searchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
let data;
let catalogState = { query: '', style: 'all', tag: 'all', type: 'all', sort: 'featured' };
const CATALOG_BATCH_SIZE = 24;
let visibleGroupCount = 0;
let glossaryQuery = '';

/** Render a safe outbound link and signal that it opens a new tab. */
function external(url, label, className = '') {
  if (!/^https:\/\//.test(url)) return '';
  return `<a class="${className}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}（開啟新分頁）">${esc(label)} ${arrow}</a>`;
}

function badge(g) {
  if (g.status === 'disbanded') return g.type === 'trio' ? '已解散三人組' : '已解散組合';
  if (g.status === 'legacy-trio') return '經典三人組';
  if (g.type === 'solo') return '單人藝人';
  if (g.type === 'trio') return '三人組合';
  if (g.type === 'ensemble') return '喜劇團體';
  return '雙人組合';
}

function tagList(g) {
  return `<div class="tags">${g.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>`;
}

function groupCard(g, compact = false) {
  return `<article class="group-card${compact ? ' compact' : ''}">
    <a class="card-link" href="#/groups/${g.id}" aria-label="認識 ${esc(g.zh)} ${esc(g.jp)}">
      <div class="card-image${g.photo.imageUrl ? ' official-photo' : ''}"><img src="./${g.coverSmall || g.cover}" srcset="./${g.coverSmall || g.cover} 480w, ./${g.cover} 960w" sizes="(max-width: 600px) 90vw, (max-width: 1000px) 45vw, 30vw" decoding="async" alt="${esc(g.zh)}的藝人照片" loading="lazy" width="600" height="400"><span class="rank-badge">${badge(g)}</span><span class="card-go" aria-hidden="true">↗</span></div>
      <div class="card-copy"><p class="card-kicker">${esc(g.styleGroup || g.format)}</p><h3>${esc(g.zh)}</h3><p class="card-jp" lang="ja">${esc(g.jp)}</p><p class="card-headline">${esc(g.headline)}</p>${tagList(g)}</div>
    </a>
  </article>`;
}

function hero() {
  const [first, second] = data.groups;
  const third = data.groups.find(g => g.id === 'bakarhythm');
  return `<section class="hero wrap">
    <div class="hero-copy"><p class="eyebrow"><span class="red-dot"></span>笑いの入口 / YOUR NEXT FAVORITE</p>
      <h1>日本搞笑，<br>有<span class="red-serif">好多種模樣</span>。</h1>
      <p class="hero-description">從兩人的一來一往，到一個人的奇思妙想。<br>認識不同的藝人，找到喜歡的風格。</p>
      <a class="button primary" href="#/explore">認識搞笑藝人 <span aria-hidden="true">↓</span></a>
      <div class="hero-note"><span class="mini-rule"></span>漫才・短劇・單人表演・更多日本搞笑</div>
    </div>
    <div class="hero-art" aria-label="藝人精選：拓郎、DonDecollete、笨蛋節奏">
      <span class="orbit orbit-one" aria-hidden="true"></span><span class="orbit orbit-two" aria-hidden="true"></span>
      <a class="photo-note photo-back solo-note" href="#/groups/${third.id}"><img fetchpriority="high" decoding="async" src="./${third.cover}" alt="${esc(third.zh)}" width="600" height="400"><span><b>03 / ${esc(third.zh)}</b><small lang="ja">${esc(third.jp)}</small></span></a>
      <a class="photo-note photo-front" href="#/groups/${first.id}"><img fetchpriority="high" decoding="async" src="./${first.cover}" alt="${esc(first.zh)}" width="500" height="333"><span><b>01 / ${esc(first.zh)}</b><small lang="ja">${esc(first.jp)}</small></span></a>
      <a class="photo-note photo-side" href="#/groups/${second.id}"><img fetchpriority="high" decoding="async" src="./${second.cover}" alt="${esc(second.zh)}" width="500" height="333"><span><b>02 / ${esc(second.zh)}</b><small lang="ja">${esc(second.jp)}</small></span></a>
      <span class="round-stamp" aria-hidden="true">各有風格<br><b>お笑い</b></span><span class="art-caption">違う笑いに、出会おう。</span>
    </div>
  </section>`;
}

function catalog() {
  return `<section class="catalog wrap" id="explore" aria-labelledby="catalog-title">
    <div class="section-heading"><div><p class="eyebrow">MEET THE ARTISTS</p><h2 id="catalog-title">認識搞笑藝人<span class="red-period">。</span></h2></div><p>從熟悉的日常，到想不到的荒唐。<br>每個人都有自己的風格。</p></div>
    <div class="catalog-toolbar"><label class="search-field">${searchIcon}<input id="group-search" type="search" value="${esc(catalogState.query)}" placeholder="搜尋藝人、成員或作品名稱" aria-label="搜尋藝人、成員或作品"><kbd aria-hidden="true">⌕</kbd></label>
    <div class="segmented" aria-label="藝人類型">${[['all','全部'],['duo','雙人組合'],['trio','三人組合'],['ensemble','喜劇團體'],['solo','單人藝人']].map(([type,label]) => `<button data-type="${type}" aria-pressed="${catalogState.type === type}">${label}</button>`).join('')}</div></div>
    <div class="filter-row"><span class="filter-label">主要形式</span><div class="filter-chips">${['all', ...new Set(data.groups.map(g => g.styleGroup || g.format))].map(style => `<button class="chip" data-style="${style}" aria-pressed="${catalogState.style === style}">${style === 'all' ? '全部' : esc(style)}</button>`).join('')}</div></div>
    <details class="secondary-filter"><summary>更多風格標籤（用來篩選）</summary><div class="filter-row"><span class="filter-label">細部風格</span><div class="filter-chips">${['all', ...new Set(data.groups.flatMap(g => g.tags))].map(t => `<button class="chip" data-tag="${t}" aria-pressed="${catalogState.tag === t}">${t === 'all' ? '全部' : esc(t)}</button>`).join('')}</div></div></details>
    <div class="results-meta"><span id="result-count" role="status" aria-live="polite"></span><label>排序 <select id="group-sort" aria-label="藝人排序"><option value="featured">編輯排列</option><option value="name">日文名稱</option></select></label></div>
    <div id="group-grid" class="group-grid"></div>
    <div class="load-more-wrap"><button class="button outlined" id="load-more" type="button">顯示更多</button></div>
    <p class="editorial-note">主要形式參考日本資料與研究整理；細部風格標籤為本站編輯整理，並非官方固定分類。藝人資料持續擴充中。</p>
  </section>`;
}

function teaser() {
  return `<section class="resource-teaser wrap"><div class="teaser-mark" aria-hidden="true">もっと<br>お笑い。</div><div><p class="eyebrow">BEYOND THE STAGE</p><h2>還有更多日本搞笑。</h2><p>比賽、頻道、劇場與中文介紹。<br>值得收藏的資源，都放在這裡。</p></div><a class="button outlined" href="#/resources">探索搞笑資源 ${arrow}</a></section>`;
}

function updateCatalogUrl() {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(catalogState)) if (v && v !== 'all' && !(k === 'sort' && v === 'featured')) params.set(k, v);
  history.replaceState(null, '', `#/explore${params.size ? '?' + params : ''}`);
}

function updateCatalog(reset = true) {
  if (reset) visibleGroupCount = 0;
  const groups = filterGroups(data.groups, catalogState);
  const grid = document.querySelector('#group-grid');
  const nextGroups = groups.slice(visibleGroupCount, visibleGroupCount + CATALOG_BATCH_SIZE);
  const markup = groups.length ? nextGroups.map(g => groupCard(g)).join('') : `<div class="empty-state"><span aria-hidden="true">（´･ω･）</span><h3>還沒有符合條件的藝人。</h3><p>試試其他名稱或放寬篩選條件。</p><button class="button primary" id="reset-filters">清除搜尋與篩選</button></div>`;
  if (reset) grid.innerHTML = markup;
  else grid.insertAdjacentHTML('beforeend', markup);
  visibleGroupCount = Math.min(visibleGroupCount + nextGroups.length, groups.length);
  document.querySelector('#result-count').textContent = `顯示 ${visibleGroupCount} / ${groups.length} 位符合條件的藝人`;
  document.querySelector('#load-more').hidden = visibleGroupCount >= groups.length;
  document.querySelectorAll('[data-style]').forEach(b => b.setAttribute('aria-pressed', b.dataset.style === catalogState.style));
  document.querySelectorAll('[data-tag]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tag === catalogState.tag));
  document.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', b.dataset.type === catalogState.type));
  document.querySelector('#reset-filters')?.addEventListener('click', () => { catalogState = { query: '', style: 'all', tag: 'all', type: 'all', sort: 'featured' }; document.querySelector('#group-search').value = ''; document.querySelector('#group-sort').value = 'featured'; updateCatalog(); updateCatalogUrl(); });
}

function bindCatalog() {
  document.querySelector('#group-sort').value = catalogState.sort;
  document.querySelector('#group-search').addEventListener('input', e => { catalogState.query = e.target.value; updateCatalog(); updateCatalogUrl(); });
  document.querySelector('#group-sort').addEventListener('change', e => { catalogState.sort = e.target.value; updateCatalog(); updateCatalogUrl(); });
  document.querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => { catalogState.style = b.dataset.style; updateCatalog(); updateCatalogUrl(); }));
  document.querySelectorAll('[data-tag]').forEach(b => b.addEventListener('click', () => { catalogState.tag = b.dataset.tag; updateCatalog(); updateCatalogUrl(); }));
  document.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => { catalogState.type = b.dataset.type; updateCatalog(); updateCatalogUrl(); }));
  document.querySelector('#load-more').addEventListener('click', () => updateCatalog(false));
  updateCatalog();
}

function sourceArticle(g) {
  if (!g.article && g.researchedArticle) {
    const source = g.researchedArticle;
    const sources = [...(source.positioningSources || []), ...(source.sources || [])]
      .filter((item, index, all) => all.findIndex(candidate => candidate.url === item.url) === index);
    const text = [source.positioning, source.text].filter(Boolean).join('\n\n');
    return `<section class="weekly-section researched-section" aria-labelledby="researched-title"><div class="weekly-heading"><span class="weekly-seal" aria-hidden="true">人物<br>專題</span><div><p class="eyebrow">DETAILED PROFILE</p><h2 id="researched-title">詳細介紹</h2></div></div>
      <div class="article-details"><h3 class="article-title">${esc(source.title)}</h3><p class="original-text">${esc(text)}</p></div>
      <p class="article-meta">參考來源：${sources.map(item => external(item.url, item.label)).join(' · ')}</p>
      <p class="micro-note">以上為參考日文資料後整理的繁體中文介紹，非逐字翻譯；基本資料與經歷請以原始來源為準。</p></section>`;
  }
  if (!g.article) return '';
  const date = new Date(g.article.publishedAt).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });
  const permissionNote = g.article.permission === 'public-source-attributed'
    ? '文章與圖片保留原始出處；公開使用範圍依網站發布清單。'
    : '完整文章與圖片來自使用者提供的存檔，僅供本機示範；公開轉載授權尚待確認。';
  return `<section class="weekly-section" aria-labelledby="weekly-title"><div class="weekly-heading"><span class="weekly-seal" aria-hidden="true">每週<br>漫才</span><div><p class="eyebrow">ANOTHER PERSPECTIVE</p><h2 id="weekly-title">每週漫才是這樣寫的</h2></div></div><p class="article-meta">每週漫才 · 原始發文 ${date} · ${external(g.article.url, '閱讀原始貼文')}</p>
    <p class="article-context">以下保留作者原文與觀點。文中的「今年」「去年」及戰績請依原始發文時間理解，最新整理見上方資料。</p>
    <div class="article-details"><h3 class="article-title">${esc(g.article.title)}</h3><div class="original-text">${esc(g.article.text)}</div>
    <div class="article-gallery">${g.article.images.map((img, i) => `<figure><img loading="lazy" src="./${img.src}" alt="${esc(g.jp)}原始貼文附圖 ${i + 1}"><figcaption>${esc(img.credit)}</figcaption></figure>`).join('')}</div></div>
    <p class="micro-note">${permissionNote}</p></section>`;
}

/** Show source-backed awards, competition appearances and creative work in one general model. */
function careerSection(g) {
  const entries = [...g.achievements, ...g.works];
  if (!entries.length) return '';
  return `<section class="reading-section career-section"><p class="eyebrow">SELECTED HIGHLIGHTS</p><h2>代表經歷與作品</h2><div class="career-list">${entries.map(item => `<article><span class="career-kind">${esc(item.kind)}${item.year ? ' · ' + esc(item.year) : ''}</span><h3>${external(item.url, item.title)}</h3><p>${esc(item.detail)}</p></article>`).join('')}</div></section>`;
}

/** Keep viewing links together and treat Bilibili as a search aid, not a video source. */
function watchingResources(g) {
  const sameUrl = (first, second) => String(first || '').replace(/^https?:\/\/(www\.)?/, 'https://').replace(/\/$/, '') === String(second || '').replace(/^https?:\/\/(www\.)?/, 'https://').replace(/\/$/, '');
  const official = g.works.filter(item => item.kind === '官方頻道' || sameUrl(item.url, g.videoUrl) && g.videoResource?.kind === '官方 YouTube');
  const other = g.works.filter(item => !official.includes(item) && /youtube|bilibili|vimeo|stream|video/i.test(item.url || ''));
  const fallback = g.videoUrl && !official.some(item => sameUrl(item.url, g.videoUrl)) && g.videoResource ? [{ kind: g.videoResource.kind, title: g.videoResource.title, detail: g.videoResource.detail, url: g.videoUrl }] : [];
  const terms = [...new Set(g.bilibiliSearchTerms || [g.jp, `${g.jp} 漫才`, ...g.aliases])];
  const searchUrl = term => `https://search.bilibili.com/all?keyword=${encodeURIComponent(term)}`;
  const resource = (item, label = item.kind) => `<li><span class="resource-kind">${esc(label)}</span><div>${external(item.url, item.title, 'resource-link')}<small>${esc(item.detail || '')}</small></div></li>`;
  const officialEntries = official.map(item => sameUrl(item.url, g.videoUrl) && g.videoResource ? { ...item, title: g.videoResource.title, detail: g.videoResource.detail } : item);
  return `<section class="watching-resources reading-section" aria-labelledby="watching-title"><p class="eyebrow">WATCHING RESOURCES</p><h2 id="watching-title">觀看資源</h2><ul class="watching-list">${[...officialEntries.map(item => resource(item, '官方 YouTube')), ...fallback.map(item => resource(item, item.kind)), ...other.map(item => resource(item, '其他影片'))].join('')}<li><span class="resource-kind">Bilibili 搜尋</span><div><ul class="bilibili-list">${terms.map(term => `<li>${external(searchUrl(term), `搜尋「${term}」`, 'resource-link')}</li>`).join('')}</ul><small>名稱的中文譯法可能不同，建議優先用日文名稱搜尋，再搭配「漫才」或「お笑い」。搜尋結果多為使用者上傳，請自行確認上傳者、授權與可觀看地區。</small></div></li></ul></section>`;
}

/** Render member roles and their positions in the shared cover photograph. */
function memberCards(g) {
  return `<div class="members${g.type === 'solo' ? ' solo-members' : ''}">${g.members.map(m => {
    const positions = { left: '畫面左邊', center: '畫面中間', right: '畫面右邊', 'top-left': '畫面上排左側', 'top-mid-left': '畫面上排偏左', 'top-center': '畫面上排中間', 'top-mid-right': '畫面上排偏右', 'top-right': '畫面上排右側', 'bottom-left': '畫面下排左側', 'bottom-mid-left': '畫面下排偏左', 'bottom-center': '畫面下排中間', 'bottom-mid-right': '畫面下排偏右', 'bottom-right': '畫面下排右側' };
    const position = positions[m.photoPosition] ? `（${positions[m.photoPosition]}）` : '';
    return `<article class="member-card"><div class="member-copy"><span class="role">${esc(`${m.role}${position}`)}</span><h3>${esc(m.zh)}</h3><p lang="ja">${esc(m.jp)}</p>${m.realName ? `<p>本名：${esc(m.realName)}</p>` : ''}<small>${esc(m.reading)}<br>出身：${esc(m.origin)}</small>${m.match !== 'exact' ? '<p class="alias-note">官方藝名：零士<br>詞庫記名：東峰零士</p>' : ''}</div></article>`;
  }).join('')}</div>`;
}

function profilePage(g) {
  const related = relatedGroups(data.groups, g);
  const picture = g.memberPhotos?.length
    ? `<figure class="profile-picture profile-picture-gallery"><div class="profile-gallery">${g.memberPhotos.map(photo => `<figure><img src="./${esc(photo.src)}" alt="${esc(g.zh)}：${esc(photo.label)}"><figcaption>${esc(photo.label)}</figcaption></figure>`).join('')}</div><figcaption><p class="photo-credit">圖片出處：${external(g.photo.url, g.photo.credit)}</p></figcaption></figure>`
    : `<figure class="profile-picture${g.photo.imageUrl ? ' official-photo' : ''}"><img src="./${g.cover}" decoding="async" alt="${esc(g.zh)}的藝人照片"><figcaption><p class="photo-credit">圖片出處：${external(g.photo.url, g.photo.credit)}</p></figcaption></figure>`;
  return `<div class="wrap profile-page"><a class="back-link" href="#/explore">← 回到藝人列表</a>
    <section class="profile-hero">${picture}
      <div class="profile-title"><p class="eyebrow">${badge(g)} / ${esc(g.styleGroup || g.format)}</p><h1>${esc(g.zh)}</h1><p class="profile-jp" lang="ja">${esc(g.jp)}</p><p class="profile-reading">${esc(g.reading)}</p>${tagList(g)}<p class="profile-headline">${esc(g.headline)}</p></div></section>
    <div class="fact-strip artist-facts"><div><span>藝人類型</span><strong>${badge(g)}</strong></div><div><span>主要形式</span><strong>${esc(g.styleGroup || g.format)}</strong></div><div><span>所屬事務所</span><strong>${esc(g.agency)}</strong></div></div>
    <div class="profile-body"><div class="profile-main"><section class="reading-section"><p class="eyebrow">ABOUT THE ARTIST</p><h2>藝人介紹</h2><p>${esc(g.intro)}</p>${memberCards(g)}${g.formed ? `<p class="micro-note">${esc(g.formed.slice(0,4))} 年結成。成員分工可能隨段子變化。</p>` : ''}</section>${careerSection(g)}${sourceArticle(g)}${watchingResources(g)}</div>
    <aside class="profile-sidebar"><section class="source-card"><p class="eyebrow">SOURCES & NOTES</p><h3>資料來源</h3><ul class="source-list">${g.sources.map(s=>`<li>${external(s.url,s.label)}<small>${esc(s.covers)}</small></li>`).join('')}</ul><p class="micro-note">基本資料查核：${g.checkedAt}<br>介紹與風格標籤為本站依來源整理。</p></section></aside></div>
    ${related.length ? `<section class="related"><div class="section-heading"><div><p class="eyebrow">KEEP EXPLORING</p><h2>這種風格你可能也喜歡</h2></div><span class="micro-note">依共同風格標籤推薦</span></div><div class="group-grid">${related.map(g=>groupCard(g,true)).join('')}</div></section>` : ''}</div>`;
}

function resourceCard(r) {
  const link = r.url.startsWith('#') ? `<a class="text-link" href="${r.url}">打開資源 ${arrow}</a>` : external(r.url, '前往官方網站', 'text-link');
  const artists = (r.related || []).slice(0, 3).map(id => data.groups.find(g => g.id === id)).filter(Boolean);
  const context = r.searchTerms?.length ? `<p class="micro-note">日文搜尋：${r.searchTerms.map(esc).join('、')}</p>` : '';
  const related = artists.length ? `<p class="micro-note">相關藝人：${artists.map(g => `<a href="#/groups/${g.id}">${esc(g.zh)}</a>`).join('、')}</p>` : '';
  return `<article class="resource-card" data-category="${r.category}"><div class="resource-card-top"><span class="resource-mark">${esc(r.mark)}</span><span class="resource-category">${esc(r.category)}</span></div><h2>${esc(r.title)}</h2><h3>${esc(r.subtitle)}</h3><p>${esc(r.description)}</p>${context}${related}${link}</article>`;
}

function resourcesPage() {
  return `<div class="wrap subpage"><div class="page-intro"><p class="eyebrow">THE OWARAI FIELD GUIDE</p><h1>舞台之外，<br>還有一整個世界。</h1><p>認識重要賽事、電視節目與演出資源。<br>從舞台段子，到街訪、談話和大喜利。</p></div><div class="resource-filters filter-chips" aria-label="資源分類">${['全部','比賽','節目','劇場','影片','中文資源'].map((t,i)=>`<button class="chip" data-resource-filter="${t}" aria-pressed="${i === 0}">${t}</button>`).join('')}</div><p class="micro-note" id="resource-count" role="status" aria-live="polite">共 ${data.resources.length} 項資源</p><div class="resource-grid">${data.resources.map(resourceCard).join('')}</div><p class="editorial-note">外部連結會開啟新分頁。演出場次、票價與播放地區限制，請以各平台公告為準。</p></div>`;
}

// 漫才詞庫已改為可掛載的完整模組，見 glossary.mjs / glossary-core.mjs。

function channelsPage() {
  return `<div class="wrap subpage"><a class="back-link" href="#/resources">← 回到搞笑資源</a><div class="page-intro"><p class="eyebrow">PRESS PLAY</p><h1>舞台，不只一個。</h1><p>官方頻道、節目播放清單與其他影音入口。<br>各頻道內容與可觀看狀態，以原平台為準。</p></div><div class="channel-grid">${data.groups.filter(g => g.videoUrl).map(g=>`<article class="channel-card"><img src="./${g.coverSmall || g.cover}" decoding="async" alt="${esc(g.jp)}" loading="lazy"><div><h2>${esc(g.zh)}</h2><p lang="ja">${esc(g.jp)}</p>${external(g.videoUrl, g.videoResource?.title || '打開影音入口','text-link')}<a class="channel-profile" href="#/groups/${g.id}">查看藝人介紹 →</a></div></article>`).join('')}</div></div>`;
}

function bindResources() {
  document.querySelectorAll('[data-resource-filter]').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.resourceFilter;
    document.querySelectorAll('[data-resource-filter]').forEach(b=>b.setAttribute('aria-pressed', b === button));
    let count = 0;
    document.querySelectorAll('.resource-card').forEach(card=>{ card.hidden = category !== '全部' && card.dataset.category !== category; if (!card.hidden) count++; });
    document.querySelector('#resource-count').textContent = `共 ${count} 項資源`;
  }));
}

/** Render hash routes so each profile remains directly addressable on static hosting. */
async function route() {
  if (!data) return;
  const version = ++routeVersion;
  glossaryModule?.unmountGlossary(); // preserve drafts while detaching listeners
  const [pathname, query = ''] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  const page = pathname || '/';
  let nav = 'groups';
  let title = '認識搞笑藝人';
  if (page === '/' || page === '/explore') {
    catalogState = { query: params.get('query') || '', style: params.get('style') || 'all', tag: params.get('tag') || 'all', type: ['duo','trio','ensemble','solo'].includes(params.get('type')) ? params.get('type') : 'all', sort: params.get('sort') === 'name' ? 'name' : 'featured' };
    main.innerHTML = (page === '/' ? hero() : '') + catalog() + teaser(); bindCatalog();
  } else if (page.startsWith('/groups/')) {
    let g = data.groups.find(g => g.id === page.split('/')[2]);
    if (g?.detailUrl) {
      main.innerHTML = `<div class="loading">正在載入 ${esc(g.zh)} 的介紹…</div>`;
      try { g = await loadProfile(g); }
      catch (error) {
        if (version === routeVersion) main.innerHTML = '<div class="empty-state"><p>介紹暫時無法載入，請稍後重試。</p><button class="button primary" id="retry-profile">重試</button></div>';
        document.querySelector('#retry-profile')?.addEventListener('click', route);
        return;
      }
      if (version !== routeVersion) return;
    }
    main.innerHTML = g ? profilePage(g) : notFound(); title = g ? `${g.zh}・${g.jp}` : '找不到藝人';
  } else if (page === '/resources') {
    main.innerHTML = resourcesPage(); nav = 'resources'; title = '搞笑資源'; bindResources();
  } else if (page === '/channels') {
    main.innerHTML = channelsPage(); nav = 'resources'; title = '影音入口';
  } else if (page === '/glossary') {
    nav = 'glossary'; title = '漫才詞庫';
    main.innerHTML = '<div class="glossary-page wrap subpage" id="glossary-root"></div>';
    glossaryModule ||= await import('./glossary.mjs');
    if (version !== routeVersion) return;
    glossaryModule.mountGlossary(document.querySelector('#glossary-root'), { group: params.get('group'), query: params.get('query'), groups: data.groups });
  } else { main.innerHTML = notFound(); title = '找不到頁面'; }
  document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === nav) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  document.title = `${title}｜日式搞笑大補帖`;
  window.scrollTo(0, 0); main.focus({ preventScroll: true });
}

function notFound() {
  return '<div class="empty-state wrap"><h1>這個舞台，還沒有藝人登場。</h1><p>網址可能有誤，回首頁繼續探索吧。</p><a class="button primary" href="#/">回到首頁</a></div>';
}

document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); main.focus(); main.scrollIntoView(); });
window.addEventListener('hashchange', route);
try {
  const suffix = window.JPCOMEDY_SITE?.assetVersion ? `?v=${window.JPCOMEDY_SITE.assetVersion}` : '';
  let response = await fetch(`./catalog.json${suffix}`);
  if (response.status === 404) response = await fetch('./data.json'); // older local builds
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  data = await response.json(); route();
} catch (error) {
  main.innerHTML = '<div class="empty-state"><h1>資料暫時沒載入成功。</h1><p>請確認已執行 npm run build，並透過 npm start 開啟本機預覽。</p><button class="button primary" id="reload">重新載入</button></div>';
  document.querySelector('#reload').addEventListener('click', () => location.reload()); console.error(error);
}
