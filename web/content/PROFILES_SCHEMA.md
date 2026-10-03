# 藝人資料庫格式說明

主要藝人資料在 `content/profiles.json`；最後補齊來源名單的 44 筆附加資料在 `content/profiles-backfill.mjs`。`content/profiles.mjs` 會合併兩邊資料並保留既有建置介面。
新增或修改一般藝人資料請編輯 `profiles.json`；處理這批附加名單或其照片校正時，編輯 `profiles-backfill.mjs`，再執行建置與測試。

建置流程：`profiles.json` ＋ `profiles-backfill.mjs` ＋ 詞庫 ＋ `manzaiweek-archive/` → `public/data.json` → 網頁讀取。
圖片會依 `postSeq` 從《每週漫才》存檔自動對應、複製，不需手動管理。

## 頂層結構

```jsonc
{
  "checkedAt": "2026-09-22",                       // 基本資料查核日期
  "resultsSource": "https://www.m-1gp.com/history/", // M-1 歷年成績網址（多處引用）
  "aliasSource": "https://www.maseki.co.jp/.../....pdf", // 藝名對照 PDF
  "videoResources": { "<id>": { "kind": "...", "title": "...", "detail": "..." } },
  "coverOrder":     { "<id>": ["左邊成員jp", "右邊成員jp"] },
  "officialCovers": { "<id>": { "src": "...", "credit": "...", "url": "...", "imageUrl": "..." } },
  "profiles":  [ /* 每位藝人一筆，見下 */ ],
  "profilesSupplement": [ /* 批次新增的藝人資料；建置時與 profiles 合併 */ ],
  "resources": [ /* 搞笑資源；可擴充節目與賽事 */ ]
}
```

## 每位藝人（profiles 陣列的一筆）— 建議格式

以下是新增藝人時要複製的欄位（沿用第二批的格式）：

```jsonc
{
  "id": "kinzoku-bat",              // 網址與交叉參照用；小寫、以連字號分隔、唯一
  "jp": "金属バット",                // 日文組合名，必須與詞庫 group.jp 完全一致
  "archiveNames": ["インディアンス"], // 選填：舊名，供文章標題比對（如已改名）
  "postSeq": 16,                    // 對應 manzaiweek-archive/posts_all.json 的 seq
  "formed": "2007-04-01",           // 結成年或年月日（字串）
  "agency": "吉本興業",              // 所屬事務所
  "reading": "きんぞくばっと",         // 組合讀音
  "format": "談話型漫才",            // 原始／編輯描述，可保留較細的形式
  "styleGroup": "漫談式漫才",        // 主要形式：漫談式漫才／短劇式漫才／音樂／節奏式漫才／單人表演
  "tags": ["鬆弛荒謬", "生活觀察", "奇怪邏輯"], // 風格標籤 2–4 個（本站編輯分類）
  "headline": "一句話介紹。",
  "intro": "100–180 字繁中介紹，只描述形式與特色，不教觀眾怎麼看。",
  "researchedArticle": {              // 選填：依 ARTIST_ENRICHMENT_WORKFLOW.md 搜尋與撰寫詳細介紹
    "title": "以段子特色為題的短標題",
    "positioning": "以可查證的職涯、賽事、節目或組織角色，交代藝人在日本搞笑界的位置；會直接接在詳細介紹正文開頭，不另設區塊。",
    "positioningSources": [{ "label": "日文官方／專訪來源", "url": "https://…" }],
    "text": "繁體中文詳細介紹，具體說明表演形式、笑點推進、專訪說法及代表節目／作品；忠實轉述、不逐字翻譯。",
    "sources": [{ "label": "日文專訪／分析來源", "url": "https://…" }]
  },
  "type": "duo",                 // duo／trio／ensemble／solo；團體請明確標記
  "memberDetails": [
    {
      "jp": "小林圭輔",              // 必須與詞庫 member.jp 完全一致
      "glossaryJp": "布川ひろき",     // 選填：藝名與詞庫記名不同時，指向詞庫記名
      "realName": "升野英知",         // 選填：本名
      "reading": "こばやしけいすけ",
      "role": "裝傻",                // 裝傻／吐槽／…（可寫「有時互換」）
      "origin": "大阪府堺市",         // 出身地（繁體）
      "photoPosition": "left"        // 多人照片可填 left／center／right 或 top-left 等方位
    }
    // 第二位成員…
  ],
  "aliases": ["金屬球棒", "Kinzoku Bat"], // 別名（搜尋用）
  "note": "選填：需要向讀者說明的註記（例如來源衝突、改名）",
  "bilibiliSearchTerms": ["金属バット 漫才", "金属バット THE SECOND", "Kinzoku Bat"],
  "achievements": [                 // 至少 1 項，最多 4 項；每項要有可複查的官方/新聞來源
    { "kind": "比賽", "year": 2026, "title": "THE SECOND〜漫才トーナメント〜", "detail": "準優勝", "url": "https://natalie.mu/owarai/news/672300" }
  ],
  "works": [                        // 選填：冠名節目、單獨公演、出版、Podcast 等
    { "kind": "節目", "title": "…", "detail": "…", "url": "https://…" }
  ],
  "sources": [                      // 資料來源，至少 1 項；url 必須是 https://
    { "label": "吉本興業官方資料", "url": "https://profile.yoshimoto.co.jp/talent/detail?id=6805", "covers": "成員、結成、出身與活動" }
  ]
}
```

