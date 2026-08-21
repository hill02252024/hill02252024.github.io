/* Shared US federal / state / city tax engine.
 *
 * One source of truth for /tools/salary-calculator/ and the inline
 * widgets on /tools/us/*. Every figure comes from /data/us-state-tax.json,
 * which is extracted from the Take-Home Salary app's tax tables.
 * Nothing is hardcoded in this file.
 */
(function (global) {
  'use strict';

  var table = null, state = 'idle', waiters = [];

  function load() {
    if (state === 'ready') return Promise.resolve(table);
    if (state === 'loading') return new Promise(function (res, rej) { waiters.push([res, rej]); });
    state = 'loading';
    return fetch('/data/us-state-tax.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        table = j; state = 'ready';
        waiters.forEach(function (w) { w[0](j); }); waiters = [];
        return j;
      })
      .catch(function (e) {
        state = 'failed';
        waiters.forEach(function (w) { w[1](e); }); waiters = [];
        throw e;
      });
  }

  function byCode(list, code) {
    if (!list || !code) return null;
    for (var i = 0; i < list.length; i++) if (list[i].code === code) return list[i];
    return null;
  }
  function stateFor(code) { return table ? byCode(table.states.entries, code) : null; }
  function cityFor(code) { return table ? byCode(table.localities.entries, code) : null; }
  function citiesIn(stateCode) {
    if (!table) return [];
    return table.localities.entries.filter(function (l) { return l.stateCode === stateCode; });
  }
  function statesSorted() {
    if (!table) return [];
    return table.states.entries.slice().sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  }

  /* Bracket walker for {from, rate} tables: bracket i covers [from_i, from_i+1). */
  function bracketTax(amount, brackets) {
    if (!brackets || amount <= 0) return 0;
    var tax = 0;
    for (var i = 0; i < brackets.length; i++) {
      var from = brackets[i].from;
      var to = (i + 1 < brackets.length) ? brackets[i + 1].from : Infinity;
      if (amount <= from) break;
      tax += ((amount < to ? amount : to) - from) * brackets[i].rate;
    }
    return tax;
  }

  /* Mirrors StateTax.stdDeductionFor(): MFJ takes the override when set, else 2x single. */
  function stdDeductionFor(st, filing) {
    if (filing === 'marriedFilingJointly') {
      return st.stdDeductionJointOverride > 0 ? st.stdDeductionJointOverride : st.stdDeductionSingle * 2;
    }
    return st.stdDeductionSingle;
  }

  function pickBrackets(map, filing) {
    if (!map) return null;
    return map[filing] || map.single || null;
  }

  /* opts: {gross, year, filing, state, city, nonResident} */
  function compute(opts) {
    if (!table) throw new Error('tax table not loaded');
    var year = table.federal[opts.year] ? opts.year : table.states.taxYear;
    var fy = table.federal[year];
    var filing = opts.filing || 'single';
    var g = Math.max(0, Number(opts.gross) || 0);

    /* Federal: statutory 26 U.S.C. 1(j)(2) rate schedules applied to gross wages
       minus the 63(c) basic standard deduction. This models annual filing
       liability, not payroll withholding — the 2025 Pub. 15-T withholding tables
       predate OBBBA and withhold against a lower standard deduction. */
    var stdDed = fy.standardDeduction
      ? (fy.standardDeduction[filing] != null ? fy.standardDeduction[filing] : fy.standardDeduction.single)
      : 0;
    var fedTaxable = Math.max(0, g - stdDed);
    var fed = bracketTax(fedTaxable, pickBrackets(fy.brackets, filing));

    var f = fy.fica;
    var ss = Math.min(g, f.socialSecurityWageBase) * f.socialSecurityRate;
    var addlThr = filing === 'marriedFilingJointly' ? f.additionalMedicareThresholdMfj
                : filing === 'marriedFilingSeparately' ? f.additionalMedicareThresholdMfs
                : f.additionalMedicareThresholdSingle;
    var med = g * f.medicareRate + (g > addlThr ? (g - addlThr) * f.additionalMedicareRate : 0);

    var st = stateFor(opts.state), stateTax = 0;
    if (st) {
      var taxable = Math.max(0, g - stdDeductionFor(st, filing));
      if (st.type === 'flat') stateTax = taxable * st.flatRate;
      else if (st.type === 'progressive') stateTax = bracketTax(taxable, pickBrackets(st.brackets, filing));
    }

    /* City wage tax applies to gross wages, not to state-taxable income. */
    var loc = cityFor(opts.city), cityTax = 0;
    if (loc && st && loc.stateCode === st.code) {
      if (loc.type === 'flat') {
        cityTax = g * (opts.nonResident ? loc.nonResidentFlatRate : loc.flatRate);
      } else if (opts.nonResident) {
        var nrb = pickBrackets(loc.nonResidentBrackets, filing);
        cityTax = nrb ? bracketTax(g, nrb) : g * loc.nonResidentFlatRate;
      } else {
        cityTax = bracketTax(g, pickBrackets(loc.brackets, filing));
      }
    } else {
      loc = null;
    }

    var total = fed + ss + med + stateTax + cityTax;
    return {
      gross: g, year: year, filing: filing,
      fed: fed, fedStandardDeduction: stdDed, fedTaxable: fedTaxable,
      ss: ss, med: med, fica: ss + med,
      stateTax: stateTax, cityTax: cityTax,
      total: total, net: g - total,
      effectiveRate: g > 0 ? total / g * 100 : 0,
      stateObj: st, cityObj: loc,
      estimated: !!fy.estimated,
      stateTableYear: table.states.taxYear
    };
  }

  function usd(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(r) { return (r * 100).toFixed(4).replace(/\.?0+$/, '') + '%'; }
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Deep link into the full calculator, optionally comparing a second state. */
  function deepLink(o) {
    var q = ['country=us'];
    if (o.salary) q.push('salary=' + encodeURIComponent(o.salary));
    if (o.state) q.push('state=' + encodeURIComponent(o.state));
    if (o.vs) q.push('vs=' + encodeURIComponent(o.vs));
    if (o.city) q.push('city=' + encodeURIComponent(o.city));
    if (o.vsCity) q.push('vscity=' + encodeURIComponent(o.vsCity));
    if (o.filing) q.push('filing=' + encodeURIComponent(o.filing));
    if (o.year) q.push('year=' + encodeURIComponent(o.year));
    if (o.nonResident) q.push('nonres=1');
    return '/tools/salary-calculator/?' + q.join('&');
  }

  /* Read the same params back out of a query string. */
  var FILINGS = ['single', 'marriedFilingJointly', 'marriedFilingSeparately', 'headOfHousehold'];
  function parseQuery(search) {
    var p = new URLSearchParams(search || global.location.search);
    var filing = p.get('filing');
    var out = {
      country: (p.get('country') || '').toLowerCase(),
      salary: p.get('salary') ? Math.max(0, Number(p.get('salary')) || 0) : null,
      state: (p.get('state') || '').toUpperCase(),
      vs: (p.get('vs') || '').toUpperCase(),
      city: (p.get('city') || '').toUpperCase(),
      vsCity: (p.get('vscity') || '').toUpperCase(),
      filing: FILINGS.indexOf(filing) >= 0 ? filing : null,
      year: /^20\d\d$/.test(p.get('year') || '') ? p.get('year') : null,
      nonResident: p.get('nonres') === '1'
    };
    out.hasUsParams = !!(out.salary || out.state || out.vs || out.city || out.filing || out.year);
    return out;
  }

  global.USTax = {
    load: load, compute: compute, deepLink: deepLink, parseQuery: parseQuery,
    stateFor: stateFor, cityFor: cityFor, citiesIn: citiesIn, statesSorted: statesSorted,
    stdDeductionFor: stdDeductionFor, bracketTax: bracketTax,
    usd: usd, pct: pct, esc: esc, filings: FILINGS,
    get table() { return table; },
    get failed() { return state === 'failed'; }
  };
})(window);
