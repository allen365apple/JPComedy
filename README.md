# JPComedy｜把日本搞笑影片翻成繁體中文字幕

嗨，我是「看我笑話工作室」的柏文。

我看到 [elishahung 的 Owarai GrillMaster](https://github.com/elishahung/owarai-grillmaster) 後，覺得這個工具很棒，所以把它 fork 下來，再加上我自己翻譯日本綜藝、漫才和 Podcast 時需要的功能。

以前我們常常只能等字幕組或翻譯大大分享日本搞笑影片。現在有了 AI，我希望台灣的漫才圈、日式搞笑圈可以自己翻更多作品，一邊看、一邊學，也讓更多人認識日本搞笑。

這個工具可以幫你：

- 把日文影片轉成繁體中文字幕。
- 把字幕直接燒進影片，使用白字、實心黑底、正常字重的版型。
- 遇到節目下方的大型日文字幕時，把中文字幕移到上方。
- 使用共用漫才詞庫，統一藝人、組合、節目和術語的譯名。
- 重新執行時沿用已完成的步驟，減少重做和額外消耗。

如果你完全不懂程式，請直接看[新手教學頁](https://allen365apple.github.io/JPComedy/tutorial.html)。下面也把每一步寫出來。

## 先看懂：你需要準備什麼？

你要準備兩個自己的帳號：

1. **ElevenLabs**：負責聽日文，產生有時間軸的日文字幕。需要 API Key，會使用 ElevenLabs 額度。
2. **Codex**：負責把日文翻成繁體中文。需要登入 Codex CLI，會使用你帳號的額度。

這不是完全免費的線上服務。開始翻譯前，程式會再次提醒你；第一次建議先拿短片測試。

### ElevenLabs 帳號和 API Key：照這 5 步做

1. 開啟 [ElevenLabs 註冊頁](https://elevenlabs.io/app/sign-up)，註冊並登入。
2. 開啟 [ElevenLabs API Keys 頁面](https://elevenlabs.io/app/settings/api-keys)。如果找不到，請看[官方 API Key 說明](https://elevenlabs.io/docs/help-center/technical/how-do-i-authorize-myself-using-an-api-key)。
3. 按 **Create API key**，名稱可以寫 `JPComedy`。
4. API Key 顯示後，立刻按複製。很多時候它只會完整顯示一次。
5. 這串 Key 只貼到自己電腦的設定畫面，**不要貼到群組、不要放進 GitHub、不要放進公開網頁**。

ElevenLabs 官方也提醒 API Key 是秘密，若被別人拿到，對方可能使用你的帳號額度。費用與方案請看 [ElevenLabs Pricing](https://elevenlabs.io/pricing/api)。

### Codex：照這 2 步做

安裝後打開「終端機」或「Windows 終端機」，輸入：

```text
npm install -g @openai/codex
codex login
```

`codex login` 會開啟登入流程。需要更完整的說明時，請看 [Codex CLI 官方教學](https://developers.openai.com/codex/cli)。

## Mac：第一次安裝

### 1. 安裝基本工具

如果你的 Mac 還沒有 Homebrew，先到 [Homebrew 官網](https://brew.sh/) 安裝。接著打開「終端機」，逐行輸入：

```bash
brew install git uv node ffmpeg-full
npm install -g @openai/codex
codex login
```

字幕需要繁中文字型。建議安裝 [Noto Sans CJK](https://github.com/notofonts/noto-cjk)，或把設定改成電腦裡已有的繁中字型。

### 2. 下載 JPComedy

```bash
git clone https://github.com/allen365apple/JPComedy.git
cd JPComedy
uv sync
```

### 3. 第一次設定 ElevenLabs Key

```bash
.venv/bin/python jpcomedy.py --setup
```

畫面會問你 ElevenLabs API Key。貼上時不會顯示文字，這是正常的。接著選擇你有權限使用的 Codex 模型。

設定只會保存在自己電腦的 `.env`，不會提交到 GitHub。

### 4. 檢查有沒有裝好

```bash
export PATH="$(brew --prefix ffmpeg-full)/bin:$PATH"
.venv/bin/python jpcomedy.py --check
```

看到工具前面有 `✓`，就可以開始。

## Windows：第一次安裝

Windows 也可以使用。請先安裝：

- [Python](https://www.python.org/downloads/windows/)
- [Git for Windows](https://git-scm.com/download/win)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- Node.js
- FFmpeg：請從 [FFmpeg 官方下載頁](https://ffmpeg.org/download.html) 的 Windows build 連結下載，並把包含 `ffmpeg.exe`、`ffprobe.exe` 的資料夾加入 PATH。

安裝後，按右鍵在 JPComedy 資料夾開啟「終端機」，輸入：

```powershell
git clone https://github.com/allen365apple/JPComedy.git
cd JPComedy
uv sync
npm install -g @openai/codex
codex login
uv run python jpcomedy.py --setup
uv run python jpcomedy.py --check
```

之後直接雙擊：

- `開始翻譯.bat`：最簡單，推薦先用這個。
- `開始翻譯.ps1`：PowerShell 版本。

如果 Windows 擋住 PowerShell，先使用 `.bat`；不需要修改系統安全設定。

## 開始翻譯：Mac、Windows 都一樣

1. 雙擊啟動檔：Mac 用 `開始翻譯.command`，Windows 用 `開始翻譯.bat`。
2. 貼上影片網址，或貼上本機影片的完整路徑。
3. 輸入節目名稱、藝人名稱等提示；不知道可以直接按 Enter。
4. 看清楚費用提醒；確定要開始時輸入 `YES`。
5. 等字幕完成，程式會問你要不要把黑底中文字幕燒進影片。

YouTube、Bilibili、AcFun 等網站是否能下載，取決於影片權限與 `yt-dlp` 支援。如果下載失敗，可以先用你有權取得的本機影片。

## 完成後的檔案在哪裡？

每支影片會放在 `projects/影片ID/`：

| 檔案 | 用途 |
| --- | --- |
| `video.mp4` | 原始影片 |
| `video.cht.finalized.srt` | 繁體中文字幕，可拖進 VLC |
| `video.cht.ass` | 帶樣式的字幕 |
| `.burnin/.../video.cht.blackbox.mp4` | 字幕已經直接燒進去的影片 |
| `.glossary/snapshot.json` | 這部影片實際採用的詞庫版本 |

中途失敗時，重新輸入同一支影片即可續跑。已完成的階段會沿用；還沒完成的付費請求可能會重新執行，所以不要一直重試不明錯誤。

## 維護共用漫才詞庫

請開啟 [漫才詞庫網頁](https://allen365apple.github.io/JPComedy/)。

### 一般夥伴怎麼修改？

1. 搜尋日文名字，確認是不是已經有資料。
2. 按「新增」或「編輯」。
3. 填入日文原名、固定繁中譯名和備註。
4. 請向柏文取得共用編輯密碼，在網頁輸入密碼解鎖。
5. 按右上角「儲存所有變更」。

密碼不會寫進網頁或 GitHub；網頁只會暫時取得一個編輯工作階段。忘記密碼或不確定譯名時，請先按「匯出草稿」或[提出詞庫建議](https://github.com/allen365apple/jpcomedy-glossary/issues/new)。

每次成功儲存都會留下 Git 歷史。如果兩個人同時修改，系統會拒絕較舊版本，請先匯出自己的草稿、重新載入最新詞庫，再比對後儲存。

### 詞庫更新會不會影響舊影片？

- 新影片開始時會確認共用詞庫有沒有新版本。
- 這支影片會固定使用當下的詞庫版本。
- 詞庫更新只影響之後的新翻譯，不會自動改寫已完成的字幕。

## 字幕版型已經幫你保存

設定放在 [preferences.json](preferences.json)：

- 白字、實心黑底、不加粗。
- 正常字幕放在畫面下方。
- 日文大字卡出現時，指定時段的中文字幕往上移。
- 預設字幕字級 117。
- Podcast 影片左側 1/3 放封面，右側 2/3 放大字幕。

目前日文大字卡還需要提供時段資料，不是每支影片都會自動偵測。建議先產生預覽截圖，確認位置後再輸出整部影片。

## 「直接做成網頁」可不可以？

可以，但要分清楚兩種網頁：

1. **公開 HTML 網頁**：適合做詞庫、教學和操作介面，但瀏覽器不能安全地直接啟動本機 Python、`yt-dlp` 和 FFmpeg。
2. **本機網頁工具**：你在自己電腦啟動一個小型本機服務，瀏覽器只是控制面板；影片、API Key、字幕和渲染都留在本機。

目前本專案先完成安全的「公開詞庫網頁＋本機翻譯工具」。下一階段可以把 `jpcomedy.py` 的設定、下載、轉錄、翻譯、預覽和燒片流程包成「本機網頁工具」，讓使用者不用碰終端機；API Key 仍只留在自己的電腦，不放到公開 GitHub Pages。

## 需要幫忙

請先看[新手教學頁](https://allen365apple.github.io/JPComedy/tutorial.html)。如果仍然失敗，請提供：

- Mac 或 Windows
- `jpcomedy.py --check` 的結果
- 終端機最後 20 行錯誤

請不要把 ElevenLabs API Key、共用詞庫密碼或 `.env` 截圖傳出來。

## 相關連結

- [新手教學頁](https://allen365apple.github.io/JPComedy/tutorial.html)
- [共用漫才詞庫 repository](https://github.com/allen365apple/jpcomedy-glossary)
- [進階翻譯與字幕操作](doc/使用指南.md)
- [共用詞庫部署說明（管理員用）](doc/共享詞庫部署.md)
- [原作者的 Owarai GrillMaster](https://github.com/elishahung/owarai-grillmaster)

謝謝原作者，也謝謝長期分享日本搞笑翻譯資源的字幕組和前輩。希望這個工具能讓更多台灣夥伴一起看懂、討論、學習日本搞笑。

分享影片或字幕前，請尊重原作者、演出者與影片平台的權利；AI 翻譯結果也請務必人工確認。
