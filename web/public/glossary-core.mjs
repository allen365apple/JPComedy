// Pure, DOM-free glossary logic shared by the page module and the Node tests.
// Keeps the full shared-glossary schema ({ talents, others }) and the existing
// disabled/note/alias semantics so it stays compatible with the pipeline.

export const clone = (value) => JSON.parse(JSON.stringify(value));

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function emptyData() {
  return { talents: [], others: [] };
}

function activeMembers(unit) {
  return (unit.members || []).filter((m) => !m.disabled);
}

/** Counts used by the filter chips and the summary line. */
export function counts(data) {
  const talents = data.talents || [];
  const others = data.others || [];
  const activeUnits = talents.filter((u) => !u.disabled);
  const groups = activeUnits.filter((u) => u.group);
  const solo = activeUnits.filter((u) => !u.group);
  const members = activeUnits.reduce((n, u) => n + activeMembers(u).length, 0);
  const activeOthers = others.filter((e) => !e.disabled);
  const archivedMembers = talents.reduce((n, u) => n + (u.members || []).filter((m) => m.disabled).length, 0);
  const archived = talents.filter((u) => u.disabled).length + others.filter((e) => e.disabled).length + archivedMembers;
  return {
    all: activeUnits.length + activeOthers.length,
    groups: groups.length,
    solo: solo.length,
    members,
    others: activeOthers.length,
    archived,
  };
}

function haystack(value) {
  return JSON.stringify(value).toLocaleLowerCase('zh-Hant');
}

/** Filter + search across talents and others; search covers jp/zh/members/notes. */
export function visibleItems(data, { filter = 'all', search = '' } = {}) {
  const needle = (search || '').trim().toLocaleLowerCase('zh-Hant');
  const items = [];
  (data.talents || []).forEach((unit, index) => {
    const kind = unit.group ? 'groups' : 'solo';
    const memberArchived = (unit.members || []).some((m) => m.disabled);
    const included = filter === 'all' ? !unit.disabled
      : filter === 'archived' ? (unit.disabled || memberArchived)
      : filter === kind && !unit.disabled;
    if (included && (!needle || haystack(unit).includes(needle))) items.push({ type: 'talent', index, value: unit, kind });
  });
  (data.others || []).forEach((entry, index) => {
    const included = filter === 'all' ? !entry.disabled
      : filter === 'archived' ? entry.disabled
      : filter === 'others' && !entry.disabled;
    if (included && (!needle || haystack(entry).includes(needle))) items.push({ type: 'other', index, value: entry, kind: 'others' });
  });
  return items;
}

/** Normalise + validate one alias/target mapping. Mutates and throws on error. */
export function validateMapping(mapping, label) {
  mapping.jp = [...new Set((mapping.jp || []).map((a) => String(a).trim()).filter(Boolean))];
  mapping.zh = String(mapping.zh || '').trim();
  if (!mapping.jp.length) throw new Error(`${label}至少需要一個日文名稱`);
  if (!mapping.zh) throw new Error(`${label}需要填入固定繁中譯名`);
  if (mapping.note) mapping.note = String(mapping.note).trim();
  else delete mapping.note;
  return mapping;
}

/** Validate a whole editor draft (talent or other) before it is committed. */
export function validateDraft(editor) {
  if (editor.type === 'other') {
    validateMapping(editor.draft, '這筆詞彙');
    return editor.draft;
  }
  if (editor.draft.group) validateMapping(editor.draft.group, '組合名稱');
  if (!editor.draft.members || !editor.draft.members.length) throw new Error('至少需要一位成員');
  editor.draft.members.forEach((m, i) => validateMapping(m, `成員 ${i + 1}`));
  return editor.draft;
}

/** Apply a validated editor draft into a copy of data; returns the new data. */
export function commitEditor(data, editor) {
  const next = clone(data);
  validateDraft(editor);
  if (editor.type === 'other') {
    if (editor.isNew) next.others.unshift(editor.draft);
    else next.others[editor.index] = editor.draft;
  } else {
    if (editor.isNew) next.talents.unshift(editor.draft);
    else next.talents[editor.index] = editor.draft;
  }
  return next;
}

// ---- Artist ↔ glossary links -------------------------------------------------

/** Map every profile's canonical jp + aliases to its stable id. */
export function buildLinkIndex(groups = []) {
  const index = new Map();
  for (const g of groups) {
    const keys = new Set([g.jp, ...(g.glossaryAliases || [])]);
    for (const m of g.members || []) for (const a of (m.glossaryAliases || [])) keys.add(a);
    for (const key of keys) if (key) index.set(key, g.id);
  }
  return index;
}