### 對應設定（同一 id）

- `coverOrder["<id>"]`：`["左邊成員jp", "右邊成員jp"]`，順序要和原文「圖左／圖右」或官方照片一致。**雙人組合必填**。
- `videoResources["<id>"]`：官方影音入口的標註，例如
  `{ "kind": "官方 YouTube", "title": "頻道實際名稱", "detail": "…官方 YouTube 頻道" }`。
  **一定要實際打開網址確認**：只有組合本人頻道才寫「官方 YouTube」，節目／播放清單／單支影片要照實標。
- `officialCovers["<id>"]`：選填。改用事務所官方照片當主圖時才需要。

### 單人與多人藝人

設 `"type": "solo"` 的單人藝人不需要 `coverOrder`；用 `"videoUrl"` 指定官方頻道，`memberDetails` 只有一筆。三人組合用 `trio`，多人成員、兼具短劇／劇場表演的團體用 `ensemble`。多人照片要在 `memberDetails` 補上 `photoPosition`，讓頁面直接標示成員在畫面中的方位；解散或歷史編制另以 `status` 標記，不能把過往陣容寫成現況。

### 說明：前 10 筆的舊格式

profiles 陣列最前面 10 筆（M-1 決賽名單）另有 `m1Id`、`rank`、`score`、`repechage`、`watch`、`forYou`、`accent` 等舊欄位，`achievements` 由建置程式依 `m1Id`/`rank` 自動產生。**新增藝人請用上面的新格式，不要再加 `watch`／`forYou`。**

## 新增一位藝人的步驟

1. **詞庫**：確認 `jpcomedy-glossary/glossary.json` 有該組與成員；沒有就在該檔與
   `owarai-grillmaster/services/fixed_glossary/fixed_glossary.json` **同步新增完全一致**的詞條。
