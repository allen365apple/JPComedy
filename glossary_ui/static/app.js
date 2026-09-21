"use strict";

const state = {
  data: { talents: [], others: [] },
  filter: "all",
  search: "",
  dirty: false,
  editor: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast is-visible${isError ? " is-error" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = "toast"; }, 3200);
}

function setDirty(value = true) {
  state.dirty = value;
  const status = $("#saveStatus");
  status.textContent = value ? "有尚未儲存的變更" : "詞庫已載入";
  status.classList.toggle("is-dirty", value);
  $("#saveButton").disabled = !value || !glossaryStorage.canSave();
}

function activeMembers(unit) {
  return unit.members.filter((member) => !member.disabled);
}

function getCounts() {
  const activeUnits = state.data.talents.filter((unit) => !unit.disabled);
  const groups = activeUnits.filter((unit) => unit.group);
  const solo = activeUnits.filter((unit) => !unit.group);
  const members = activeUnits.reduce((count, unit) => count + activeMembers(unit).length, 0);
  const others = state.data.others.filter((entry) => !entry.disabled);
  const archivedMembers = state.data.talents.reduce(
    (count, unit) => count + unit.members.filter((member) => member.disabled).length, 0
  );
  const archived = state.data.talents.filter((unit) => unit.disabled).length
    + state.data.others.filter((entry) => entry.disabled).length
    + archivedMembers;
  return { activeUnits, groups, solo, members, others, archived };
}

function updateCounts() {
  const counts = getCounts();
  $("#countAll").textContent = counts.activeUnits.length + counts.others.length;
  $("#countGroups").textContent = counts.groups.length;
  $("#countSolo").textContent = counts.solo.length;
  $("#countOthers").textContent = counts.others.length;
  $("#countArchived").textContent = counts.archived;
  $("#statTalent").textContent = counts.activeUnits.length;
  $("#statMembers").textContent = counts.members;
  $("#statTerms").textContent = counts.others.length;
}

function searchable(value) {
  return JSON.stringify(value).toLocaleLowerCase("zh-Hant").includes(state.search);
}

function visibleItems() {
  const items = [];
  state.data.talents.forEach((unit, index) => {
    const kind = unit.group ? "groups" : "solo";
    const memberArchived = unit.members.some((member) => member.disabled);
    const included = state.filter === "all"
      ? !unit.disabled
      : state.filter === "archived"
        ? unit.disabled || memberArchived
        : state.filter === kind && !unit.disabled;
    if (included && searchable(unit)) items.push({ type: "talent", index, value: unit, kind });
  });
  state.data.others.forEach((entry, index) => {
    const included = state.filter === "all"
      ? !entry.disabled
      : state.filter === "archived"
        ? entry.disabled
        : state.filter === "others" && !entry.disabled;
    if (included && searchable(entry)) items.push({ type: "other", index, value: entry, kind: "others" });
  });
  return items;
}

function mappingDisplay(mapping) {
  const aliases = mapping.jp.map(escapeHtml).join(" ／ ");
  return `<strong>${aliases}</strong><p>${mapping.note ? escapeHtml(mapping.note) : "日文原名與可辨識別名"}</p>`;
}

function talentCard(item) {
  const unit = item.value;
  const isArchived = Boolean(unit.disabled);
  const primary = unit.group || unit.members[0];
  const typeLabel = unit.group ? "漫才組合" : "單人藝人";
  const typeIcon = unit.group ? "組" : "人";
  const members = unit.members.map((member) => `
    <span class="member-chip">${member.disabled ? "封存 · " : ""}${escapeHtml(member.zh)}</span>
  `).join("");
  return `
    <article class="glossary-card${isArchived ? " is-archived" : ""}">
      <div class="type-cell"><span class="type-badge">${typeIcon}</span><div><b>${typeLabel}</b><small>${isArchived ? "目前不會套用" : `${activeMembers(unit).length} 位啟用成員`}</small></div></div>
      <div class="mapping-cell">${mappingDisplay(primary)}<div class="members-line">${members}</div></div>
      <div class="arrow-cell">→</div>
      <div class="mapping-cell"><strong>${escapeHtml(primary.zh)}</strong><p>${unit.group ? "固定組合譯名" : "固定藝人譯名"}</p></div>
      <div class="card-actions">
        <button class="button button-small button-secondary" data-edit-talent="${item.index}" type="button">編輯</button>
        <button class="button button-small ${isArchived ? "restore-button" : "archive-button"}" data-toggle-talent="${item.index}" type="button">${isArchived ? "恢復" : "封存"}</button>
      </div>
    </article>`;
}