/** Resolve which profile (if any) a talent unit corresponds to (group or solo). */
export function linkForUnit(unit, index) {
  if (!unit) return null;
  const names = unit.group ? (unit.group.jp || []) : (unit.members || []).flatMap((m) => m.jp || []);
  for (const jp of names) if (index.has(jp)) return index.get(jp);
  return null;
}

/** Find the talent unit index for a profile id, via its jp/aliases (group or solo). */
export function unitIndexForGroup(data, group) {
  if (!group) return -1;
  const keys = new Set([group.jp, ...(group.glossaryAliases || [])]);
  for (const m of group.members || []) for (const a of (m.glossaryAliases || [])) keys.add(a);
  return (data.talents || []).findIndex((u) => u.group
    ? (u.group.jp || []).some((jp) => keys.has(jp))
    : (u.members || []).some((m) => (m.jp || []).some((jp) => keys.has(jp))));
}

// ---- Data-source adapters ----------------------------------------------------

/**
 * In-memory backend with SHA optimistic concurrency, used by fixture mode and
 * by the tests to reproduce a real 409 without touching any live glossary.
 */
export function createMockBackend(initialData, startSha = 'sha-0') {
  let current = clone(initialData);
  let sha = startSha;
  let counter = 0;
  return {
    get() { return { ok: true, data: clone(current), sha }; },
    put(data, baseSha) {
      if (baseSha !== sha) {
        const error = new Error('有人已更新詞庫。你的修改仍在畫面上；請先匯出草稿，再重新載入、比對後儲存。');
        error.status = 409;
        throw error;
      }
      current = clone(data);
      sha = `sha-${++counter}`;
      return { ok: true, data: clone(current), sha };
    },
    peek() { return { data: clone(current), sha }; },
  };
}

/**
 * Build a data-source adapter for a given mode.
 * - fixture: reads the shipped snapshot; saves go to an in-memory backend.
 * - local:   same-origin Python API (/api/glossary[, /save, /match]).
 * - cloud:   Worker API (load public, unlock for a session, PUT with SHA).
 * All modes surface {status} on errors so callers can branch on 401/409/etc.
 */
export function createApi(config = {}) {
  const mode = config.mode || 'fixture';
  const fetchImpl = config.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);

  async function jsonRequest(url, options = {}) {
    if (!fetchImpl) throw new Error('此環境沒有可用的網路請求功能。');
    const response = await fetchImpl(url, { cache: 'no-store', ...options });
    let result;
    try { result = await response.json(); } catch { result = {}; }
    if (!response.ok || result.ok === false) {
      const error = new Error(response.status === 409
        ? '有人已更新詞庫。你的修改仍在畫面上；請先匯出草稿，再重新載入、比對後儲存。'
        : (result.message || `連線失敗 (${response.status})`));
      error.status = response.status;
      throw error;
    }
    return result;
  }

  if (mode === 'fixture') {
    const backend = config.backend || createMockBackend(config.snapshotData || emptyData(), config.startSha || 'fixture-0');
    return {
      mode, editable: true, requiresPassword: false,
      async load() { return backend.get(); },
      async unlock() { return { ok: true, token: 'fixture-session' }; },
      async save(data, sha) { return backend.put(data, sha); },
      async refresh() { return backend.get(); },
      backend,
    };
  }

  if (mode === 'local') {
    return {
      mode, editable: true, requiresPassword: false,
      async load() { return jsonRequest('/api/glossary'); },
      async unlock() { return { ok: true, token: 'local-session' }; },
      async save(data) { return jsonRequest('/api/glossary/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
      async refresh() { return jsonRequest('/api/glossary'); },
      async match(text) { return jsonRequest('/api/glossary/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); },
    };
  }

  // cloud
  const cloud = config.cloud || {};
  return {
    mode, editable: true, requiresPassword: true, cloud,
    async load() {
      if (cloud.apiBase) return jsonRequest(`${cloud.apiBase}/api/glossary`);
      const data = await jsonRequest(`https://raw.githubusercontent.com/${cloud.repository}/${cloud.branch}/glossary.json`);
      return { ok: true, data, sha: null };
    },
    async unlock(password) {
      if (!cloud.apiBase) throw new Error('管理員尚未設定雲端儲存。請先匯出草稿。');
      return jsonRequest(`${cloud.apiBase}/auth/password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    },
    async save(data, sha, token) {
      if (!token) { const e = new Error('請先輸入共用編輯密碼。'); e.status = 401; throw e; }
      return jsonRequest(`${cloud.apiBase}/api/glossary`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ data, sha }) });
    },
    async refresh() { return jsonRequest(`${cloud.apiBase}/api/glossary`); },
  };
}
