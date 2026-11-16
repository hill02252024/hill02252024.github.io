export function monthlyPayment(principal, annualRatePct, termYears) {
  const months = termYears * 12;
  if (principal === 0) return 0;
  const rate = annualRatePct / 100 / 12;
  if (rate === 0) return principal / months;
  const factor = Math.pow(1 + rate, months);
  return principal * (rate * factor) / (factor - 1);
}

export function buildSchedule(input, payment, withExtras) {
  const monthlyRate = input.rate / 100 / 12;
  const totalMonths = input.term * 12;
  const rows = [];
  let balance = input.loan;
  let totalInterest = 0;
  let totalPaid = 0;

  for (let month = 1; month <= totalMonths && balance > 0.005; month++) {
    const interest = balance * monthlyRate;
    const scheduledPrincipal = Math.min(Math.max(payment - interest, 0), balance);
    let extra = withExtras ? input.monthly : 0;
    if (withExtras && month % 12 === 0) extra += input.annual;
    if (withExtras && month === input.month) extra += input.lump;
    extra = Math.min(Math.max(extra, 0), balance - scheduledPrincipal);
    balance = Math.max(0, balance - scheduledPrincipal - extra);
    totalInterest += interest;
    totalPaid += payment + extra;
    rows.push({ month, interest, extra, balance });
  }
  return { rows, months: rows.length, totalInterest, totalPaid };
}

export function calculate(input) {
  const numeric = Object.values(input).every(Number.isFinite);
  if (!numeric || input.loan <= 0 || input.loan > 100000000) {
    throw new Error('Enter a loan principal between $1 and $100,000,000.');
  }
  if (input.rate < 0 || input.rate > 25) throw new Error('Rate must be 0–25%.');
  if (!Number.isInteger(input.term) || input.term < 1 || input.term > 40) {
    throw new Error('Term must be a whole number from 1–40 years.');
  }
  if ([input.monthly, input.annual, input.lump].some(v => v < 0)) {
    throw new Error('Extra payments cannot be negative.');
  }
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > input.term * 12) {
    throw new Error(`Lump-sum month must be 1–${input.term * 12}.`);
  }

  const payment = monthlyPayment(input.loan, input.rate, input.term);
  const baseline = buildSchedule(input, payment, false);
  const accelerated = buildSchedule(input, payment, true);
  return {
    payment,
    baseline,
    accelerated,
    interestSaved: Math.max(0, baseline.totalInterest - accelerated.totalInterest),
    monthsSaved: baseline.months - accelerated.months,
  };
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('payoff-form');
  const ids = ['loan', 'rate', 'term', 'monthly', 'annual', 'lump', 'month'];
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function readInputs() {
    return Object.fromEntries(ids.map(id => [id, Number(document.getElementById(id).value)]));
  }

  function duration(months) {
    const years = Math.floor(months / 12);
    const remaining = months % 12;
    if (!years) return `${remaining} mo`;
    return `${years} yr ${remaining} mo`;
  }

  function render() {
    const error = document.getElementById('form-error');
    try {
      const input = readInputs();
      const result = calculate(input);
      error.hidden = true;
      document.getElementById('month').max = input.term * 12;
      document.getElementById('result-summary').innerHTML = `<div class="result-hero"><strong>Estimated interest saved: ${money.format(result.interestSaved)}</strong><br>Payoff could be ${duration(result.monthsSaved)} earlier.</div>`;
      const cards = [
        ['Monthly principal & interest', money.format(result.payment)],
        ['Original payoff', duration(result.baseline.months)],
        ['Accelerated payoff', duration(result.accelerated.months)],
        ['Interest without extras', money.format(result.baseline.totalInterest)],
      ];
      document.getElementById('result-cards').innerHTML = cards.map(([label, value]) => `<div class="result-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
      const params = new URLSearchParams();
      ids.forEach(id => params.set(id, input[id]));
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    } catch (exception) {
      error.textContent = exception.message;
      error.hidden = false;
    }
  }

  const params = new URLSearchParams(window.location.search);
  ids.forEach(id => {
    if (params.has(id)) document.getElementById(id).value = params.get(id);
  });
  form.addEventListener('submit', event => { event.preventDefault(); render(); });
  ids.forEach(id => document.getElementById(id).addEventListener('input', render));

  document.getElementById('copy-link').addEventListener('click', async () => {
    const status = document.getElementById('copy-status');
    try {
      await navigator.clipboard.writeText(window.location.href);
      status.textContent = 'Copied';
    } catch (_) {
      status.textContent = 'Copy unavailable — use your address bar.';
    }
  });
  render();
}