2. **原文**：在 `manzaiweek-archive/posts_all.json` 找 `seq`，確認文章標題含 `jp`、有「圖左／圖右」說明、且有 `youtube` 連結。
3. **查證與笑點研究**：用日文查官方事務所／賽事／節目來源，核對成員讀音、出身、結成年與獎項；另外找藝人專訪、創作談、段子分析或節目深度報導，記錄具體題材如何起手、誤解／偏差如何累積、包袱如何回收，以及成員如何接球或打斷。藝人作品也要逐人查自主持或固定參與的 Podcast、廣播、冠名節目、喜劇節目與個人企劃；搜尋需以日文多詞交叉進行，例如「冠番組」「レギュラー番組」「パーソナリティ」「ラジオ」「Podcast／ポッドキャスト」「配信」「音声番組」，並依不同類型補查「冠番組」「冠ラジオ」「冠番組 配信」等近義表述。優先用電視台、電台、經紀公司、製作單位或節目官方頁確認；區分固定節目、已完結節目與單次特別節目，不能把單次來賓演出寫成藝人自己的節目。優先引用日文一手訪談與可靠媒體；找到多少寫多少，不為篇幅猜測或硬湊。
4. **寫入**：在 `profiles.json` 的 `profiles` 加一筆；雙人補 `coverOrder`，三人以上補成員 `photoPosition`，並補 `videoResources`（開頻道確認名稱）。
5. **驗證**：在 `web` 執行 `npm run build`、`npm test`、公開版驗證與瀏覽器檢查。
6. **紀錄**：更新 `ARTIST_BACKLOG.md`。

## 重要規則

- 只新增／修改，不刪除任何檔案或資料夾。
- 不修改 `manzaiweek-archive` 的原文與圖片。
- 中文名用大字、日文名放下方小字；譯名一律以共用詞庫為準。
- 介紹不只寫「生活觀察」「節奏快」等概括形容；有資料支持時，盡量把段子的笑點機制說具體：前提如何建立、誤解／荒謬如何升級、吐槽或反應怎樣改變方向、節奏與停頓如何製造效果，以及兩位成員的角色互動。引用專訪、創作談或分析時，以繁中轉述並保留原始連結；來源沒有支持的內容不推測。
- 面向台灣讀者的節目名稱與漫才術語，顯示時以繁體中文譯名為主；首次出現可在後面括號保留日文原名，方便查找與核對。例如「奧黛麗的《All Night Nippon》（オードリーのオールナイトニッポン）」與「錯位漫才（ズレ漫才）」。不要在中文介紹句中直接留下未解釋的日文術語；人名、團體名、品牌名等專有名稱則依本站譯名規範處理。
- 不加「觀看演出」「查看譯名對照」等多餘按鈕；《每週漫才是這樣寫的》原文直接顯示。

## 主要形式與風格標籤的分工

`styleGroup` 是給首頁篩選用的**主要形式**，應維持少數幾個大分類；`tags` 則是補充內容特色的次要標籤，方便讀者進一步搜尋，不要把兩者混成同一層。

目前主要形式採用以下整理方式：

- `漫談式漫才`：以兩人對話、觀察與語言節奏為主，日文資料常稱「しゃべくり漫才」。
- `短劇式漫才`：先設定人物或情境，再以短劇推進，日文常見「漫才コント／コント漫才」等說法。
- `音樂／節奏式漫才`：把歌唱、節奏、韻律或固定反覆句型當作主要表演結構。
- `單人表演`：獨立藝人或不是雙人漫才組合的表演者。
- `漫才（待分類）`：資料不足時的暫時分類，之後查證再調整。

這不是宣稱日本業界唯一的官方分類；它是以日本藝術文化振興會對「しゃべくり漫才」的歷史整理，以及大阪教育大學研究中並列的「しゃべくり漫才／漫才コント／コント」為基礎，轉成適合本站瀏覽與篩選的實用分類。像「邏輯」「妄想」「生活觀察」「鬆弛荒謬」等，屬於題材或笑點特色，請放在 `tags`，不要直接當成主要形式。

參考資料：

- 日本藝術文化振興會／國立劇場：<https://www2.ntj.go.jp/dglib/contents/learn/edc20/rekishi/manzai/index3.html>
- 大阪教育大學研究：<https://www.osaka-kyoiku.ac.jp/~kokugo/nonami/2020soturon/futiwaki.pdf>
- Kotobank「漫才」：<https://kotobank.jp/word/%E6%BC%AB%E6%89%8D-137921>