function otherCard(item) {
  const entry = item.value;
  const isArchived = Boolean(entry.disabled);
  return `
    <article class="glossary-card${isArchived ? " is-archived" : ""}">
      <div class="type-cell"><span class="type-badge">詞</span><div><b>節目與術語</b><small>${isArchived ? "目前不會套用" : "啟用中"}</small></div></div>
      <div class="mapping-cell">${mappingDisplay(entry)}</div>
      <div class="arrow-cell">→</div>
      <div class="mapping-cell"><strong>${escapeHtml(entry.zh)}</strong><p>固定繁中譯名</p></div>
      <div class="card-actions">
        <button class="button button-small button-secondary" data-edit-other="${item.index}" type="button">編輯</button>
        <button class="button button-small ${isArchived ? "restore-button" : "archive-button"}" data-toggle-other="${item.index}" type="button">${isArchived ? "恢復" : "封存"}</button>
      </div>
    </article>`;
}

function render() {
  updateCounts();
  const titles = { all: "全部詞庫", groups: "漫才組合", solo: "單人藝人", others: "節目與術語", archived: "已封存" };
  const items = visibleItems();
  $("#listTitle").textContent = titles[state.filter];
  $("#resultSummary").textContent = state.search ? `找到 ${items.length} 筆符合項目` : `共 ${items.length} 筆`;
  $("#glossaryList").innerHTML = items.map((item) => item.type === "talent" ? talentCard(item) : otherCard(item)).join("");
  $("#emptyState").hidden = items.length > 0;
  bindCardActions();
}

function bindCardActions() {
  $$('[data-edit-talent]').forEach((button) => button.addEventListener("click", () => openTalentEditor(Number(button.dataset.editTalent))));
  $$('[data-edit-other]').forEach((button) => button.addEventListener("click", () => openOtherEditor(Number(button.dataset.editOther))));
  $$('[data-toggle-talent]').forEach((button) => button.addEventListener("click", () => {
    const unit = state.data.talents[Number(button.dataset.toggleTalent)];
    unit.disabled = !unit.disabled;
    if (!unit.disabled) delete unit.disabled;
    setDirty(); render();
  }));
  $$('[data-toggle-other]').forEach((button) => button.addEventListener("click", () => {
    const entry = state.data.others[Number(button.dataset.toggleOther)];
    entry.disabled = !entry.disabled;
    if (!entry.disabled) delete entry.disabled;
    setDirty(); render();
  }));
}

function aliasEditor(mapping, path) {
  const rows = mapping.jp.map((alias, index) => `
    <div class="alias-row">
      <input data-alias-path="${path}" data-alias-index="${index}" value="${escapeHtml(alias)}" placeholder="輸入日文原名或別名" />
      <button class="alias-remove" data-remove-alias-path="${path}" data-remove-alias-index="${index}" type="button" title="移除這個別名">−</button>
    </div>`).join("");
  return `<div class="alias-list">${rows}</div><button class="button button-small button-ghost" data-add-alias="${path}" type="button">＋ 增加日文別名</button>`;
}

function mappingEditor(mapping, path, title, options = {}) {
  return `
    <section class="form-section member-section${mapping.disabled ? " is-archived" : ""}">
      <div class="form-section-header"><h3>${escapeHtml(title)}</h3>${options.archivable ? `<button class="button button-small ${mapping.disabled ? "restore-button" : "archive-button"}" data-toggle-mapping="${path}" type="button">${mapping.disabled ? "恢復成員" : "封存成員"}</button>` : ""}</div>
      <div class="form-grid">
        <div class="field field-full"><label>日文原名與別名</label>${aliasEditor(mapping, path)}<small>如果語音辨識可能出現不同寫法，可以逐一增加。</small></div>
        <div class="field"><label>固定繁中譯名</label><input data-field-path="${path}.zh" value="${escapeHtml(mapping.zh)}" placeholder="例如：Evers" /></div>
        <div class="field"><label>備註（選填）</label><input data-field-path="${path}.note" value="${escapeHtml(mapping.note || "")}" placeholder="例如：M-1 2025 決賽組合" /></div>
      </div>
    </section>`;
}

