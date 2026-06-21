/* =======================================================================
   /tools/premium.js — the site is now 100% free.

   This file used to run a Premium subscription system (paywall, Lemon
   Squeezy checkout, ad-hiding, license keys). Today's Tasks is free, so
   that's all gone. This shim keeps the small window.ttPremium API that the
   tool pages still call, but every feature is simply unlocked:

     - no paywall, no badges, no checkout, no "upgrade" anything
     - ads always show (we're ad-supported and free)
     - "Save calculation history" and "Export PDF" work for everyone, locally

   Exposes: window.ttPremium
   ======================================================================= */

window.ttPremium = (function () {
  function noop() {}

  // Everything is free → treat every visitor as fully unlocked, but never
  // inject any "you're premium" UI and never hide ads.
  function isPremium() { return true; }

  // A locked feature is no longer locked: just run it.
  function gate(featureName, premiumFn) { if (typeof premiumFn === 'function') premiumFn(); return true; }

  // ---------- Save / load calculation history (free, local) ----------
  var HKEY = 'tt_history_';
  function saveCalculation(tool, inputs, summary) {
    var key = HKEY + tool, arr = [];
    try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
    arr.unshift({ t: Date.now(), inputs: inputs, summary: summary });
    if (arr.length > 50) arr = arr.slice(0, 50);
    localStorage.setItem(key, JSON.stringify(arr));
    return arr;
  }
  function getHistory(tool) {
    try { return JSON.parse(localStorage.getItem(HKEY + tool) || '[]'); } catch (e) { return []; }
  }
  function clearHistory(tool) { localStorage.removeItem(HKEY + tool); }

  function renderHistoryPanel(tool, containerId, onLoad) {
    var c = document.getElementById(containerId);
    if (!c) return;
    var arr = getHistory(tool).slice(0, 10);
    if (arr.length === 0) {
      c.innerHTML = '<div class="history-head"><strong>Saved calculations</strong></div>' +
                    '<p class="history-empty">No saved calculations yet. Click 💾 Save in the result box to start.</p>';
      return;
    }
    var rows = arr.map(function (h, i) {
      var d = new Date(h.t);
      var when = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
                 d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return '<li><span class="when">' + when + '</span>' +
             '<span class="summary">' + h.summary + '</span>' +
             '<button type="button" class="history-load" data-i="' + i + '">Load</button>' +
             '<button type="button" class="history-delete" data-i="' + i + '" aria-label="Delete">×</button></li>';
    }).join('');
    c.innerHTML = '<div class="history-head"><strong>Saved calculations</strong> ' +
                  '<button type="button" class="history-clear">Clear all</button></div>' +
                  '<ul class="history-list">' + rows + '</ul>';
    c.querySelector('.history-clear').addEventListener('click', function () {
      if (confirm('Delete all saved calculations for this tool?')) { clearHistory(tool); renderHistoryPanel(tool, containerId, onLoad); }
    });
    c.querySelectorAll('.history-load').forEach(function (btn) {
      btn.addEventListener('click', function () { var i = parseInt(this.dataset.i, 10); if (onLoad) onLoad(arr[i].inputs); });
    });
    c.querySelectorAll('.history-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(this.dataset.i, 10), all = getHistory(tool);
        all.splice(i, 1);
        localStorage.setItem(HKEY + tool, JSON.stringify(all));
        renderHistoryPanel(tool, containerId, onLoad);
      });
    });
  }

  function exportPDF() { window.print(); }

  // Append free "Save" + "Export PDF" buttons to a result box.
  function afterResult(tool, inputs, summary, onLoadFn, historyContainerId) {
    var box = document.querySelector('.result-box.show');
    if (!box) return;
    var actions = box.querySelector('.result-actions');
    if (!actions || actions.querySelector('.btn-save')) return;
    var save = document.createElement('button');
    save.type = 'button'; save.className = 'btn-save'; save.textContent = '💾 Save';
    save.addEventListener('click', function () {
      saveCalculation(tool, inputs, summary);
      save.textContent = '✓ Saved';
      setTimeout(function () { save.textContent = '💾 Save'; }, 1600);
      if (historyContainerId) renderHistoryPanel(tool, historyContainerId, onLoadFn);
    });
    actions.appendChild(save);
    var pdf = document.createElement('button');
    pdf.type = 'button'; pdf.className = 'btn-pdf'; pdf.textContent = '📄 Export PDF';
    pdf.addEventListener('click', exportPDF);
    actions.appendChild(pdf);
  }

  // ---------- Boot ----------
  function init() {
    // Free site: history panels render unlocked; ads stay visible. Nothing to do
    // beyond letting each page render its own history panel via renderHistoryPanel.
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // API surface kept for backwards compatibility with existing tool pages.
  return {
    isPremium: isPremium,
    setPremium: noop, clearPremium: noop, getDaysRemaining: function () { return Infinity; },
    showPremiumBadge: noop, showPremiumBanner: noop,
    showPaywall: noop, hidePaywall: noop, gate: gate,
    hideAds: noop, showAds: noop,
    saveCalculation: saveCalculation, getHistory: getHistory, clearHistory: clearHistory,
    renderHistoryPanel: renderHistoryPanel,
    afterResult: afterResult, exportPDF: exportPDF,
    validateLicense: function () { return Promise.resolve({ valid: false }); },
    LINKS: {}
  };
})();
