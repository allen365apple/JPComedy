# 發布前檢查清單（整合網站上線用）

本次僅完成本機整合與驗收，**尚未上線**。實際發布需使用者授權，並逐項完成下列檢查。未完成前不合併 main、不部署、不寫入正式共用詞庫。

2026-10-02：使用者授權推送網站至 GitHub 既有功能分支。公開清單同步至 265 位、公開建置與敏感資訊掃描通過，20 項測試通過；這次推送不等於部署，以下部署／認證檢查仍須另行完成。

## A. 內容授權（阻擋發布的關鍵）

- [x] 目前既有文章與圖片依使用者決定納入公開版，並保留原始文章連結與圖片出處；未來新增項目仍需加入 allowlist 並附來源。
- [x] 產生「可發布內容清單（allowlist）」，公開建置只組裝清單內項目。

## B. 建置與工作流程

- [ ] 將 `deploy/pages.candidate.yml` 複製為 `.github/workflows/pages.yml`（取代目前只發布 `glossary_ui/static` 的舊工作流程）。
- [ ] 確認 GitHub 實際預設分支與 Pages 設定；部署觸發路徑涵蓋 `web/**` 與工作流程檔。
- [ ] 公開 CI 只上傳 allowlisted 的 `web/public-release`，不以 repo 根目錄或整個 repository 當 artifact。
- [x] CI 的公開建置流程改用 repo 內的 `content/public-data.json`，不依賴本機 archive／相鄰資料夾／`/Users/...`。
- [x] `npm run build:public` 產生保留文章與圖片來源的公開產物，`npm run verify:public` 會拒絕缺來源、缺檔案、本機絕對路徑、隱藏檔案與常見憑證內容。

## C. 子路徑與相容性（/JPComedy/）

- [x] 站內資源與資料連結皆為相對路徑，`npm run preview:basepath` 於 `/JPComedy/` 下已驗證首頁、藝人頁、圖片、詞庫、JS、CSS 正常、無 console error。
- [ ] 測試直接開啟、重整、前進後退完整路徑（含 `#/glossary?group=:id`）。
- [ ] 既有 `/JPComedy/` 收藏連結導向新首頁；漫才詞庫經導覽可達。
- [ ] 保留 `glossary_ui/static/tutorial.html` 的有效內容或站內導向，避免舊教學網址 404。
- [ ] 盤點舊 `owarai-grillmaster` 名稱的公開網址並依實際設定更新，不假設自動轉址。

## D. 詞庫服務與認證

- [ ] 若採 `cloud` 模式，確認 Worker 讀寫協定、Origin 判定與 CORS 只開放實際需要的來源；CSP 的 `connect-src` 增列 Worker 與（如用）raw.githubusercontent 來源。
- [ ] 沿用既有共用密碼與 session，不為換首頁而重建認證或改密碼。
- [ ] 保留舊 Python 詞庫介面與其回歸測試（`.venv/bin/python -m unittest tests.test_fixed_glossary tests.test_glossary_ui`）。

## E. 安全與可回復

- [ ] 掃描待提交檔案與部署產物：API Key、Token、密碼、cookies、私人本機路徑、客戶／員工／內部系統資料一律不得混入。
- [ ] `site-config.js`／`cloud-config.js` 只含公開設定，秘密另以 CI secret 管理。
- [ ] 保存前一版可回復的部署；整合版若失敗，改重新部署已確認的舊版本，不刪除任何使用者檔案。

## 目前已完成（本機）

- [x] 首頁＝大補帖；首頁、藝人與詞庫同分頁、共用版型。
- [x] 詞庫含全部藝人、成員、節目與術語（278 筆），非只有已建介紹頁者。
- [x] 未建介紹頁詞條可用；已建介紹頁雙向導覽準確。
- [x] 新增、修改、封存／恢復、匯出、解鎖、儲存皆有測試；schema／別名／disabled 語意相容。
- [x] 409 衝突：第二人得到 409、草稿保留、不以換 SHA 覆蓋；有單元測試與瀏覽器驗證。
- [x] 離開詞庫再返回、瀏覽器前進後退不遺失草稿、不重複送出。
- [x] API 失敗退回唯讀快照並標示版本；其他頁面不受影響。
- [x] 320／390／768／1440px 無水平溢出；瀏覽器測試無 console error。
- [x] `web/` 可在乾淨環境建置（自動定位工作區或 `JPCOMEDY_WORKSPACE`），不依賴絕對路徑。
