/* Inline take-home widget for /tools/us/* article pages.
 *
 * Renders a live two-state comparison at the top of the page, preconfigured
 * per article, so a reader sees a number before reading a word of prose.
 * Uses the shared engine in /tools/us-tax.js and the tables in
 * /data/us-state-tax.json — no figures are defined here.
 *
 * Markup:
 *   <div class="us-embed" data-a="CA" data-b="TX" data-salary="100000"
 *        data-filing="single" data-year="2025"
 *        data-city-a="" data-city-b="" data-title="..."></div>
 */
(function () {
  'use strict';

  var FILING_LABELS = {
    single: 'Single',
    marriedFilingJointly: 'Married filing jointly',
    marriedFilingSeparately: 'Married filing separately',
    headOfHousehold: 'Head of household'
  };

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function stateOptions(selected) {
    return USTax.statesSorted().map(function (s) {
      return '<option value="' + s.code + '"' + (s.code === selected ? ' selected' : '') + '>' +
             USTax.esc(s.name) + (s.type === 'none' ? ' (no income tax)' : '') + '</option>';
    }).join('');
  }

  function build(host) {
    var cfg = {
      a: (host.dataset.a || '').toUpperCase(),
      b: (host.dataset.b || '').toUpperCase(),
      cityA: (host.dataset.cityA || '').toUpperCase(),
      cityB: (host.dataset.cityB || '').toUpperCase(),
      salary: Number(host.dataset.salary) || 100000,
      filing: host.dataset.filing || 'single',
      year: host.dataset.year || (USTax.table ? USTax.table.states.taxYear : '2025')
    };

    host.innerHTML =
      '<div class="emb-head">' +
        '<h2 class="emb-title">' + USTax.esc(host.dataset.title || 'Take-home pay, side by side') + '</h2>' +
        '<p class="emb-sub">Live figures from this site’s tax tables. Change anything below.</p>' +
      '</div>' +
      '<div class="emb-controls">' +
        '<label>Gross salary<span class="emb-prefix">$</span>' +
          '<input type="number" class="emb-salary" min="0" step="1000" value="' + cfg.salary + '" inputmode="decimal" /></label>' +
        '<label>Filing status<select class="emb-filing">' +
          Object.keys(FILING_LABELS).map(function (k) {
            return '<option value="' + k + '"' + (k === cfg.filing ? ' selected' : '') + '>' + FILING_LABELS[k] + '</option>';
          }).join('') +
        '</select></label>' +
        '<label>Compare<select class="emb-a">' + stateOptions(cfg.a) + '</select></label>' +
        '<label>Against<select class="emb-b">' + stateOptions(cfg.b) + '</select></label>' +
      '</div>' +
      '<div class="emb-cards"></div>' +
      '<p class="emb-verdict"></p>' +
      '<p class="emb-foot"><a class="emb-link" href="#">Open in the full calculator →</a> ' +
        '<span class="emb-scope">Income tax and payroll tax only — property tax and sales tax are not included.</span></p>' +
      '<p class="emb-src"></p>';

    var $ = function (c) { return host.querySelector(c); };

    function card(r, other) {
      var u = USTax.usd;
      var better = r.net > other.net;
      var name = USTax.esc(r.stateObj.name) + (r.cityObj ? ' + ' + USTax.esc(r.cityObj.name) : '');
      return '<div class="emb-card' + (better ? ' is-better' : '') + '">' +
        '<div class="emb-card-name">' + name + (better ? '<span class="emb-badge">keeps more</span>' : '') + '</div>' +
        '<div class="emb-net">' + u(r.net) + '<small>net per year</small></div>' +
        '<div class="emb-month">' + u(r.net / 12) + ' per month</div>' +
        '<ul class="emb-layers">' +
          '<li><span>Federal income tax</span><b>' + u(r.fed) + '</b></li>' +
          '<li><span>FICA</span><b>' + u(r.fica) + '</b></li>' +
          '<li><span>State income tax</span><b>' + u(r.stateTax) + '</b></li>' +
          (r.cityObj ? '<li><span>City wage tax</span><b>' + u(r.cityTax) + '</b></li>' : '') +
          '<li class="emb-total"><span>Total tax</span><b>' + u(r.total) + ' (' + r.effectiveRate.toFixed(1) + '%)</b></li>' +
        '</ul></div>';
    }

    function srcFor(r) {
      if (!r.stateObj) return '';
      var bits = [USTax.esc(r.stateObj.sourceLabel) +
        ' (<a href="' + USTax.esc(r.stateObj.sourceUrl) + '" rel="nofollow noopener">source</a>)'];
      if (r.cityObj) {
        bits.push(USTax.esc(r.cityObj.sourceLabel) +
          ' (<a href="' + USTax.esc(r.cityObj.sourceUrl) + '" rel="nofollow noopener">source</a>)');
      }
      return bits.join('; ');
    }

    function render() {
      var salary = Math.max(0, Number($('.emb-salary').value) || 0);
      var filing = $('.emb-filing').value;
      var a = $('.emb-a').value, b = $('.emb-b').value;
      var base = { gross: salary, filing: filing, year: cfg.year };
      var ra = USTax.compute(Object.assign({}, base, { state: a, city: a === cfg.a ? cfg.cityA : '' }));
      var rb = USTax.compute(Object.assign({}, base, { state: b, city: b === cfg.b ? cfg.cityB : '' }));

      $('.emb-cards').innerHTML = card(ra, rb) + card(rb, ra);

      var hi = ra.net >= rb.net ? ra : rb, lo = ra.net >= rb.net ? rb : ra;
      var diff = hi.net - lo.net;
      var hiName = hi.stateObj.name + (hi.cityObj ? ' + ' + hi.cityObj.name : '');
      var loName = lo.stateObj.name + (lo.cityObj ? ' + ' + lo.cityObj.name : '');
      $('.emb-verdict').innerHTML = diff === 0
        ? 'At ' + USTax.usd(salary) + ' gross, the two are identical on payroll taxes.'
        : 'At ' + USTax.usd(salary) + ' gross, <b>' + USTax.esc(hiName) + '</b> keeps <b>' +
          USTax.usd(diff) + '</b> more per year than ' + USTax.esc(loName) + ' — ' +
          USTax.usd(diff / 12) + ' a month.';

      var srcs = [srcFor(ra), srcFor(rb)].filter(Boolean).join(' &middot; ');
      $('.emb-src').innerHTML = srcs
        ? 'Sources: ' + srcs + '. Tables: <a href="/data/us-state-tax.json">us-state-tax.json</a>.'
        : '';

      $('.emb-link').href = USTax.deepLink({
        salary: salary, state: a, vs: b, filing: filing, year: cfg.year,
        city: a === cfg.a ? cfg.cityA : '', vsCity: b === cfg.b ? cfg.cityB : ''
      });
    }

    ['.emb-salary', '.emb-filing', '.emb-a', '.emb-b'].forEach(function (sel) {
      var node = $(sel);
      node.addEventListener('change', render);
      node.addEventListener('input', render);
    });
    render();
    host.classList.add('is-ready');
  }

  function init() {
    var hosts = document.querySelectorAll('.us-embed');
    if (!hosts.length) return;
    USTax.load().then(function () {
      hosts.forEach(build);
    }).catch(function () {
      hosts.forEach(function (h) {
        h.innerHTML = '<p class="emb-fail">Tax tables could not be loaded. ' +
          'Use the <a href="/tools/salary-calculator/">full salary calculator</a> instead.</p>';
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
