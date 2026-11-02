export function calculateFire({ assets, monthlySaving, monthlySpending, nominalReturn, inflation, withdrawalRate }) {
  const values = [assets, monthlySaving, monthlySpending, nominalReturn, inflation, withdrawalRate].map(Number);
  if (values.some((value) => !Number.isFinite(value))) throw new Error("請輸入有效數字。");
  const [startingAssets, monthlyContribution, monthlyExpenses, nominal, inflationRate, withdrawal] = values;
  if (startingAssets < 0 || monthlyContribution < 0 || monthlyExpenses <= 0 || nominal <= -100 || inflationRate < 0 || withdrawal <= 0 || withdrawal > 20) throw new Error("請檢查數值範圍。");
  const annualExpenses = monthlyExpenses * 12;
  const target = annualExpenses / (withdrawal / 100);
  const realReturn = (1 + nominal / 100) / (1 + inflationRate / 100) - 1;
  let balance = startingAssets;
  let years = 0;
  while (balance < target && years < 100) {
    balance = balance * (1 + realReturn) + monthlyContribution * 12;
    years += 1;
  }
  return { annualExpenses, target, realReturn, years, endingBalance: balance, reached: balance >= target };
}

export function calculateTravel({ months, monthlyTravel, monthlyHome, oneOff, buffer, available, monthlyIncome }) {
  const values = [months, monthlyTravel, monthlyHome, oneOff, buffer, available, monthlyIncome].map(Number);
  if (values.some((value) => !Number.isFinite(value))) throw new Error("請輸入有效數字。");
  const [duration, travel, home, setup, reserve, cash, income] = values;
  if (duration <= 0 || duration > 60 || [travel, home, setup, reserve, cash, income].some((value) => value < 0)) throw new Error("請檢查數值範圍。");
  const tripCosts = duration * (travel + home) + setup;
  const totalNeed = tripCosts + reserve;
  const confirmedIncome = duration * income;
  const funding = cash + confirmedIncome;
  return { duration, tripCosts, reserve, totalNeed, confirmedIncome, funding, gap: totalNeed - funding };
}
