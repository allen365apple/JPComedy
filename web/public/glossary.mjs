// Mountable 漫才詞庫 page. Shares the site header/nav/footer, keeps its own
// state in a module-level store (so drafts, search and filters survive in-tab
// navigation), and never permanently deletes entries. See INTEGRATION_PLAN.md.
import {
  clone, escapeHtml as esc, counts, visibleItems, validateDraft, commitEditor,
  buildLinkIndex, linkForUnit, unitIndexForGroup, createApi, createMockBackend, emptyData,
} from './glossary-core.mjs';

const DEFAULT_CLOUD = { repository: 'allen365apple/jpcomedy-glossary', branch: 'main', apiBase: '' };

function siteConfig() {
  const cfg = (typeof window !== 'undefined' && window.JPCOMEDY_SITE) || {};
  return { glossaryMode: cfg.glossaryMode || 'fixture', cloud: { ...DEFAULT_CLOUD, ...(cfg.cloud || {}) } };
}

// Module-level singleton: preserved across mount/unmount so an unsaved draft is
// not lost when the user visits an artist page and comes back.
const store = {
  initialised: false, mode: 'fixture', api: null,
  data: emptyData(), baseData: emptyData(), baseSha: null,
  dirty: false, filter: 'all', search: '', focusId: null,
  unlocked: false, session: null, editor: null,
  snapshotMeta: null, readOnlyFallback: false, conflict: null,
  status: '載入中…', groups: [], linkIndex: new Map(),
};

let host = null;              // current container element
let keydownHandler = null;    // document-level handler to clean up
let beforeUnloadBound = false;

const clamp = (value) => String(value == null ? '' : value);

// ---- lifecycle ---------------------------------------------------------------

export async function mountGlossary(container, ctx = {}) {
  host = container;
  store.groups = ctx.groups || store.groups;
  store.linkIndex = buildLinkIndex(store.groups);
  store.focusId = ctx.group || null;
  if (ctx.query != null && !store.initialised) store.search = ctx.query;

  renderShell();
  bindShell();
  if (!keydownHandler) {
    keydownHandler = (event) => { if (event.key === 'Escape' && store.editor) closeEditor(); };
    document.addEventListener('keydown', keydownHandler);
  }
  if (!beforeUnloadBound) {
    window.addEventListener('beforeunload', (event) => { if (store.dirty) event.preventDefault(); });
    beforeUnloadBound = true;
  }

  if (!store.initialised) {
    await initialise();
  } else {
    setStatus();
    renderList();
    applyFocusToSearch();
  }
}

export function unmountGlossary() {
  if (keydownHandler) { document.removeEventListener('keydown', keydownHandler); keydownHandler = null; }
  host = null; // keep `store` intact so drafts persist
}

