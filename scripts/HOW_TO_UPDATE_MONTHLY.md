# 每月更新 HK Call Guard 騷擾號碼名單 — 操作手冊

> 這是你**唯一**真正能擴增名單的可靠流程。
> GitHub Actions 跑不通（hkjunkcall 擋它的 IP），所以每月在你 MacBook
> 上跑一次 scraper、commit、push，就靠這個。
>
> 應該花你 5–10 分鐘。

---

## 全流程一圖

```
[你的 MacBook + HK Wi-Fi]
       │
       │ 1. 跑 scraper
       ▼
[manual.csv 寫入新號碼]
       │
       │ 2. git commit + push
       ▼
[GitHub main branch]
       │
       │ 3. 手動觸發 workflow
       ▼
[blocklist.json 合併新號碼 + auto-commit]
       │
       │ 4. GitHub Pages 部署
       ▼
[todays-tasks.com/hk-blocklist-data/data/blocklist.json]
       │
       │ 5. App 按 Update Database Now
       ▼
[使用者拿到新號碼]
```

---

## 第一步：安裝依賴（**只需做一次**）

```bash
pip3 install requests beautifulsoup4
```

確認版本：

```bash
python3 -c "import requests, bs4; print(requests.__version__, bs4.__version__)"
# 應該看到類似：2.32.3 4.12.3
```

如果系統 Python3 不能用 pip，改用：

```bash
python3 -m pip install --user requests beautifulsoup4
```

---

## 第二步：執行爬蟲腳本

**必須在 HK Wi-Fi 環境下跑**（不是 VPN，是真實 HK ISP）。如果你在外
地，hkjunkcall.com 會回 HTTP 403。

```bash
cd ~/Desktop/GITHUB/hill02252024.github.io
python3 scripts/scrape_hkjunkcall_local.py
```

腳本會：
- 依序爬 `/Phone/Top`、`/Phone/Latest`、`/Phone` 三個 section
- 每個請求之間 sleep 1.3 秒
- 自動 follow `下一頁` / `rel="next"` / `?page=N` 三種分頁
- 失敗的單頁只 log warning，繼續跑
- 最後印一份完整 summary

### 想先試水溫不寫檔？

```bash
python3 scripts/scrape_hkjunkcall_local.py --dry-run
```

### 想只跑前幾頁測試？

```bash
python3 scripts/scrape_hkjunkcall_local.py --max-pages 3
```

---

## 第三步：確認輸出的 CSV 筆數

腳本結尾會印類似這樣的 summary：

```
============================================================
Total unique numbers: 4237
  telemarketing  1820
  scam           1124
  harassment      542
  fraud           381
  other           370
Pages fetched OK:  87
Pages failed:      2
  - https://hkjunkcall.com/Phone?page=42
  - https://hkjunkcall.com/Phone/Latest?page=12
Pages with 0 phones: 0
Per-section haul:
  /Phone/Top           1500
  /Phone/Latest         800
  /Phone               1937
============================================================
```

確認三件事：
1. **總筆數 > 50**（如果不是，往下看「失敗排查」）
2. **每個 category 都有合理分佈**（如果 `other` 佔 >70%，category 偵測壞了）
3. **「Pages failed」很少**（>10% 算多，往下看排查）

CSV 寫到：

```
hk-blocklist-data/sources/manual.csv
```

開來看看頭尾長相對：

```bash
head -10  hk-blocklist-data/sources/manual.csv
echo "---"
tail -5   hk-blocklist-data/sources/manual.csv
echo "---"
wc -l     hk-blocklist-data/sources/manual.csv
```

---

## 第四步：git add + commit + push

```bash
cd ~/Desktop/GITHUB/hill02252024.github.io

# 看一下變動規模
git diff --stat hk-blocklist-data/sources/manual.csv

# 大致看頭幾筆有沒有怪東西
git diff hk-blocklist-data/sources/manual.csv | head -40

# 進階：確認沒寫到其他檔案
git status

# 推上去
git add hk-blocklist-data/sources/manual.csv
git commit -m "hk-blocklist: monthly hkjunkcall scrape $(date +%Y-%m)"
git push origin main
```

---

## 第五步：手動觸發 workflow

開瀏覽器到：

```
https://github.com/hill02252024/hill02252024.github.io/actions/workflows/update_hk_blocklist.yml
```

右上角按 **「Run workflow」** → 不用改任何參數 → **「Run workflow」**。

或者用 `gh` CLI（一次性 setup `gh auth login` 後）：

```bash
gh workflow run "Update HK Blocklist"
gh run watch        # 看實時進度
```

**workflow 會：**
1. checkout 你剛 push 的 main
2. 跑 `build_hk_blocklist.py`，把 manual.csv merge 進 blocklist.json
3. 如果有變化就 auto-commit + push 回 main
4. GitHub Pages 自動 redeploy

---

## 第六步：等 5–10 分鐘，curl 確認 production 筆數

