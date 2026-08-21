# todays-tasks.com

靜態站，GitHub Pages 部署，自訂網域 `todays-tasks.com`（見 `CNAME`）。

## 結構

```
index.html            首頁
todo.html             瀏覽器 to-do list（主應用）
tools/                23 個瀏覽器工具（計算機 + 私隱工具）
apps/                 45 個流動應用落地頁 + 42 個舊路徑重定向 stub
compare/              對比頁
zh-hk/                繁中分支（25 頁）
templates/            內部樣板，robots.txt 已 Disallow
sitemap.xml           sitemapindex → sitemap-pages.xml
sitemap-pages.xml     118 條 URL
404.html              GitHub Pages 會用佢做 404 回應
```

## 已刪除嘅 URL：唔好做 redirect

2026-06-21 commit `275426a`（"Phase 1 cleanup: remove off-theme content"）
一次過刪走咗 **249 條 URL**，主要係：

| 批次 | 數量 |
|---|---:|
| `china/posts/*.html`（中文長尾食評文章） | 117 |
| 根目錄舊 `article1–5.html` / `blog-*.html` | 10 |
| `china/index.html`、`china-explore*.html` | 3 |
| 其餘（舊 apps 路徑、`post.html` 等） | 119 |

**呢批 URL 唔准做 redirect。**佢哋係 off-theme 內容（廣州腸粉、順德菜、汕頭
食評之類），同而家個站嘅主題冇任何關係。將佢哋 redirect 去現有頁面，
等於製造大量不相關嘅重定向 —— Google 會當成 soft 404，而且會稀釋
接收頁嘅主題訊號。

**正確做法係咩都唔做。**佢哋而家回 404（已線上驗證，見下），Google 會喺
幾個爬取週期之後自然由索引移除。

### GSC 報告要點

- Search Console「**找不到（404）**」報告見到呢批 URL **係預期行為，唔使修**。
- Search Console 仍然收到「汕心」「巡味順德菜」呢類中文 query，
  **來源就係呢批已刪頁**（現存站全域 grep 呢啲詞：0 命中）。
  呢啲 query 會隨索引移除而消失。
- 另有 **47 個重定向 stub**（`apps/*.html` 等），GSC 會報
  「**網頁會重新導向**」。呢批亦係預期行為 —— 佢哋係舊路徑，
  用 `meta-refresh` + `canonical` 指向新路徑，而且冇收入 sitemap。

### 404 點驗證