async function initialise() {
  const cfg = siteConfig();
  store.mode = cfg.glossaryMode;
  try {
    if (store.mode === 'fixture') {
      const snap = await fetchJson('./glossary-snapshot.json');
      store.snapshotMeta = { generatedAt: snap.generatedAt, counts: snap.counts, sha256: snap.sha256 };
      store.api = createApi({ mode: 'fixture', backend: createMockBackend(snap.data, `fixture-${clamp(snap.sha256).slice(0, 8)}`) });
    } else if (store.mode === 'local') {
      store.api = createApi({ mode: 'local' });
    } else {
      store.api = createApi({ mode: 'cloud', cloud: cfg.cloud });
    }
    const res = await store.api.load();
    store.data = res.data; store.baseData = clone(res.data); store.baseSha = res.sha;
    store.readOnlyFallback = false; store.initialised = true; store.dirty = false;
    setStatus('詞庫已載入');
  } catch (error) {
    // Fall back to the shipped read-only snapshot so browsing still works.
    try {
      const snap = await fetchJson('./glossary-snapshot.json');
      store.data = snap.data; store.baseData = clone(snap.data); store.baseSha = null;
      store.snapshotMeta = { generatedAt: snap.generatedAt, counts: snap.counts, sha256: snap.sha256 };
      store.readOnlyFallback = true; store.initialised = true; store.dirty = false;
      setStatus(`即時詞庫連線失敗，顯示 ${snap.generatedAt} 唯讀快照`);
      toast(`讀取線上詞庫失敗：${error.message}`, true);
    } catch (fallbackError) {
      setStatus('無法讀取詞庫');
      toast(`讀取失敗：${fallbackError.message}`, true);
    }
  }
  if (host) { renderList(); applyFocusToSearch(); }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// ---- rendering ---------------------------------------------------------------

const FILTERS = [['all', '全部'], ['groups', '漫才組合'], ['solo', '單人藝人'], ['others', '節目與術語'], ['archived', '已封存']];

function renderShell() {
  const editable = store.mode !== undefined; // mode decides unlock UI below
  host.innerHTML = `
    <a class="back-link" href="#/resources">← 回到搞笑資源</a>
    <div class="page-intro"><p class="eyebrow">THE COMEDY GLOSSARY</p><h1>日本搞笑翻譯，<br>從同一份詞庫開始。</h1>
      <p>這是 JPComedy 翻譯工具使用的共用詞庫，也是日本搞笑內容翻譯時的重要參考來源。大家都可以更新；之後翻譯影片時，也可以直接從這裡取用固定譯名。<br><a class="text-link" href="https://github.com/allen365apple/JPComedy" target="_blank" rel="noopener noreferrer">查看 JPComedy GitHub ↗</a></p></div>

    <div class="glossary-statusbar">
      <span class="verified-mark">✓ 共用詞庫與翻譯詞庫交叉比對</span>
      <span id="glossary-mode" class="glossary-mode"></span>
      <span id="glossary-status" class="glossary-status" role="status" aria-live="polite">${esc(store.status)}</span>
    </div>

    <section class="glossary-page__editbar" aria-label="編輯詞庫">
      <div id="glossary-unlock" class="glossary-unlock"></div>
      <div class="glossary-editactions">
        <span id="glossary-savestate" class="glossary-savestate"></span>
        <button id="glossary-add-group" class="button button-small button-secondary" type="button" hidden>＋ 漫才組合</button>
        <button id="glossary-add-solo" class="button button-small button-secondary" type="button" hidden>＋ 單人藝人</button>
        <button id="glossary-add-term" class="button button-small button-secondary" type="button" hidden>＋ 節目／術語</button>
        <button id="glossary-export" class="button button-small button-ghost" type="button">匯出草稿</button>
        <button id="glossary-save" class="button primary button-small" type="button" hidden disabled>儲存所有變更</button>
      </div>
    </section>

    <div id="glossary-conflict" class="glossary-conflict" hidden></div>

    <label class="search-field glossary-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
      <input id="glossary-search" type="search" value="${esc(store.search)}" aria-label="搜尋詞庫" placeholder="搜尋日文、中文譯名、成員或備註">
    </label>

    <div id="glossary-focus" class="glossary-focus" hidden></div>

    <div class="glossary-filters" role="group" aria-label="分類篩選">
      ${FILTERS.map(([key, label]) => `<button class="chip" data-glossary-filter="${key}" aria-pressed="${store.filter === key}">${label} <b id="gcount-${key}"></b></button>`).join('')}
    </div>

    <p id="glossary-summary" class="micro-note" role="status" aria-live="polite"></p>
    <div id="glossary-list" class="glossary-list"></div>
    <div id="glossary-empty" class="empty-state" hidden><h3>找不到符合的詞條。</h3><p>試試其他名稱或切換分類。</p></div>

    <p class="editorial-note">封存使用既有的 disabled 欄位，不會永久刪除；備註與別名等相容欄位都會保留。原文中的譯名保留原樣，本站標題與成員固定譯名依共用詞庫呈現。</p>

    <div id="glossary-modal" class="glossary-modal" hidden role="dialog" aria-modal="true" aria-labelledby="glossary-modal-title">
      <div class="glossary-modal__backdrop" data-glossary-close></div>
      <div class="glossary-modal__panel" role="document">
        <div class="glossary-modal__head"><div><p class="eyebrow" id="glossary-modal-eyebrow"></p><h2 id="glossary-modal-title"></h2></div>
          <button class="glossary-modal__x" type="button" data-glossary-close aria-label="關閉">×</button></div>
        <div id="glossary-modal-body" class="glossary-modal__body"></div>
        <div class="glossary-modal__foot">
          <button class="button button-small button-ghost" type="button" data-glossary-close>取消</button>
          <button id="glossary-apply" class="button primary button-small" type="button">套用這筆修改</button>
        </div>
      </div>
    </div>

    <div id="glossary-toast" class="glossary-toast" role="status" aria-live="polite"></div>`;
}

function setStatus(message) {
  if (message != null) store.status = message;
  const node = host && host.querySelector('#glossary-status');
  if (node) node.textContent = store.status;
  const mode = host && host.querySelector('#glossary-mode');
  if (mode) {
    const labels = { fixture: '測試資料（fixture 快照）', local: '本機 API', cloud: '正式公開詞庫' };
    const meta = store.snapshotMeta ? `｜快照 ${store.snapshotMeta.generatedAt}` : '';
    mode.textContent = `資料來源：${labels[store.mode] || store.mode}${store.readOnlyFallback ? '（唯讀）' : ''}${meta}`;
  }
  renderEditControls();
}

function renderEditControls() {
  if (!host) return;
  const canWrite = store.api && store.api.editable && !store.readOnlyFallback;
  const unlock = host.querySelector('#glossary-unlock');
  const saveState = host.querySelector('#glossary-savestate');
  const showAdd = store.unlocked && canWrite;
  ['glossary-add-group', 'glossary-add-solo', 'glossary-add-term'].forEach((id) => {
    const b = host.querySelector('#' + id); if (b) b.hidden = !showAdd;
  });
  const saveBtn = host.querySelector('#glossary-save');
  if (saveBtn) {
    saveBtn.hidden = !showAdd;
    saveBtn.disabled = !store.dirty || !store.unlocked || Boolean(store.conflict);
  }
  if (saveState) saveState.textContent = store.dirty ? '● 有尚未儲存的變更' : '';
  saveState?.classList.toggle('is-dirty', store.dirty);

  if (!unlock) return;
  if (!canWrite) {
    unlock.innerHTML = `<p class="glossary-hint">目前為唯讀模式，可瀏覽與匯出草稿；如需編輯請以本機或正式模式開啟。</p>`;
    return;
  }
  if (store.unlocked) {
    unlock.innerHTML = `<button id="glossary-lock" class="button button-small button-secondary" type="button">結束編輯</button><span class="glossary-hint">已解鎖，可新增與修改；按「儲存所有變更」才會寫入詞庫。</span>`;
    host.querySelector('#glossary-lock').addEventListener('click', lock);
    return;
  }
  if (store.mode === 'cloud') {
    unlock.innerHTML = `
      <div class="glossary-unlock__row">
        <input id="glossary-password" type="password" placeholder="輸入共用編輯密碼" aria-label="共用編輯密碼" autocomplete="off">
        <button id="glossary-unlock-btn" class="button button-small button-secondary" type="button">解鎖編輯</button>
      </div>
      <span class="glossary-hint">向柏文索取密碼。解鎖後才會顯示新增與儲存。</span>`;
    host.querySelector('#glossary-unlock-btn').addEventListener('click', () => unlock_(host.querySelector('#glossary-password').value));
    host.querySelector('#glossary-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock_(e.target.value); });
  } else {
    unlock.innerHTML = `<button id="glossary-unlock-btn" class="button button-small button-secondary" type="button">編輯詞庫</button><span class="glossary-hint">${store.mode === 'local' ? '本機模式：解鎖即可編輯並寫入本機 API。' : '測試模式：解鎖後可試用編輯，儲存只會寫入本機測試資料。'}</span>`;
    host.querySelector('#glossary-unlock-btn').addEventListener('click', () => unlock_(''));
  }
}

function bindShell() {
  host.querySelector('#glossary-search').addEventListener('input', (event) => {
    store.search = event.target.value;
    store.focusId = null; // typing leaves the single-artist focus
    history.replaceState(null, '', '#/glossary' + (store.search ? '?query=' + encodeURIComponent(store.search) : ''));
    renderList();
  });
  host.querySelectorAll('[data-glossary-filter]').forEach((btn) => btn.addEventListener('click', () => {
    store.filter = btn.dataset.glossaryFilter; store.focusId = null; renderList();
  }));
  host.querySelector('#glossary-add-group').addEventListener('click', () => openEditor({ type: 'talent', index: null, isNew: true, draft: { group: { jp: [''], zh: '' }, members: [{ jp: [''], zh: '' }] } }));
  host.querySelector('#glossary-add-solo').addEventListener('click', () => openEditor({ type: 'talent', index: null, isNew: true, draft: { group: null, members: [{ jp: [''], zh: '' }] } }));
  host.querySelector('#glossary-add-term').addEventListener('click', () => openEditor({ type: 'other', index: null, isNew: true, draft: { jp: [''], zh: '' } }));
  host.querySelector('#glossary-save').addEventListener('click', saveAll);
  host.querySelector('#glossary-export').addEventListener('click', exportDraft);
  host.querySelector('#glossary-apply').addEventListener('click', applyEditor);
  host.querySelectorAll('[data-glossary-close]').forEach((el) => el.addEventListener('click', closeEditor));

  // Delegated actions on the list (edit / archive) survive list re-renders.
  host.querySelector('#glossary-list').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-act]');
    if (!btn) return;
    const kind = btn.dataset.kind; const index = Number(btn.dataset.index);
    if (btn.dataset.act === 'edit') {
      if (kind === 'talent') openEditor({ type: 'talent', index, isNew: false, draft: clone(store.data.talents[index]) });
      else openEditor({ type: 'other', index, isNew: false, draft: clone(store.data.others[index]) });
    } else if (btn.dataset.act === 'toggle') {
      if (!requireUnlocked()) return;
      const target = kind === 'talent' ? store.data.talents[index] : store.data.others[index];
      target.disabled = !target.disabled; if (!target.disabled) delete target.disabled;
      setDirty(); renderList();
    }
  });
}

