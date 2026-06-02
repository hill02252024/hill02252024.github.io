// Shared helpers for every /tools/ page.
// - Money / number formatters.
// - "Copy result" + "Reset" wiring.
// - Mobile nav toggle.
// - Lazy AdSense slot push for any .ad-slot > ins.adsbygoogle on the page.

window.tt = window.tt || {};

(function() {
  // Currency: respects the user's locale by default but pins USD because
  // every calculator on this page works in dollars unless explicitly noted.
  tt.fmt = function(n, opts) {
    opts = opts || {};
    var dec = opts.decimals == null ? 2 : opts.decimals;
    var prefix = opts.prefix == null ? '$' : opts.prefix;
    if (!isFinite(n)) return prefix + '0.00';
    return prefix + n.toLocaleString('en-US', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  };
  tt.pct = function(n, dec) {
    if (dec == null) dec = 2;
    if (!isFinite(n)) return '0%';
    return n.toFixed(dec) + '%';
  };
  tt.num = function(n) {
    if (!isFinite(n)) return '0';
    return n.toLocaleString('en-US');
  };
  // Read float from input; treats blanks as 0 unless required=true.
  tt.read = function(id, required) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var v = parseFloat((el.value + '').replace(/,/g, ''));
    if (isNaN(v)) return required ? null : 0;
    return v;
  };
  // Show a result box (.result-box) with the given inner HTML.
  tt.showResult = function(boxId, html, klass) {
    var box = document.getElementById(boxId);
    if (!box) return;
    box.className = 'result-box show ' + (klass || '');
    box.innerHTML = html;
    // Scroll the result into view on mobile.
    setTimeout(function() {
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
    // Show ad-result slot if present and not yet activated.
    var ad = document.querySelector('.ad-slot.ad-result ins.adsbygoogle');
    if (ad && !ad.dataset.adsbygoogleStatus) {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    }
    // Fire the privacy reassurance toast (debounced inside).
    tt.privacyToast();
  };

  // Reassurance toast: confirms the work just done stayed on-device.
  // Debounced so repeated tool actions don't stack toasts.
  var _toastTimer = null;
  tt.privacyToast = function(msg) {
    if (_toastTimer) return; // already showing
    var existing = document.getElementById('privacy-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'privacy-toast';
    toast.innerHTML = '<span aria-hidden="true">✓</span> ' +
      (msg || 'Processed on your device. 0 bytes sent to any server.');
    document.body.appendChild(toast);
    _toastTimer = setTimeout(function() {
      toast.remove();
      _toastTimer = null;
    }, 4000);
  };
  // Hide a previously shown result.
  tt.hideResult = function(boxId) {
    var box = document.getElementById(boxId);
    if (!box) return;
    box.className = 'result-box';
    box.innerHTML = '';
  };
  // Copy plain text to clipboard with a graceful prompt fallback.
  tt.copyText = function(text, btn) {
    var ok = function() {
      if (btn) {
        var orig = btn.textContent;
        btn.textContent = '✓ Copied';
        setTimeout(function() { btn.textContent = orig; }, 1600);
      }
      tt.privacyToast('Copied locally. Clipboard stayed on your device.');
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(ok).catch(function() {
        window.prompt('Copy:', text);
      });
    } else {
      window.prompt('Copy:', text);
    }
  };
})();

// Boot once DOM is ready.
document.addEventListener('DOMContentLoaded', function() {
  // Mobile nav toggle (matches /style.css contract).
  var toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function() {
      var nav = document.getElementById('primary-nav');
      var open = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!open));
      if (nav) nav.classList.toggle('is-open');
    });
  }
  // Push every visible (non-result) AdSense slot once the page settles.
  // Result slots stay dormant until tt.showResult fires, so they only
  // appear after the user has gotten value from the page.
  document.querySelectorAll('.ad-slot:not(.ad-result) ins.adsbygoogle')
    .forEach(function() {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    });

  // Catch-all: fire the privacy reassurance toast on any primary tool
  // action that doesn't already route through tt.showResult / tt.copyText.
  // Verbs we treat as "tool ran": Generate, Redact, Encrypt, Reveal,
  // Calculate, Check, Strip, Mask, Scan, Run.
  var TOOL_VERBS = /^(generate|redact|encrypt|reveal|calculate|check|strip|mask|scan|run|create|hash)\b/i;
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('button, .btn');
    if (!btn) return;
    var label = (btn.textContent || '').trim();
    if (!label || !TOOL_VERBS.test(label)) return;
    // Fire shortly after the tool's own handler has done its DOM work.
    setTimeout(function () { tt.privacyToast(); }, 700);
  }, { passive: true });
});
