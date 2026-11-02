import { calculateFire, calculateTravel } from "/fire-and-travel/assets/calculations.js";

const currencyChoices = ["HKD", "USD", "TWD"];
const money = (value, currency) => new Intl.NumberFormat("zh-HK", { style: "currency", currency: currencyChoices.includes(currency) ? currency : "HKD", maximumFractionDigits: 0 }).format(value);
const percent = (value) => `${(value * 100).toFixed(2)}%`;

const fireForm = document.querySelector("#fire-form");
if (fireForm) {
  fireForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const output = document.querySelector("#fire-result");
    const data = Object.fromEntries(new FormData(fireForm));
    try {
      const result = calculateFire(data);
      const currency = data.currency;
      output.innerHTML = `<strong>試算目標：${money(result.target, currency)}</strong><div class="result-list"><div class="result-row"><span>估算所需時間</span><strong>${result.reached ? `${result.years} 年` : "超過 100 年"}</strong></div><div class="result-row"><span>年支出</span><strong>${money(result.annualExpenses, currency)}</strong></div><div class="result-row"><span>扣除通脹後假設回報</span><strong>${percent(result.realReturn)}</strong></div><div class="result-row"><span>期末模擬資產</span><strong>${money(result.endingBalance, currency)}</strong></div></div><p class="result-note">${result.reached ? "按此簡化模型，資產約於該年末達到目標。" : "目前假設下未能在 100 年內達到目標；可先檢查支出、儲蓄與假設回報。"} 這不是預測或保證。</p>`;
    } catch (error) {
      output.textContent = error.message;
    }
  });
}

const travelForm = document.querySelector("#travel-form");
if (travelForm) {
  travelForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const output = document.querySelector("#travel-result");
    const data = Object.fromEntries(new FormData(travelForm));
    try {
      const result = calculateTravel(data);
      const currency = data.currency;
      const gapLine = result.gap > 0 ? `仍需預備 ${money(result.gap, currency)}` : `扣除預留緩衝後，尚餘 ${money(Math.abs(result.gap), currency)}`;
      output.innerHTML = `<strong>所需預算：${money(result.totalNeed, currency)}</strong><div class="result-list"><div class="result-row"><span>旅途和香港固定開支</span><strong>${money(result.tripCosts, currency)}</strong></div><div class="result-row"><span>可確認收入</span><strong>${money(result.confirmedIncome, currency)}</strong></div><div class="result-row"><span>現金及收入合計</span><strong>${money(result.funding, currency)}</strong></div><div class="result-row"><span>緩衝金後差額</span><strong>${gapLine}</strong></div></div><p class="result-note">只計算你輸入的數字；未包含匯率變化、稅項、突發醫療或收入中斷。</p>`;
    } catch (error) {
      output.textContent = error.message;
    }
  });
}

const latestBrief = document.querySelector("#latest-brief");
if (latestBrief) {
  fetch("/fire-and-travel/data/news.json", { headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : [])
    .then((briefs) => {
      const latest = Array.isArray(briefs) ? briefs.find((brief) => Array.isArray(brief.items) && brief.items.length > 0) : null;
      if (!latest) return;
      const link = document.createElement("a");
      link.href = `/fire-and-travel/news/${encodeURIComponent(latest.date)}.html`;
      link.className = "text-link";
      link.textContent = `${latest.date}｜${latest.title || "本週新聞摘要"} →`;
      latestBrief.replaceChildren(link);
    })
    .catch(() => {});
}
