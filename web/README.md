# JPComedy 整合網站（web/）

這是 JPComedy 網站的**正式維護位置**：首頁「日式搞笑大補帖」與「漫才詞庫」子頁面同屬一個原生 JS 單頁應用，共用頁首／導覽／頁尾與版型，站內完成瀏覽、解鎖、編輯與儲存，不外跳舊詞庫、不使用 iframe。

- 原始示範 `../../jpcomedy-site/` 保留不動，作為歷史對照；後續開發集中在本目錄。
- Git repository：`owarai-grillmaster`（fork 遠端為 `allen365apple/JPComedy`）。Pages 整合版網址為 `https://allen365apple.github.io/JPComedy/`，部署由主分支的 Pages workflow 管理。

## 本機開發與預覽

```sh
npm ci                # 安裝鎖定版本的圖片最佳化建置工具
npm run build          # 由來源產生 public/data.json、public/assets、glossary-snapshot.json
npm run build:public   # 由 content/public-data.json 組裝 source-attributed 公開產物
npm run verify:public  # 檢查公開產物的來源、檔案與敏感資訊
npm start              # http://127.0.0.1:4173/ （根路徑預覽）
npm run preview:basepath   # http://127.0.0.1:4190/JPComedy/ （模擬 Pages 子路徑）
npm test              # 22 項 Node 單元測試（含完整資料拆分、快取版本與 409 衝突）
PLAYWRIGHT_MODULE=<playwright/index.mjs> JPCOMEDY_URL=http://127.0.0.1:4173/ node tests/browser.mjs
```

`npm run build` 需要來源工作區（含 `manzaiweek-archive/` 與 `jpcomedy-glossary/`）。腳本會**自動往上層尋找**，或用 `JPCOMEDY_WORKSPACE=/path/to/JPcomedy` 明確指定；**不寫死任何絕對路徑**。詞庫比對同時檢查 `../services/fixed_glossary/fixed_glossary.json`（repo 內）與 `jpcomedy-glossary/glossary.json`。

## 檔案角色

- 可發布的靜態程式與公開內容（會進 repo）：`public/{index.html,app.js,catalog.mjs,glossary-core.mjs,glossary.mjs,site-config.js,styles.css,favicon.svg}`、`public/assets/`、`server.mjs`、`scripts/`、`content/public-data.json`、`tests/`。
- 本機來源建置產物（`.gitignore`，只供從 archive 重新產生公開資料）：`public/data.json`、`public/glossary-snapshot.json`、`glossary-crosswalk.json`、`qa/`。
- `content/public-data.json` 是公開 CI 的固定輸入；沒有本機 archive 時，`npm run build:public` 會直接沿用它，不依賴開發者電腦的絕對路徑。

## 漫才詞庫資料模式（明確設定，不靠 hostname 猜測）

於 `public/site-config.js` 的 `window.JPCOMEDY_SITE.glossaryMode` 設定：

- `fixture`（預設）：讀取隨站附帶、附版本日期的唯讀快照 `glossary-snapshot.json`；可完整瀏覽全部藝人、成員、節目與術語，並在站內解鎖後試編輯與儲存（只寫入記憶體測試資料）。API 失敗時其他模式也會退回此快照並標示狀態。
- `local`：同源 Python API（`../glossary_ui/server.py` 的 `/api/glossary`），解鎖即可寫入本機正式翻譯詞庫。
- `cloud`：既有 Worker（`cloud-config` 的 apiBase）＋共用密碼換短期 session，PUT 附 SHA。**沿用既有協定，未新建主詞庫或認證。**

### 儲存與衝突（重要）

沿用 SHA 樂觀鎖。遇到 HTTP 409 時**不會**只刷新 SHA 再重送覆蓋他人變更：系統保留你的草稿與原始基準，取回遠端版本後提供「先匯出草稿」與「改用最新版本（放棄我的變更）」，未處理前禁止直接重試覆寫。session 只存在記憶體，過期保留草稿並要求重新解鎖。站內切到藝人頁再回來，草稿、搜尋與分類都保留。

## 與藝人介紹的對照

`glossary-core.mjs` 以穩定藝人 ID 對應詞條（含改名／藝名／單人）；已建介紹頁顯示「查看介紹」雙向連結，未建介紹頁的詞條仍可瀏覽與編輯，但不生成不存在的介紹連結。介紹、作品與風格標籤仍屬網站編輯資料（`content/profiles.json`），不寫進翻譯詞庫 schema。

## 發布

### 載入效能

公開建置保留完整 `data.json` 供驗證，但首頁只讀取 `catalog.json` 搜尋目錄；每位藝人的完整文章另存為具內容雜湊的 `profiles/*.json`，點進頁面才載入，同一分頁重訪會重用已成功的請求。詞庫模組也只在進入詞庫時載入。

圖片由 Sharp 產生不裁切、不放大的 WebP 衍生檔，卡片 480px、主要照片 960px、文章附圖 1100px；來源原檔不修改、不刪除。首頁預載搜尋目錄與主圖，非首屏卡片採延遲載入。資料、程式與圖片版本變更會改變資源版本，兼顧快取與更新。

正式 Pages workflow 為 `.github/workflows/pages.yml`，主分支的網站更新會建置並驗證 `public-release` 後部署。只發布白名單產物，不上傳本機 archive、私人設定或工作區。舊 `tutorial.html` 轉向整合詞庫頁。正式詞庫使用既有 Worker 與密碼，不因網站部署覆寫詞庫。

2026-10-03 查核：網站與備用快照為 265 位，正式雲端詞庫為 205 位。網站建頁完成不代表正式詞庫已同步；後續需另行核對並經授權更新。