function renderEditor() {
  const editor = state.editor;
  if (!editor) return;
  const body = $("#modalBody");
  if (editor.type === "other") {
    body.innerHTML = `<p class="inline-alert">適合放節目名稱、單元、品牌、角色稱呼，以及ボケ／ツッコミ等漫才術語。</p>${mappingEditor(editor.draft, "entry", "詞彙內容")}`;
  } else {
    const unit = editor.draft;
    const groupSection = unit.group
      ? mappingEditor(unit.group, "group", "組合名稱")
      : `<p class="inline-alert">這是單人藝人，所以不需要填組合名稱。</p>`;
    const memberSections = unit.members.map((member, index) => mappingEditor(member, `members.${index}`, `成員 ${index + 1}`, { archivable: true })).join("");
    body.innerHTML = `${groupSection}<div class="form-section-header" style="margin:22px 2px 10px"><h3>成員資料</h3><button id="addMember" class="button button-small button-secondary" type="button">＋ 新增成員</button></div>${memberSections}`;
    $("#addMember").addEventListener("click", () => {
      syncEditorInputs();
      unit.members.push({ jp: [""], zh: "" });
      renderEditor();
    });
  }
  bindEditorActions();
}

function getMapping(path) {
  if (path === "entry") return state.editor.draft;
  if (path === "group") return state.editor.draft.group;
  const index = Number(path.split(".")[1]);
  return state.editor.draft.members[index];
}

function syncEditorInputs() {
  if (!state.editor) return;
  $$('[data-field-path]').forEach((input) => {
    const [path, field] = input.dataset.fieldPath.split(/\.(?=[^.]+$)/);
    const mapping = getMapping(path);
    if (input.value.trim()) mapping[field] = input.value;
    else delete mapping[field];
  });
  $$('[data-alias-path]').forEach((input) => {
    const mapping = getMapping(input.dataset.aliasPath);
    mapping.jp[Number(input.dataset.aliasIndex)] = input.value;
  });
}

function bindEditorActions() {
  $$('[data-add-alias]').forEach((button) => button.addEventListener("click", () => {
    syncEditorInputs();
    getMapping(button.dataset.addAlias).jp.push("");
    renderEditor();
  }));
  $$('[data-remove-alias-path]').forEach((button) => button.addEventListener("click", () => {
    syncEditorInputs();
    const mapping = getMapping(button.dataset.removeAliasPath);
    if (mapping.jp.length === 1) return showToast("至少要保留一個日文名稱。", true);
    mapping.jp.splice(Number(button.dataset.removeAliasIndex), 1);
    renderEditor();
  }));
  $$('[data-toggle-mapping]').forEach((button) => button.addEventListener("click", () => {
    syncEditorInputs();
    const mapping = getMapping(button.dataset.toggleMapping);
    mapping.disabled = !mapping.disabled;
    if (!mapping.disabled) delete mapping.disabled;
    renderEditor();
  }));
}

function openTalentEditor(index, draft = null) {
  const isNew = index === null;
  state.editor = { type: "talent", index, isNew, draft: draft || clone(state.data.talents[index]) };
  $("#modalEyebrow").textContent = isNew ? "新增藝人" : "編輯藝人";
  $("#modalTitle").textContent = state.editor.draft.group ? "漫才組合與成員" : "單人藝人";
  $("#modalBackdrop").hidden = false;
  renderEditor();
}

function openOtherEditor(index, draft = null) {
  const isNew = index === null;
  state.editor = { type: "other", index, isNew, draft: draft || clone(state.data.others[index]) };
  $("#modalEyebrow").textContent = isNew ? "新增詞彙" : "編輯詞彙";
  $("#modalTitle").textContent = "節目、品牌或漫才術語";
  $("#modalBackdrop").hidden = false;
  renderEditor();
}

function closeEditor() {
  state.editor = null;
  $("#modalBackdrop").hidden = true;
  $("#modalBody").innerHTML = "";
}

function validateMapping(mapping, label) {
  mapping.jp = mapping.jp.map((alias) => alias.trim()).filter(Boolean);
  mapping.jp = [...new Set(mapping.jp)];
  mapping.zh = (mapping.zh || "").trim();
  if (!mapping.jp.length) throw new Error(`${label}至少需要一個日文名稱`);
  if (!mapping.zh) throw new Error(`${label}需要填入固定繁中譯名`);
  if (mapping.note) mapping.note = mapping.note.trim();
}

