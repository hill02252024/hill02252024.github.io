/* Inline VAT-refund widget for /tools/eu/* article pages.
 *
 * Shows a live figure at the top of the page before a word of prose.
 * Every number comes from /data/vat-refund.json through the shared
 * engine in /tools/vat-tax.js. No operator fee is assumed: none is
 * sourced, so the widget reports the VAT in the price and whether the
 * purchase clears the country's minimum, and stops there.
 *
 * Markup:
 *   <div class="vat-embed" data-country="IT" data-amount="500"
 *        data-title="..."></div>
 */
(function () {
  'use strict';

  function build(host) {
    var startCode = (host.dataset.country || '').toUpperCase();
    var startAmount = Number(host.dataset.amount) || 500;
    var e = VATRefund.esc;

    var opts = VATRefund.refundable().map(function (c) {
      return '<option value="' + c.code + '"' + (c.code === startCode ? ' selected' : '') + '>' +
             e(c.name) + ' (' + e(c.displayVatRate) + ')</option>';
    }).join('');

    host.innerHTML =
      '<div class="ve-title">' + e(host.dataset.title || 'What you can claim back') + '</div>' +
      '<p class="ve-sub">Live figures from this site’s verified dataset. Change either field.</p>' +
      '<div class="ve-controls">' +
        '<label>Where you shopped<select class="ve-country">' + opts + '</select></label>' +
        '<label>Amount paid in store<input type="number" class="ve-amount" min="0" step="10" value="' + startAmount + '" inputmode="decimal" /></label>' +
      '</div>' +
      '<div class="ve-out"></div>' +
      '<p class="ve-foot"></p>';

    var $ = function (s) { return host.querySelector(s); };

    function render() {
      var c = VATRefund.byCode($('.ve-country').value);
      var amount = Math.max(0, Number($('.ve-amount').value) || 0);
      if (!c) { $('.ve-out').innerHTML = ''; return; }
      var r = VATRefund.compute({ amount: amount, country: c.code });
      var m = function (n) { return VATRefund.money(n, c.currencySymbol); };
      var meets = amount >= c.minSpendLocal;

      $('.ve-out').innerHTML =
        '<div class="ve-big">' + m(r.vat) + '<small>VAT inside a ' + m(amount) + ' purchase in ' + e(c.name) + '</small></div>' +
        '<ul class="ve-rows">' +
          '<li><span>VAT rate</span><b>' + e(c.displayVatRate) + '</b></li>' +
          '<li><span>Price without VAT</span><b>' + m(r.netPrice) + '</b></li>' +
          '<li><span>Minimum spend</span><b>' + e(c.minSpendDisplay) + '</b></li>' +
          '<li><span>Export deadline</span><b>' + c.claimDeadlineDays + ' days</b></li>' +
        '</ul>' +
        '<p class="min-check ' + (meets ? 'ok' : 'under') + '">' +
          (c.minSpendLocal <= 0
            ? '✓ ' + e(c.name) + ' sets no minimum purchase amount, so the VAT above is claimable in ' +
              'principle whatever you spent.'
            : meets
              ? '✓ This purchase clears the ' + e(c.minSpendDisplay) + ' minimum, so the VAT above is ' +
                'claimable in principle.'
              : '✗ Below the minimum of ' + e(c.minSpendDisplay) + '. You are short by ' +
                m(c.minSpendLocal - amount) + ' — nothing is claimable until the purchase clears it.') +
        '</p>';

      $('.ve-foot').innerHTML =
        'The refund operator that processes your form keeps part of the VAT above — a handling fee ' +
        'plus a currency-conversion margin, with cash at the airport normally costing more than a ' +
        'refund to your card. That share is set by the operator, not the country, so read its ' +
        'published terms. ' +
        '<a href="' + VATRefund.deepLink({ country: c.code, amount: amount }) + '">Model your operator’s fee in the full calculator →</a><br>' +
        'Source: ' + VATRefund.sourceLinks(c) + ' &middot; verified ' + e(c.lastVerified) + '.';
    }

    ['.ve-country', '.ve-amount'].forEach(function (sel) {
      $(sel).addEventListener('change', render);
      $(sel).addEventListener('input', render);
    });
    render();
    host.classList.add('is-ready');
  }

  function init() {
    var hosts = document.querySelectorAll('.vat-embed');
    if (!hosts.length) return;
    VATRefund.load().then(function () {
      hosts.forEach(build);
    }).catch(function () {
      hosts.forEach(function (h) {
        h.innerHTML = '<p>Data could not be loaded. Use the ' +
          '<a href="/tools/vat-refund/">full VAT refund calculator</a> instead.</p>';
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