```bash
# 等個 5 分鐘讓 Pages 部署，然後：
curl -sS https://todays-tasks.com/hk-blocklist-data/data/blocklist.json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d), 'entries')"
```

應該看到比之前多。如果還是 50，等再 5 分鐘 — GitHub Pages 偶爾要 10 分鐘。

如果 30 分鐘還是 50：去看 Actions tab，可能 workflow 失敗了，往下看「workflow 失敗排查」。

---

## 第七步：在 App 確認生效

1. 打開 HK Call Guard
2. 按 **Update Database Now**
3. 等 Snackbar 跳出來

**期望看到的訊息**：

```
Added 4187 new of 4237 fetched · total 4237.
```

（具體數字依當天 scrape 結果）

如果看到 `0 new`，可能是：
- App 還沒 fetch 最新 production（拉下首頁 refresh 一次）
- 或者 GitHub Pages 還沒部署完（再等 5 分鐘）

---

## 如果爬蟲失敗怎麼辦

| 症狀 | 原因 | 解法 |
| --- | --- | --- |
| `[fatal] missing dependency: requests` | 沒 pip install | `pip3 install requests beautifulsoup4` |
| 所有頁都 `HTTP 403` | 你不在 HK IP | 連 HK 家用 Wi-Fi 再試；不要用 VPN |
| Total = 0 但沒有 403 | site 改版了 | 編輯 `scripts/scrape_hkjunkcall_local.py` 的 `SEED_PATHS`，把新 URL 加進去 |
| Total < 100 但 Pages fetched 很多 | category 偵測失效 / DOM 改版 | 看 `Per-section haul` — 如果某 section 全 0，那 section 的 URL 失效；加新 path |
| `Pages failed` 很多 | rate-limited | 調大 `DELAY_BETWEEN_REQUESTS`（檔案頂端，預設 1.3） |
| script 完全卡住超過 5 分鐘 | 單頁 hang | 按 `Ctrl-C`，調小 `--max-pages` 重跑 |

**Total = 0 的安全網**：腳本會 exit code 2 且**不寫檔**，所以你前一次的好結果不會被清掉。

---

## 如果 GitHub Action 失敗怎麼辦

去 actions tab 找紅色那次 run：

```
https://github.com/hill02252024/hill02252024.github.io/actions
```

點進去看 **「Run the blocklist builder」** 步驟的 log。常見錯誤：

| Log 訊息 | 含義 | 解法 |
| --- | --- | --- |
| `[fatal] illegal category 'XYZ' for 12345678` | 你 CSV 裡某行 category 拼錯 | 看 `manual.csv` 找這個號碼那行，改成 5 個合法 category 之一 |
| `[fatal] empty number in candidate` | 你 CSV 第一欄空了 | 找空行刪掉 |
| `[warn] candidate (N) < existing (M). Refusing to overwrite.` | 你 scrape 的筆數比之前少 | 不是 bug，是安全網。如果確定要覆蓋（例如資料整體錯了想 reset），在 workflow_dispatch 時勾 `allow_shrink=true` |
| 整個 workflow 紅但 build 步驟綠 | push 衝突 | workflow 已內建 `pull --rebase` retry，再跑一次通常會過 |
| `permission denied to github-actions[bot]` | repo 設定改了 | 去 Settings → Actions → Workflow permissions → 勾 "Read and write permissions" |

---

## 月曆提醒（建議）

把這個加到日曆，每月 1 號重複：

> **HK Call Guard 月更**
> 連 HK Wi-Fi → 跑 scraper → push → 等 workflow → App 確認

整個流程通常 10 分鐘完成。

---

## 進階：想跑 dry-run 看 scraper 會抓多少但不改檔

```bash
python3 scripts/scrape_hkjunkcall_local.py --dry-run | tail -30
```

只印 summary，**不會** overwrite `manual.csv`。

---

## 進階：想保留你手動加的號碼

`scrape_hkjunkcall_local.py` 每次跑都會**完全覆蓋** `manual.csv`。
如果你想加一些 scraper 抓不到的私人騷擾號碼，請**另開一個 CSV**：

```bash
# 建立一份「不會被 scraper 蓋掉」的個人清單
cat > hk-blocklist-data/sources/personal.csv <<'EOF'
# 我自己遇到的騷擾號碼
12345678,scam,1,前公司騷擾
87654321,telemarketing,3,健身房推銷
EOF
```

然後在 workflow 加多一個 `--manual-csv` 參數（編輯
`.github/workflows/update_hk_blocklist.yml`）：

```yaml
python3 scripts/build_hk_blocklist.py \
  --input      hk-blocklist-data/data/blocklist.json \
  --output     hk-blocklist-data/data/blocklist.json \
  --manual-csv hk-blocklist-data/sources/manual.csv \
  --manual-csv hk-blocklist-data/sources/personal.csv \
  --url-list   hk-blocklist-data/sources/urls.txt \
  ...
```

（build script 已支援多次 `--manual-csv`，merge 邏輯是 max-wins on
report_count、non-other-wins on category。）