function applyEditor() {
  try {
    syncEditorInputs();
    const editor = state.editor;
    if (editor.type === "other") {
      validateMapping(editor.draft, "這筆詞彙");
      if (editor.isNew) state.data.others.unshift(editor.draft);
      else state.data.others[editor.index] = editor.draft;
    } else {
      if (editor.draft.group) validateMapping(editor.draft.group, "組合名稱");
      if (!editor.draft.members.length) throw new Error("至少需要一位成員");
      editor.draft.members.forEach((member, index) => validateMapping(member, `成員 ${index + 1}`));
      if (editor.isNew) state.data.talents.unshift(editor.draft);
      else state.data.talents[editor.index] = editor.draft;
    }
    setDirty();
    closeEditor();
    render();
    showToast("已套用到畫面，記得按右上角儲存。", false);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadGlossary() {
  try {
    const result = await glossaryStorage.load();
    if (!result.ok) throw new Error(result.message);
    state.data = result.data;
    setDirty(false);
    render();
  } catch (error) {
    showToast(`讀取失敗：${error.message}`, true);
    $("#resultSummary").textContent = "無法讀取詞庫";
  }
}

async function saveGlossary() {
  const button = $("#saveButton");
  button.disabled = true;
  button.textContent = "儲存中…";
  try {
    const result = await glossaryStorage.save(state.data);
    state.data = result.data;
    setDirty(false);
    render();
    showToast("儲存成功！下一支翻譯會直接使用。", false);
  } catch (error) {
    setDirty(true);
    if (error.status === 409 && glossaryStorage.refreshVersion) {
      try {
        await glossaryStorage.refreshVersion();
        showToast("版本已更新。你的修改仍保留在畫面上；確認沒有其他人的修改後，請再按一次儲存。", true);
      } catch {
        showToast(error.message, true);
      }
    } else {
      showToast(error.message, true);
    }
  } finally {
    button.textContent = "儲存所有變更";
    button.disabled = !state.dirty || !glossaryStorage.canSave();
  }
}

async function testMatch() {
  const text = $("#matchText").value.trim();
  if (!text) return showToast("請先貼上一小段日文。", true);
  if (state.dirty) return showToast("請先儲存右上角的變更，再進行實際比對。", true);
  const button = $("#matchButton");
  button.disabled = true;
  button.textContent = "比對中…";
  try {
    const response = await fetch("/api/glossary/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message);
    const tags = [];
    result.matches.talents.forEach((unit) => {
      if (unit.group) tags.push(`<span class="match-tag">${escapeHtml(unit.group.jp.join("／"))}<b>→ ${escapeHtml(unit.group.zh)}</b></span>`);
      unit.members.forEach((member) => tags.push(`<span class="match-tag">${escapeHtml(member.jp.join("／"))}<b>→ ${escapeHtml(member.zh)}</b></span>`));
    });
    result.matches.others.forEach((entry) => tags.push(`<span class="match-tag">${escapeHtml(entry.jp.join("／"))}<b>→ ${escapeHtml(entry.zh)}</b></span>`));
    const panel = $("#matchResults");
    panel.innerHTML = tags.length ? `<h4>實際會帶入翻譯的詞：</h4>${tags.join("")}` : "<h4>這段文字沒有比對到固定詞彙。</h4>";
    panel.hidden = false;
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "開始比對";
  }
}

$$('[data-filter]').forEach((button) => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  $$('[data-filter]').forEach((item) => item.classList.toggle("is-active", item === button));
  render();
}));

$("#searchInput").addEventListener("input", (event) => {
  state.search = event.target.value.trim().toLocaleLowerCase("zh-Hant");
  render();
});

$$('[data-add]').forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.add === "group") openTalentEditor(null, { group: { jp: [""], zh: "" }, members: [{ jp: [""], zh: "" }] });
  if (button.dataset.add === "solo") openTalentEditor(null, { group: null, members: [{ jp: [""], zh: "" }] });
  if (button.dataset.add === "term") openOtherEditor(null, { jp: [""], zh: "" });
}));

$("#saveButton").addEventListener("click", saveGlossary);
$("#matchButton").addEventListener("click", testMatch);
$("#closeModal").addEventListener("click", closeEditor);
$("#cancelModal").addEventListener("click", closeEditor);
$("#applyModal").addEventListener("click", applyEditor);
$("#modalBackdrop").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeEditor(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.editor) closeEditor(); });
window.addEventListener("beforeunload", (event) => { if (state.dirty) event.preventDefault(); });

loadGlossary();
