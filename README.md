# JPComedy｜一起看更多日本搞笑

我是「看我笑話工作室」的柏文。

看到 [elishahung 的 Owarai GrillMaster](https://github.com/elishahung/owarai-grillmaster) 之後，我覺得這個工具很棒，就在原作者的基礎上，加了一些自己翻譯時需要的功能，也整理成台灣搞笑夥伴可以一起使用的版本。

以前我們想看日本搞笑，常常得靠字幕組和翻譯大大分享的資源。謝謝這些前輩，讓我們接觸到那麼多作品。現在有了 AI，希望大家也能動手翻譯更多日本綜藝、漫才和搞笑影片，看到不同的表演、學到更多東西，讓台灣的漫才圈、日式搞笑圈慢慢長大。

這個工具會把日文影片轉成**繁體中文字幕**，也可以把字幕直接燒進影片裡。AI 還是會聽錯人名、搞錯梗，需要大家幫忙看；我們也有一份共用詞庫，讓修正可以累積下來。

> 這是原作的 fork，保留與原作者的連結。翻譯在你自己的電腦上執行；詞庫網頁不會替你上傳或翻譯影片。

## 我想做什麼？

| 你想做的事 | 從這裡開始 |
| --- | --- |
| 自己翻譯一支影片 | 往下看「第一次使用」 |
| 幫忙補藝人名稱、修譯名 | [打開漫才詞庫](https://allen365apple.github.io/owarai-grillmaster/) |
| 發現翻譯錯字，想提供建議 | [提出詞庫建議](https://github.com/allen365apple/jpcomedy-glossary/issues/new) |
| 已裝好，想開始翻譯 | Mac 雙擊 `開始翻譯.command` |
| 想調整字幕字體和版面 | 看「我的字幕樣式」 |

## 第一次使用：先花一點時間設定，以後貼網址就好

目前以 **Mac** 為主要入門路線。你不需要會寫程式，但第一次需要安裝幾個工具、登入自己的帳號。

### 1. 準備帳號與工具

- **ElevenLabs 帳號與 API Key**：負責聽日文、產生時間軸。API Key 可以理解成給程式使用的帳號鑰匙，不要傳給別人。
- **可使用 Codex 的帳號**：負責翻譯。依你的方案有使用額度，不代表無限免費。
- **Homebrew**：Mac 的安裝工具。如果還沒裝，先照 [Homebrew 官網](https://brew.sh/) 完成。

打開 Mac「終端機」，逐段貼上以下指令：

```bash
brew install git uv node ffmpeg-full
npm install -g @openai/codex
codex login
```

`codex login` 會引導登入。第一次進入 Codex，可確認帳號有哪些模型能用；後面設定時填入你有權限使用的模型名稱。[Codex 官方安裝說明](https://developers.openai.com/codex/cli/)

**費用先說清楚：**語音辨識會使用你 ElevenLabs 的額度或產生費用，翻譯則使用你的 Codex 額度。請先看 [ElevenLabs 當前 API 費率](https://elevenlabs.io/pricing/api)，也可以先用短片試跑。本工具不是全程免費服務，處理時間也會隨片長與方案不同。

### 2. 下載並設定 JPComedy（只做一次）

```bash
git clone https://github.com/allen365apple/owarai-grillmaster.git
cd owarai-grillmaster
uv sync
.venv/bin/python jpcomedy.py --setup
```

設定程式會請你貼上 ElevenLabs API Key、選擇 Codex 模型。輸入金鑰時不會顯示在畫面上，這是正常的。金鑰只保存在自己電腦的 `.env`，不要把這個檔案分享出去。

確認環境：

```bash
export PATH="$(brew --prefix ffmpeg-full)/bin:$PATH"
.venv/bin/python jpcomedy.py --check
```

若看到找不到工具／尚未登入，照畫面提示處理即可。字幕還需要繁中文字型；預設使用 **Noto Sans CJK TC**，可由 [Noto CJK 官方專案](https://github.com/notofonts/noto-cjk) 下載並安裝，或在設定檔改成已安裝的繁中文字型。

### 3. 開始翻譯

Mac 雙擊資料夾裡的 **`開始翻譯.command`**，依序：

1. 貼上影片網址，或已下載影片的完整路徑。
2. 補充節目、人物名稱等提示；不知道可以直接按 Enter。
3. 看完費用提醒，輸入 `YES` 開始。
4. 等字幕完成，再選要不要把黑底中文字幕燒進影片。

也可以直接執行：

```bash
.venv/bin/python jpcomedy.py
```

YouTube、Bilibili、AcFun 等網址是否能下載，仍取決於來源網站、影片權限和 yt-dlp 的支援情況。失敗時可以改用你有權取得的本機影片。

**完成的檔案在哪裡？**程式最後會顯示完整路徑，也能在 `projects/影片ID/` 找到：

| 檔案 | 怎麼用 |
| --- | --- |
| `video.mp4` | 原始影片 |
| `video.cht.finalized.srt` | 完成的繁中字幕，可拖進 VLC 等播放器 |
| `video.cht.ass` | 帶樣式的字幕，搭配支援 ASS 的播放器 |
| `.burnin/本次輸出編號/video.cht.blackbox.mp4` | 選擇燒錄後產生的影片，字幕直接在畫面上 |
| `.glossary/snapshot.json` | 這部影片採用的詞庫版本紀錄 |

中途失敗時，重新輸入相同影片網址即可續跑。已完成階段會沿用，但未完成的付費請求仍可能重試並計費。

> Windows／Linux 可以使用 Python 3.13+、uv、FFmpeg 和 Codex CLI 執行同樣的 Python 指令；雙擊 `.command` 的捷徑只適用於 Mac。Windows 的 Python 位於 `.venv\Scripts\python.exe`。

## 一起維護漫才詞庫

你不需要安裝翻譯工具，也可以參與。

[**打開漫才詞庫網頁**](https://allen365apple.github.io/owarai-grillmaster/)

詞庫用來統一「日文名字 → 繁中譯名」，包含漫才組合、成員、節目名稱和術語。它能提供固定譯名參考，但不保證 AI 每一句都會正確套用。

### 現在就能做

1. 搜尋日文或中文名稱，確認是不是已經有人加過。
2. 按「編輯」或「新增」，填入日文原名、繁中譯名，必要時補充備註。
3. 如果頁面提示「登入儲存尚未啟用」，先按「匯出草稿」，把 JSON 檔交給柏文整合；也可以按「提出詞庫建議」。

**網站目前開放瀏覽和編輯草稿。**指定帳號直接登入、儲存的程式已備妥，尚待管理員完成 GitHub App 與雲端後端設定；頁面會顯示實際啟用狀態。草稿在按下成功儲存前，不會改動共用詞庫，關閉前請先匯出。

### 登入儲存啟用後

用 GitHub 帳號登入；已被加入編輯名單的夥伴按「儲存所有變更」就能更新共用詞庫。一般訪客仍可瀏覽與提出建議。若兩個人同時修改，系統會擋下舊版本的儲存，請先保留草稿，再重新載入比對。

每次儲存都有修改紀錄，管理員能復原誤改。不確定的譯名請附來源或先提出建議；暫時不用的詞可以「封存」，不必永久刪掉。

### 詞庫更新後，影片會怎樣？

完成上述初次設定的新翻譯，會先檢查共用詞庫，下載有效的新版本。斷網時沿用快取或本機詞庫，畫面會說明。

一部影片會固定使用同一份詞庫：**新詞庫影響下一部新翻譯，不會自動重翻已完成的影片。**已有翻譯進度卻沒有版本紀錄的舊影片，只能固定目前本機版本，無法回溯當時使用的詞庫。

你也能雙擊 `開啟漫才詞庫管理.command` 維護本機詞庫。注意：**本機儲存不會同步到共用詞庫**；若想翻譯時只用自己改的版本，把 `.env` 中的 `GLOSSARY_REMOTE_REPO=` 留空。

## 我的字幕樣式

這個 fork 保存了柏文使用的字幕偏好，放在 [preferences.json](preferences.json)：

- 白字、實心黑底、不加粗。
- 一般字幕放下面；提供日文字卡出現時段時，這些時段的字幕上移。
- 字級 117，以 1920×1080 的字幕座標為基準，依影片大小縮放。
- Podcast 影片用黑底，左側 1/3 放封面，右側 2/3 放字幕。

**避讓日文字卡目前需要提供時段資料，並不是所有影片都會自動偵測。**不同節目的字卡高度不一樣，建議先看截圖，調整位置後再渲染整部影片。

可在 `preferences.local.json` 填入想覆寫的部分；這個檔案不會提交到 GitHub。例如：

```json
{"subtitle": {"font_size": 100, "above_margin_v": 300}}
```

已有字幕、只想燒進影片：

```bash
.venv/bin/python -m services.subtitle_burnin "projects/影片ID"
```

先預覽第 30 秒：

```bash
.venv/bin/python -m services.subtitle_burnin "projects/影片ID" --preview 30
```

避讓時段範例 `caption-ranges.json`：`[[12.5, 18.0], [35.0, 42.0]]`（秒）。加上 `--ranges caption-ranges.json` 後，字幕與這些時段有任何重疊就上移；超長文字會換行，仍建議檢查有沒有遮住畫面重要內容。

Podcast 版型適用於已完成翻譯、具備音檔及封面的專案：

```bash
.venv/bin/python -m services.podcast_video --project-dir "projects/影片ID" --title-zh "這集的中文名稱"
```

這個指令只負責排版、燒字幕，不會自動取得所有平台（例如 Spotify）的音檔。

## 想看更詳細的操作？

- [進階翻譯與字幕操作](doc/使用指南.md)
- [共用詞庫與登入部署說明（管理員用）](doc/共享詞庫部署.md)
- [原本的漫才翻譯工作流與實作筆記](doc/漫才翻譯工作流與實作筆記.md)
- 原作：[elishahung/owarai-grillmaster](https://github.com/elishahung/owarai-grillmaster)

感謝原作者的開發，也謝謝長期分享翻譯資源的字幕組與前輩。希望這份工具能讓更多台灣搞笑夥伴，一起看懂、討論、學習更多日本搞笑作品。

翻譯結果仍需要人工確認；分享影片或字幕前，請尊重原作者、演出者與影片平台的權利。
