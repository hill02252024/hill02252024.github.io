/* Shared VAT-refund engine for /tools/vat-refund/ and /tools/eu/*.
 *
 * Data: /data/vat-refund.json — the 12 jurisdictions in the Take-Home /
 * VAT Refund app's dataset that carry BOTH a lastVerified stamp and a
 * source URL from the authority administering the scheme. The other 27
 * jurisdictions in that dataset are unverified and are not published here.
 *
 * Refund-operator handling fees and FX margins are deliberately absent:
 * no sourced figure exists for them. Never hardcode one.
 */
(function (global) {
  'use strict';

  var table = null, state = 'idle', waiters = [];

  function load() {
    if (state === 'ready') return Promise.resolve(table);
    if (state === 'loading') return new Promise(function (res, rej) { waiters.push([res, rej]); });
    state = 'loading';
    return fetch('/data/vat-refund.json')
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

  function all() { return table ? table.countries : []; }
  function byCode(code) {
    if (!table || !code) return null;
    for (var i = 0; i < table.countries.length; i++) {
      if (table.countries[i].code === code) return table.countries[i];
    }
    return null;
  }
  /* Only the jurisdictions that actually run a traveller refund scheme. */
  function refundable() {
    return all().filter(function (c) { return c.refundAvailable; });
  }

  /* VAT sits INSIDE the displayed price, so it is amount x r/(1+r).
     Multiplying the price by the rate overstates it every time. */
  function vatInPrice(amount, rate) {
    if (!(amount > 0) || !(rate > 0)) return 0;
    return amount * (rate / (1 + rate));
  }

  /* opts: {amount, country (code) or rate, adminFeePercent} */
  function compute(opts) {
    var c = opts.country ? byCode(opts.country) : null;
    var rate = c ? c.vatRate : (Number(opts.rate) || 0);
    var amount = Math.max(0, Number(opts.amount) || 0);
    var vat = vatInPrice(amount, rate);
    var feePct = Math.max(0, Math.min(100, Number(opts.adminFeePercent) || 0));
    var refund = vat * (1 - feePct / 100);
    return {
      country: c, rate: rate, amount: amount,
      vat: vat, netPrice: amount - vat,
      adminFeePercent: feePct, feeWithheld: vat - refund, refund: refund,
      effectivePercent: amount > 0 ? refund / amount * 100 : 0,
      meetsMinimum: c ? amount >= c.minSpendLocal : null,
      shortfall: c ? Math.max(0, c.minSpendLocal - amount) : 0
    };
  }

  function money(n, symbol) {
    var sym = symbol || '';
    // "CHF" and "kr" need a space; "€" and "£" do not.
    var sep = /[A-Za-z]$/.test(sym) ? ' ' : '';
    return sym + sep + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function sourceLinks(c) {
    if (!c || !c.sourceUrls || !c.sourceUrls.length) return '';
    return c.sourceUrls.map(function (u, i) {
      return '<a href="' + esc(u) + '" rel="nofollow noopener">source ' + (c.sourceUrls.length > 1 ? (i + 1) : '') + '</a>';
    }).join(' &middot; ');
  }
  function deepLink(o) {
    var q = [];
    if (o.country) q.push('country=' + encodeURIComponent(o.country));
    if (o.amount) q.push('amount=' + encodeURIComponent(o.amount));
    return '/tools/vat-refund/' + (q.length ? '?' + q.join('&') : '');
  }
  function parseQuery(search) {
    var p = new URLSearchParams(search || global.location.search);
    return {
      country: (p.get('country') || '').toUpperCase(),
      amount: p.get('amount') ? Math.max(0, Number(p.get('amount')) || 0) : null
    };
  }

  global.VATRefund = {
    load: load, all: all, byCode: byCode, refundable: refundable,
    compute: compute, vatInPrice: vatInPrice,
    money: money, esc: esc, sourceLinks: sourceLinks,
    deepLink: deepLink, parseQuery: parseQuery,
    get table() { return table; },
    get failed() { return state === 'failed'; }
  };
})(window);