function applyFocusToSearch() {
  const focus = host && host.querySelector('#glossary-focus');
  if (!focus) return;
  if (!store.focusId) { focus.hidden = true; focus.innerHTML = ''; return; }
  const group = store.groups.find((g) => g.id === store.focusId);
  if (!group) { focus.hidden = true; return; }
  focus.hidden = false;
  focus.innerHTML = `目前聚焦：<b>${esc(group.zh)}</b> <span lang="ja">${esc(group.jp)}</span> · <a class="text-link" href="#/groups/${esc(group.id)}">查看介紹 <span aria-hidden="true">↗</span></a> · <button type="button" class="glossary-linkbtn" id="glossary-clearfocus">顯示全部詞庫</button>`;
  focus.querySelector('#glossary-clearfocus').addEventListener('click', () => { store.focusId = null; renderList(); });
}

function currentItems() {
  if (store.focusId) {
    const group = store.groups.find((g) => g.id === store.focusId);
    const idx = unitIndexForGroup(store.data, group);
    if (idx >= 0) return [{ type: 'talent', index: idx, value: store.data.talents[idx], kind: store.data.talents[idx].group ? 'groups' : 'solo' }];
    return [];
  }
  return visibleItems(store.data, { filter: store.filter, search: store.search });
}

function renderList() {
  if (!host) return;
  const c = counts(store.data);
  FILTERS.forEach(([key]) => { const n = host.querySelector('#gcount-' + key); if (n) n.textContent = c[key]; });
  host.querySelectorAll('[data-glossary-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.glossaryFilter === store.filter && !store.focusId)));
  const items = currentItems();
  const summary = host.querySelector('#glossary-summary');
  if (summary) summary.textContent = store.focusId ? '聚焦單一藝人詞條' : (store.search ? `找到 ${items.length} 筆符合項目` : `共 ${items.length} 筆`);
  host.querySelector('#glossary-list').innerHTML = items.map(cardHtml).join('');
  const empty = host.querySelector('#glossary-empty'); if (empty) empty.hidden = items.length > 0;
  setStatus();
  applyFocusToSearch();
}

function mappingDisplay(mapping) {
  const aliases = (mapping.jp || []).map(esc).join(' ／ ');
  return `<strong lang="ja">${aliases}</strong>${mapping.note ? `<small>${esc(mapping.note)}</small>` : ''}`;
}

function translationDisplay(mapping) {
  const aliases = (mapping.jp || []).map(esc).join(' ／ ');
  return `<div class="glossary-translation"><div><span class="translation-label">日文</span><strong class="glossary-jp" lang="ja">${aliases}</strong></div><span class="translation-arrow" aria-hidden="true">↓</span><div><span class="translation-label">中文</span><strong class="glossary-zh">${esc(mapping.zh)}</strong></div>${mapping.note ? `<small class="translation-note">${esc(mapping.note)}</small>` : ''}</div>`;
}

function cardHtml(item) {
  if (item.type === 'other') {
    const e = item.value; const archived = Boolean(e.disabled);
    return `<article class="glossary-row${archived ? ' is-archived' : ''}">
      <div class="glossary-row__meta"><span class="glossary-kind">節目與術語</span><small>${archived ? '已封存' : '啟用中'}</small></div>
      <div class="glossary-row__map">${translationDisplay(e)}</div>
      <div class="glossary-row__actions">
        <button class="button button-small button-secondary" data-act="edit" data-kind="other" data-index="${item.index}" type="button">編輯</button>
        <button class="button button-small ${archived ? '' : 'button-ghost'}" data-act="toggle" data-kind="other" data-index="${item.index}" type="button">${archived ? '恢復' : '封存'}</button>
      </div></article>`;
  }
  const unit = item.value; const archived = Boolean(unit.disabled);
  const primary = unit.group || unit.members[0];
  const typeLabel = unit.group ? '漫才組合' : '單人藝人';
  const members = (unit.members || []).map((m) => `<span class="member-chip${m.disabled ? ' is-archived' : ''}">${m.disabled ? '封存·' : ''}${esc(m.zh)}</span>`).join('');
  const linkId = linkForUnit(unit, store.linkIndex);
  const link = linkId ? `<a class="text-link glossary-row__link" href="#/groups/${esc(linkId)}">查看介紹 <span aria-hidden="true">↗</span></a>` : '<span class="glossary-row__nolink">尚未建立介紹頁</span>';
  return `<article class="glossary-row${archived ? ' is-archived' : ''}">
    <div class="glossary-row__meta"><span class="glossary-kind">${typeLabel}</span><small>${archived ? '已封存' : `${(unit.members || []).filter((m) => !m.disabled).length} 位成員`}</small></div>
    <div class="glossary-row__map">${translationDisplay(primary)}<div class="glossary-row__members">${members}</div>${link}</div>
    <div class="glossary-row__actions">
      <button class="button button-small button-secondary" data-act="edit" data-kind="talent" data-index="${item.index}" type="button">編輯</button>
      <button class="button button-small ${archived ? '' : 'button-ghost'}" data-act="toggle" data-kind="talent" data-index="${item.index}" type="button">${archived ? '恢復' : '封存'}</button>
    </div></article>`;
}

// ---- editor modal ------------------------------------------------------------

function openEditor(editor) {
  if (!requireUnlocked()) return;
  store.editor = editor;
  const modal = host.querySelector('#glossary-modal');
  host.querySelector('#glossary-modal-eyebrow').textContent = editor.isNew ? '新增' : '編輯';
  host.querySelector('#glossary-modal-title').textContent = editor.type === 'other' ? '節目、品牌或漫才術語' : (editor.draft.group ? '漫才組合與成員' : '單人藝人');
  modal.hidden = false;
  renderEditorBody();
  const first = modal.querySelector('input'); if (first) first.focus();
}

function closeEditor() {
  store.editor = null;
  const modal = host && host.querySelector('#glossary-modal');
  if (modal) { modal.hidden = true; host.querySelector('#glossary-modal-body').innerHTML = ''; }
}

function aliasEditor(mapping, path) {
  const rows = (mapping.jp || []).map((alias, i) => `
    <div class="alias-row">
      <input data-alias-path="${path}" data-alias-index="${i}" value="${esc(alias)}" placeholder="輸入日文原名或別名" lang="ja">
      <button class="alias-remove" data-remove-alias="${path}" data-remove-index="${i}" type="button" title="移除這個別名">−</button>
    </div>`).join('');
  return `<div class="alias-list">${rows}</div><button class="button button-small button-ghost" data-add-alias="${path}" type="button">＋ 增加日文別名</button>`;
}

function mappingEditor(mapping, path, title, options = {}) {
  return `<section class="glossary-form__section${mapping.disabled ? ' is-archived' : ''}">
    <div class="glossary-form__head"><h3>${esc(title)}</h3>${options.archivable ? `<button class="button button-small button-ghost" data-toggle-mapping="${path}" type="button">${mapping.disabled ? '恢復成員' : '封存成員'}</button>` : ''}</div>
    <div class="glossary-form__grid">
      <div class="field field-full"><label>日文原名與別名</label>${aliasEditor(mapping, path)}<small>語音辨識可能出現不同寫法時，可逐一增加。</small></div>
      <div class="field"><label>固定繁中譯名</label><input data-field-path="${path}.zh" value="${esc(mapping.zh || '')}" placeholder="例如：Evers"></div>
      <div class="field"><label>備註（選填）</label><input data-field-path="${path}.note" value="${esc(mapping.note || '')}" placeholder="例如：M-1 2025 決賽組合"></div>
    </div></section>`;
}

function renderEditorBody() {
  const editor = store.editor; if (!editor) return;
  const body = host.querySelector('#glossary-modal-body');
  if (editor.type === 'other') {
    body.innerHTML = `<p class="glossary-hint">適合節目名稱、單元、品牌、角色稱呼，以及ボケ／ツッコミ等漫才術語。</p>${mappingEditor(editor.draft, 'entry', '詞彙內容')}`;
  } else {
    const unit = editor.draft;
    const groupSection = unit.group ? mappingEditor(unit.group, 'group', '組合名稱') : '<p class="glossary-hint">這是單人藝人，不需要填組合名稱。</p>';
    const memberSections = unit.members.map((m, i) => mappingEditor(m, `members.${i}`, `成員 ${i + 1}`, { archivable: true })).join('');
    body.innerHTML = `${groupSection}<div class="glossary-form__head" style="margin-top:18px"><h3>成員資料</h3><button id="glossary-add-member" class="button button-small button-secondary" type="button">＋ 新增成員</button></div>${memberSections}`;
    body.querySelector('#glossary-add-member').addEventListener('click', () => { syncEditorInputs(); unit.members.push({ jp: [''], zh: '' }); renderEditorBody(); });
  }
  bindEditorBody();
}

function getMapping(path) {
  if (path === 'entry') return store.editor.draft;
  if (path === 'group') return store.editor.draft.group;
  return store.editor.draft.members[Number(path.split('.')[1])];
}

function syncEditorInputs() {
  if (!store.editor || !host) return;
  host.querySelectorAll('[data-field-path]').forEach((input) => {
    const [path, field] = input.dataset.fieldPath.split(/\.(?=[^.]+$)/);
    const mapping = getMapping(path);
    if (input.value.trim()) mapping[field] = input.value; else delete mapping[field];
  });
  host.querySelectorAll('[data-alias-path]').forEach((input) => {
    getMapping(input.dataset.aliasPath).jp[Number(input.dataset.aliasIndex)] = input.value;
  });
}

function bindEditorBody() {
  host.querySelectorAll('[data-add-alias]').forEach((b) => b.addEventListener('click', () => { syncEditorInputs(); getMapping(b.dataset.addAlias).jp.push(''); renderEditorBody(); }));
  host.querySelectorAll('[data-remove-alias]').forEach((b) => b.addEventListener('click', () => {
    syncEditorInputs(); const mapping = getMapping(b.dataset.removeAlias);
    if (mapping.jp.length === 1) return toast('至少要保留一個日文名稱。', true);
    mapping.jp.splice(Number(b.dataset.removeIndex), 1); renderEditorBody();
  }));
  host.querySelectorAll('[data-toggle-mapping]').forEach((b) => b.addEventListener('click', () => {
    syncEditorInputs(); const mapping = getMapping(b.dataset.toggleMapping);
    mapping.disabled = !mapping.disabled; if (!mapping.disabled) delete mapping.disabled; renderEditorBody();
  }));
}

function applyEditor() {
  try {
    syncEditorInputs();
    validateDraft(store.editor);
    store.data = commitEditor(store.data, store.editor);
    setDirty();
    closeEditor();
    renderList();
    toast('已套用到畫面，記得按「儲存所有變更」。');
  } catch (error) {
    toast(error.message, true);
  }
}

// ---- edit session, save, conflicts ------------------------------------------

function requireUnlocked() {
  if (store.unlocked) return true;
  toast('請先點「編輯詞庫」解鎖。', true);
  return false;
}

async function unlock_(password) {
  try {
    const result = await store.api.unlock(password);
    store.session = result.token || 'session';
    store.unlocked = true;
    setStatus();
    toast('已解鎖，可以編輯；按「儲存所有變更」才會寫入。');
  } catch (error) {
    toast(error.message, true);
  }
}

function lock() {
  store.session = null; store.unlocked = false; setStatus();
  toast('已結束編輯模式；仍可瀏覽與匯出草稿。');
}

function setDirty(value = true) {
  store.dirty = value;
  setStatus(value ? '有尚未儲存的變更' : '詞庫已載入');
}

async function saveAll() {
  if (store.conflict) { toast('請先處理版本衝突（匯出草稿或改用最新版本），再儲存。', true); return; }
  const btn = host.querySelector('#glossary-save');
  btn.disabled = true; btn.textContent = '儲存中…';
  try {
    const result = await store.api.save(store.data, store.baseSha, store.session);
    store.data = result.data; store.baseData = clone(result.data); store.baseSha = result.sha;
    setDirty(false);
    renderList();
    toast('儲存成功！下一次翻譯會直接使用。');
  } catch (error) {
    if (error.status === 409) {
      await enterConflict();
    } else if (error.status === 401) {
      store.unlocked = false; store.session = null; setStatus('session 已過期，請重新解鎖');
      toast('登入已過期，草稿仍保留；請重新解鎖後再儲存。', true);
    } else {
      toast(`儲存失敗：${error.message}`, true);
    }
  } finally {
    btn.textContent = '儲存所有變更';
    renderEditControls();
  }
}

// On 409 we NEVER just refresh the SHA and resend (that would clobber the other
// editor). Keep the draft and baseline; fetch the remote and offer safe choices.
async function enterConflict() {
  let remote = null;
  try { remote = await store.api.refresh(); } catch { /* keep draft regardless */ }
  store.conflict = { remoteData: remote ? remote.data : null, remoteSha: remote ? remote.sha : null };
  const panel = host.querySelector('#glossary-conflict');
  panel.hidden = false;
  panel.innerHTML = `
    <h3>版本衝突：詞庫已被其他人更新</h3>
    <p>你的草稿仍完整保留在畫面上，且尚未覆蓋任何人的變更。請選擇處理方式後再繼續，系統不會直接重試覆寫。</p>
    <div class="glossary-conflict__actions">
      <button id="glossary-conflict-export" class="button button-small button-secondary" type="button">先匯出我的草稿</button>
      <button id="glossary-conflict-adopt" class="button button-small button-ghost" type="button"${remote ? '' : ' disabled'}>改用最新版本（放棄我的變更）</button>
    </div>
    <p class="micro-note">建議流程：先匯出草稿 → 改用最新版本 → 逐項貼回你的修改 → 再儲存。</p>`;
  panel.querySelector('#glossary-conflict-export').addEventListener('click', exportDraft);
  panel.querySelector('#glossary-conflict-adopt').addEventListener('click', adoptRemote);
  setStatus('版本衝突：草稿已保留');
  toast('偵測到他人更新，已保留你的草稿。請先匯出或改用最新版本。', true);
}

function adoptRemote() {
  if (!store.conflict || !store.conflict.remoteData) return;
  store.data = clone(store.conflict.remoteData);
  store.baseData = clone(store.conflict.remoteData);
  store.baseSha = store.conflict.remoteSha;
  store.conflict = null; store.dirty = false;
  host.querySelector('#glossary-conflict').hidden = true;
  renderList();
  toast('已改用最新版本。你的草稿仍在剛才匯出的檔案裡（若已匯出）。');
}

function exportDraft() {
  try {
    const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `漫才詞庫草稿-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
    toast('已匯出草稿 JSON（不含密碼或 session）。');
  } catch (error) {
    toast(`匯出失敗：${error.message}`, true);
  }
}

let toastTimer = null;
function toast(message, isError = false) {
  const node = host && host.querySelector('#glossary-toast');
  if (!node) return;
  node.textContent = message;
  node.className = `glossary-toast is-visible${isError ? ' is-error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.className = 'glossary-toast'; }, 3600);
}

// Exposed for tests / debugging without going through the DOM.
export const _store = store;
