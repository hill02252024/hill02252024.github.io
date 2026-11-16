import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyPayment, buildSchedule, calculate } from '../tools/mortgage-extra-payment-calculator/calculator.mjs';

const base = { loan: 328000, rate: 7, term: 30, monthly: 0, annual: 0, lump: 0, month: 12 };

test('standard payment matches fixed-rate mortgage formula', () => {
  assert.ok(Math.abs(monthlyPayment(328000, 7, 30) - 2182.19) < 0.05);
  assert.equal(monthlyPayment(12000, 0, 1), 1000);
});

test('baseline matches closed-form interest and 360 months', () => {
  const payment = monthlyPayment(base.loan, base.rate, base.term);
  const schedule = buildSchedule(base, payment, false);
  assert.equal(schedule.months, 360);
  assert.ok(Math.abs(schedule.totalInterest - (payment * 360 - base.loan)) < 1);
});

test('monthly, annual and one-time extras reduce time and interest', () => {
  const result = calculate({ ...base, monthly: 200, annual: 3000, lump: 5000 });
  assert.ok(result.monthsSaved > 0);
  assert.ok(result.interestSaved > 0);
  assert.equal(result.accelerated.rows[11].extra, 8200);
  assert.equal(result.accelerated.rows[23].extra, 3200);
});

test('zero-rate final extra is capped at remaining principal', () => {
  const result = calculate({ loan: 10000, rate: 0, term: 1, monthly: 500, annual: 2000, lump: 9000, month: 2 });
  assert.equal(result.accelerated.rows.at(-1).balance, 0);
  let previousBalance = 10000;
  let principalPaid = 0;
  for (const row of result.accelerated.rows) {
    principalPaid += previousBalance - row.balance;
    previousBalance = row.balance;
  }
  assert.ok(Math.abs(principalPaid - 10000) < 0.01);
  assert.ok(result.accelerated.months < result.baseline.months);
  assert.ok(result.accelerated.rows.every(row => row.extra >= 0));
});

test('invalid inputs are rejected', () => {
  assert.throws(() => calculate({ ...base, loan: 0 }), /principal/);
  assert.throws(() => calculate({ ...base, term: 1, month: 13 }), /month/);
  assert.throws(() => calculate({ ...base, monthly: -1 }), /negative/);
});