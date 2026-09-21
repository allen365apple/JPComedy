"use strict";

// localhost keeps using the existing Python server. GitHub Pages uses cloud storage.
const cloudMode = !["localhost", "127.0.0.1", "::1"].includes(location.hostname);
const cloudConfig = window.JPCOMEDY_CLOUD;
let cloudSession = null;
let cloudSha = null;
let loginPopup = null;

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(response.status === 409
      ? "有人已更新詞庫。你的修改仍在畫面上；請先匯出草稿，再重新載入、比對後儲存。"
      : result.message || `連線失敗 (${response.status})`);
  }
  return result;
}

window.glossaryStorage = {
  cloud: cloudMode,
  canSave: () => !cloudMode || Boolean(cloudSession),
  async load() {
    if (!cloudMode) return jsonRequest("/api/glossary");
    if (cloudConfig.apiBase) {
      const result = await jsonRequest(`${cloudConfig.apiBase}/api/glossary`);
      cloudSha = result.sha;
      return result;
    }
    const data = await jsonRequest(`https://raw.githubusercontent.com/${cloudConfig.repository}/${cloudConfig.branch}/glossary.json`);
    return { ok: true, data };
  },
  async save(data) {
    if (!cloudMode) return jsonRequest("/api/glossary/save", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    if (!cloudSession) throw new Error("請先登入有編輯權限的 GitHub 帳號。");
    const result = await jsonRequest(`${cloudConfig.apiBase}/api/glossary`, {
      method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cloudSession}` },
      body: JSON.stringify({ data, sha: cloudSha }),
    });
    cloudSha = result.sha;
    return result;
  },
};

document.addEventListener("DOMContentLoaded", () => {
  if (!cloudMode) return;
  const panel = document.querySelector("#cloudPanel");
  panel.hidden = false;
  document.querySelector(".matcher-panel").hidden = true;
  document.querySelector("#cloudNotice").textContent = cloudConfig.apiBase
    ? "共用詞庫：登入已授權的 GitHub 帳號後可直接儲存。儲存成功後，新翻譯會採用更新。"
    : "目前開放瀏覽與編輯草稿；GitHub 登入儲存尚未啟用。可先匯出草稿，交給柏文整合，或提出詞庫建議。";
  document.querySelector("#suggestLink").href = `https://github.com/${cloudConfig.repository}/issues/new`;
  const login = document.querySelector("#loginButton");
  login.disabled = !cloudConfig.apiBase;
  login.onclick = () => {
    if (cloudSession) {
      cloudSession = null;
      login.textContent = "使用 GitHub 登入";
      document.querySelector("#saveButton").disabled = true;
      return;
    }
    loginPopup = window.open(`${cloudConfig.apiBase}/auth/login`, "jpcomedy-login", "width=640,height=750");
  };
  window.addEventListener("message", (event) => {
    if (!cloudConfig.apiBase || event.origin !== new URL(cloudConfig.apiBase).origin
        || event.source !== loginPopup || event.data?.type !== "jpcomedy-login") return;
    cloudSession = event.data.token;
    login.textContent = `${event.data.login} · 登出`;
    document.querySelector("#cloudNotice").textContent = "已登入，現在可以儲存詞庫。重新整理或關閉頁面後需再登入。";
    document.querySelector("#saveButton").disabled = !state.dirty;
  });
  document.querySelector("#exportDraft").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "漫才詞庫草稿.json"; link.click();
    URL.revokeObjectURL(url);
  };
});