GitHub Pages 會自動用根目錄嘅 `404.html` 回應唔存在嘅路徑，
並回真正嘅 HTTP 404（唔係 200 soft-404）。驗證方法：

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://todays-tasks.com/this-page-does-not-exist-xyz
curl -s -o /dev/null -w '%{http_code}\n' https://todays-tasks.com/china/posts/10.html
```

兩條都應該回 `404`。`404.html` 本身帶 `<meta name="robots" content="noindex,follow">`，
亦冇收入 sitemap。

## sitemap 收錄規則

只收**真內容頁**。以下刻意排除：

- 47 個重定向 stub（`apps/*.html` 同 4 個舊 app 目錄
  `apps/mortgage-calc/`、`apps/rental-yield-calculator/`、
  `apps/investment-calculator/`、`apps/debt-free-plan/`）
- `templates/article.html`（內部樣板，`robots.txt` 亦已 Disallow）
- `404.html`

## Title 規範（`/tools/`）

每個工具頁 `<title>` 要：

1. **以該工具實際對應嘅通用搜尋詞開頭**（"Password Generator"、
   "Mortgage Calculator"）—— 唔准塞唔相關嘅詞落去。
2. 中段放一個**由該頁自己 description 支持嘅**區別性修飾語，
   唔准用全站共用嘅填充語。
   （曾經有 10 頁共用 "— Free Online Calculator | No Login Required"，
   已改走。）
3. **以 `— Today's Tasks` 結尾**，分隔符用 em dash 唔用 `|`。

`og:title` / `twitter:title` 要同 `<title>` 一致。

## 語言同 hreflang

- 英文頁 `<html lang="en">`，繁中頁 `<html lang="zh-Hant-HK">`。
- 有中英對應嘅頁：三個 hreflang（`en` / `zh-Hant-HK` / `x-default`），
  雙向互指，兩邊都要 self-referencing。
- 中文獨有內容（`zh-hk/guides/*`）：只放 `zh-Hant-HK` + `x-default`，
  兩者都指返自己。
- **英文頁唔應該夾雜中文段落**。唯一例外係 `apps/*` 入面嘅
  應用中文名（例如「九巴通 — 長者版」「鐵路通」），
  嗰啲係產品名唔係內文。

## 待核實數字（`{{NEEDS_VERIFY}}`）

美國稅頁嘅原則：**唔確定嘅財務數字寧願留空，唔好作。** 所有已填嘅數字
都由 `data/us-state-tax.json` 生成，每個都帶住官方來源連結。

而家**淨返一項**未核實：

| 要查嘅數 | 建議官方來源 | 填落邊個檔 | 位置 |
|---|---|---|---|
| 紐約州法定居民日數門檻，同「一日」點計 | NY Dept of Taxation and Finance — Income tax definitions（domicile / statutory residency）<br>https://www.tax.ny.gov/pit/file/pit_definitions.htm<br>另見 Form IT-201 / IT-203 說明書 | `tools/us/new-york-vs-florida-salary-comparison/index.html` | `<h2>Residency is a test, not a mailing address</h2>` 講 statutory residency 嗰段 |

填完之後：

```bash
grep -rn "NEEDS_VERIFY" tools/us/          # 應該零命中
```

再刪走 `tools/us/new-york-vs-florida-salary-comparison/index.html` 底部
`<p class="muted">` 入面「A small number of figures on this page are still marked
pending verification」嗰句，改成同另外四頁一樣嘅「This page cites no unverified figure.」。

## 聯邦稅資料點嚟（2026-08-21 重建）

⚠️ **唔好由 ~/Desktop/takehome 抽聯邦層。** 嗰邊個 `FederalTax2025` 表
自稱係 Pub. 15-T 預扣稅階，但同 2024/2025/2026 任何一版官方表都對唔上
（$100k 單身 2025 出 $12,484，正確答案係 $13,449）。州稅同城市稅表就冇問題，
繼續由 takehome 抽。

`data/us-state-tax.json` 個 `federal` 區塊而家係直接由 IRS 原文重建：

| 欄位 | 來源 | 點嚟 |
|---|---|---|
| `brackets`（法定 § 1(j)(2) 稅階） | IRS Pub. 15-T 2024 / 2025 / 2026，STANDARD Withholding Rate Schedules，ANNUAL payroll period | 由官方表嘅**帶寬**由 0 累加還原。呢個方法用 Rev. Proc. 2025-32 § 3.01 印出嘅 2026 法定稅階驗證過，四個報稅身分全部逐個相同 |
| `standardDeduction` | 2025/2026: Rev. Proc. 2025-32 § 3.08 / § 3.14；2024: Rev. Proc. 2023-34 | OBBBA § 70102 追溯改咗 2025：$15,750 / $23,625 / $31,500（原本 Rev. Proc. 2024-40 公佈嘅係 $15,000 / $22,500 / $30,000） |
| `fica.socialSecurityWageBase` | IRS Pub. 15 各年 | 2024 $168,600、2025 $176,100、2026 $184,500 |
| `limits` | Notice 2024-80 / 2025-67（401(k)）、Rev. Proc. 2024-25 / 2025-19（HSA）、Rev. Proc. 2024-40 / 2025-32（FSA） | 2026 全部已正式公佈，唔再係估算 |

**模型係年度應繳稅（`model: annualFilingLiability`），唔係薪俸預扣。**
2025 年兩者有實質差距：2025 Pub. 15-T 喺 2024-12-09 出版，早過 OBBBA，
所以佢用緊舊嘅 $15,000 扣除，實際預扣會高過應繳稅，差額報稅時退返。
呢點寫咗落 `federal.2025.note` 同 100k 頁。

**引擎唔包**：物業稅、銷售稅、州傷殘保險／有薪家事假（加州 SDI、紐約 PFL 等）。
加州 SDI 資料存喺 `statePayrollTaxes.CA`（2025 1.2%、2026 1.3%、SB 951 由
2024-01-01 起取消工資上限），只用嚟寫內容，冇入計算結果。
`conflictNote` 記低咗有二手來源話 2025 係 1.1%、同 EDD 官方矛盾，未解決。

### 已經唔再標記嘅嘢

物業稅、銷售稅、homestead exemption、convenience of the employer 名單、
reciprocity 名單、非居民日數門檻、NH 利息股息稅廢除日期、WA 資本利得稅、
社會保障福利免稅州名單 —— 呢啲**唔係待核實，係已經整段刪走**。
理由：同薪俸計算引擎無關、每年每縣都變、而且係 Tax Foundation
呢類站嘅主場。五頁而家統一聚焦「稅後薪金」，每頁頂部都有一句範圍聲明。
唔好再加返去。
