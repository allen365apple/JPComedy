"use strict";

// The public page talks to the Worker only; no API key or editor password is stored here.
const cloudMode = !["localhost", "127.0.0.1", "::1"].includes(location.hostname);
const cloudConfig = window.JPCOMEDY_CLOUD;
let cloudSession = null;
let cloudSha = null;

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
    if (!cloudSession) throw new Error("請先輸入共用編輯密碼。");
    const result = await jsonRequest(`${cloudConfig.apiBase}/api/glossary`, {
      method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cloudSession}` },
      body: JSON.stringify({ data, sha: cloudSha }),
    });
    cloudSha = result.sha;
    return result;
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!cloudMode) return;
  const panel = document.querySelector("#cloudPanel");
  panel.hidden = false;
  document.querySelector(".matcher-panel").hidden = true;
  document.querySelector("#suggestLink").href = `https://github.com/${cloudConfig.repository}/issues/new`;
  const notice = document.querySelector("#cloudNotice");
  const login = document.querySelector("#loginButton");
  const password = document.querySelector("#editorPassword");

  document.querySelector("#exportDraft").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "漫才詞庫草稿.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!cloudConfig.apiBase) {
    notice.textContent = "目前只能編輯草稿；管理員尚未設定雲端儲存。請先匯出草稿。";
    login.disabled = true;
    password.disabled = true;
    return;
  }

  try {
    const health = await jsonRequest(`${cloudConfig.apiBase}/health`);
    if (!health.editorConfigured) {
      notice.textContent = "詞庫目前可瀏覽；管理員尚未完成編輯設定。你可以先編輯並匯出草稿。";
      login.disabled = true;
      password.disabled = true;
      return;
    }
  } catch (error) {
    notice.textContent = `編輯服務目前無法連線：${error.message}`;
    login.disabled = true;
    password.disabled = true;
    return;
  }

  notice.textContent = "輸入柏文提供的共用密碼，就可以編輯並儲存詞庫。密碼不會顯示或保存。";
  login.onclick = async () => {
    if (cloudSession) {
      cloudSession = null;
      login.textContent = "解鎖編輯功能";
      notice.textContent = "已登出編輯模式；你仍然可以瀏覽與匯出草稿。";
      document.querySelector("#saveButton").disabled = true;
      return;
    }
    if (!password.value) {
      notice.textContent = "請先輸入共用編輯密碼。";
      return;
    }
    login.disabled = true;
    try {
      const result = await jsonRequest(`${cloudConfig.apiBase}/auth/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.value }),
      });
      cloudSession = result.token;
      password.value = "";
      login.textContent = "登出編輯模式";
      notice.textContent = "已解鎖，可以編輯；按右上角按鈕才會真正更新共用詞庫。";
      document.querySelector("#saveButton").disabled = !state.dirty;
    } catch (error) {
      notice.textContent = error.message;
    } finally {
      login.disabled = false;
    }
  };
});
