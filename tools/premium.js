/* =======================================================================
   /tools/premium.js — shared Premium subscription system.
   - localStorage-based access (no backend yet)
   - Paywall modal auto-injected on every page
   - Ad hiding for Premium users
   - Save / load calculation history
   - Print-friendly PDF export
   Exposes: window.ttPremium
   ======================================================================= */

window.ttPremium = (function() {
  var KEYS = {
    premium: 'tt_premium',
    email:   'tt_premium_email',
    expiry:  'tt_premium_expiry',
    history: 'tt_history_'
  };

  // <!-- REPLACE below URLs with real Lemon Squeezy checkout links -->
  var LINKS = {
    monthly: 'https://YOUR_LEMON_SQUEEZY_MONTHLY_LINK',
    annual:  'https://YOUR_LEMON_SQUEEZY_ANNUAL_LINK'
  };

  // ---------- A) Subscription state ----------
  function isPremium() {
    if (localStorage.getItem(KEYS.premium) !== '1') return false;
    var exp = parseInt(localStorage.getItem(KEYS.expiry) || '0', 10);
    if (exp > 0 && Date.now() > exp) { clearPremium(); return false; }
    return true;
  }
  function setPremium(email, expiryMs) {
    localStorage.setItem(KEYS.premium, '1');
    if (email) localStorage.setItem(KEYS.email, email);
    if (expiryMs) localStorage.setItem(KEYS.expiry, String(expiryMs));
  }
  function clearPremium() {
    localStorage.removeItem(KEYS.premium);
    localStorage.removeItem(KEYS.email);
    localStorage.removeItem(KEYS.expiry);
  }
  function getDaysRemaining() {
    var exp = parseInt(localStorage.getItem(KEYS.expiry) || '0', 10);
    if (!exp) return Infinity;
    return Math.max(0, Math.ceil((exp - Date.now()) / 86400000));
  }

  // ---------- B) UI injection ----------
  function showPremiumBadge() {
    var h1 = document.querySelector('.tool-page h1');
    if (!h1 || h1.querySelector('.premium-badge')) return;
    var b = document.createElement('span');
    b.className = 'premium-badge';
    b.textContent = 'PRO';
    h1.appendChild(document.createTextNode(' '));
    h1.appendChild(b);
  }
  function showPremiumBanner() {
    if (document.querySelector('.premium-banner')) return;
    var days = getDaysRemaining();
    var daysTxt = isFinite(days) ? ' · ' + days + ' day' + (days === 1 ? '' : 's') + ' left' : '';
    var banner = document.createElement('div');
    banner.className = 'premium-banner';
    banner.innerHTML = '<span>✨ <strong>You\'re on Premium</strong> — no ads, full features' + daysTxt + '</span>' +
                       '<button type="button" class="premium-logout">Sign out</button>';
    document.body.insertBefore(banner, document.body.firstChild);
    banner.querySelector('.premium-logout').addEventListener('click', function() {
      if (confirm('Sign out of Premium on this device?')) { clearPremium(); location.reload(); }
    });
  }

  // ---------- C) Paywall modal ----------
  function ensurePaywall() {
    if (document.getElementById('paywallModal')) return;
    var html =
      '<div id="paywallModal" class="paywall-overlay" hidden>' +
        '<div class="paywall-card" role="dialog" aria-modal="true" aria-labelledby="paywallTitle">' +
          '<button type="button" class="paywall-close" aria-label="Close">×</button>' +
          '<h2 id="paywallTitle">Unlock <span class="paywall-feature">Premium</span></h2>' +
          '<p class="paywall-sub">Upgrade to Premium for full access to all tools.</p>' +
          '<div class="plan-cards">' +
            '<div class="plan-card">' +
              '<div class="plan-name">Monthly</div>' +
              '<div class="price">$3.99</div>' +
              '<div class="period">per month</div>' +
              '<a class="btn-plan" href="' + LINKS.monthly + '">Start Monthly</a>' +
            '</div>' +
            '<div class="plan-card featured">' +
              '<div class="plan-badge">Best Value</div>' +
              '<div class="plan-name">Annual</div>' +
              '<div class="price">$29.99</div>' +
              '<div class="period">$2.50/mo · save 37%</div>' +
              '<a class="btn-plan outline" href="' + LINKS.annual + '">Start Annual</a>' +
            '</div>' +
          '</div>' +
          '<ul class="plan-features">' +
            '<li>✓ No ads</li><li>✓ Save history</li><li>✓ Compare multiple</li>' +
            '<li>✓ PDF export</li><li>✓ All 10 tools</li>' +
          '</ul>' +
          '<p class="paywall-fineprint">Cancel anytime. Secure payment via Lemon Squeezy.</p>' +
          '<p class="paywall-fineprint"><a href="#" class="paywall-restore">I already paid — restore access</a></p>' +
        '</div>' +
      '</div>';
    var wrap = document.createElement('div'); wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
    var modal = document.getElementById('paywallModal');
    modal.querySelector('.paywall-close').addEventListener('click', hidePaywall);
    modal.addEventListener('click', function(e) { if (e.target === modal) hidePaywall(); });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !modal.hidden) hidePaywall();
    });
    // Demo "restore" — accepts any email; in production wire to Lemon Squeezy license API.
    modal.querySelector('.paywall-restore').addEventListener('click', function(e) {
      e.preventDefault();
      var email = prompt('Email used for purchase:');
      if (email && /@/.test(email)) {
        setPremium(email, Date.now() + 365 * 86400000);
        hidePaywall();
        location.reload();
      } else if (email) {
        alert('Please enter a valid email.');
      }
    });
  }
  function showPaywall(featureName) {
    ensurePaywall();
    var modal = document.getElementById('paywallModal');
    modal.querySelector('.paywall-feature').textContent = featureName || 'Premium';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function hidePaywall() {
    var modal = document.getElementById('paywallModal');
    if (modal) { modal.hidden = true; document.body.style.overflow = ''; }
  }
  // Click-through helper for free users hitting a locked feature.
  function gate(featureName, premiumFn) {
    if (isPremium()) { premiumFn(); return true; }
    showPaywall(featureName); return false;
  }

  // ---------- D) Ad control ----------
  function hideAds() { document.body.classList.add('ads-hidden'); }
  function showAds() { document.body.classList.remove('ads-hidden'); }

  // ---------- E) Save / load history ----------
  function saveCalculation(tool, inputs, summary) {
    var key = KEYS.history + tool;
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
    arr.unshift({ t: Date.now(), inputs: inputs, summary: summary });
    if (arr.length > 50) arr = arr.slice(0, 50);
    localStorage.setItem(key, JSON.stringify(arr));
    return arr;
  }
  function getHistory(tool) {
    try { return JSON.parse(localStorage.getItem(KEYS.history + tool) || '[]'); }
    catch(e) { return []; }
  }
  function clearHistory(tool) { localStorage.removeItem(KEYS.history + tool); }
  function renderHistoryPanel(tool, containerId, onLoad) {
    var c = document.getElementById(containerId);
    if (!c) return;
    if (!isPremium()) {
      c.innerHTML =
        '<div class="history-locked">' +
          '<h3>💾 Save calculation history</h3>' +
          '<p>Keep a record of every scenario and load it back with one click.</p>' +
          '<button type="button" class="btn-upgrade">Unlock with Premium</button>' +
        '</div>';
      c.querySelector('.btn-upgrade').addEventListener('click', function() {
        showPaywall('Save History');
      });
      return;
    }
    var arr = getHistory(tool).slice(0, 10);
    if (arr.length === 0) {
      c.innerHTML = '<div class="history-head"><strong>Saved calculations</strong></div><p class="history-empty">No saved calculations yet. Click 💾 Save in the result box to start.</p>';
      return;
    }
    var rows = arr.map(function(h, i) {
      var d = new Date(h.t);
      var when = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
                 d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return '<li><span class="when">' + when + '</span>' +
             '<span class="summary">' + h.summary + '</span>' +
             '<button type="button" class="history-load" data-i="' + i + '">Load</button>' +
             '<button type="button" class="history-delete" data-i="' + i + '" aria-label="Delete">×</button></li>';
    }).join('');
    c.innerHTML = '<div class="history-head"><strong>Saved calculations</strong> <button type="button" class="history-clear">Clear all</button></div>' +
                  '<ul class="history-list">' + rows + '</ul>';
    c.querySelector('.history-clear').addEventListener('click', function() {
      if (confirm('Delete all saved calculations for this tool?')) {
        clearHistory(tool); renderHistoryPanel(tool, containerId, onLoad);
      }
    });
    c.querySelectorAll('.history-load').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var i = parseInt(this.dataset.i, 10);
        if (onLoad) onLoad(arr[i].inputs);
      });
    });
    c.querySelectorAll('.history-delete').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var i = parseInt(this.dataset.i, 10);
        var all = getHistory(tool);
        all.splice(i, 1);
        localStorage.setItem(KEYS.history + tool, JSON.stringify(all));
        renderHistoryPanel(tool, containerId, onLoad);
      });
    });
  }

  // ---------- Hooks for tool pages ----------
  // Call from each tool's calcBtn handler RIGHT AFTER tt.showResult().
  // Appends "💾 Save" and "📄 Export PDF" buttons to .result-actions.
  function afterResult(tool, inputs, summary, onLoadFn, historyContainerId) {
    var box = document.querySelector('.result-box.show');
    if (!box) return;
    var actions = box.querySelector('.result-actions');
    if (!actions || actions.querySelector('.btn-save')) return;
    // Save button
    var save = document.createElement('button');
    save.type = 'button'; save.className = 'btn-save';
    save.textContent = '💾 Save';
    save.addEventListener('click', function() {
      if (!isPremium()) { showPaywall('Save History'); return; }
      saveCalculation(tool, inputs, summary);
      save.textContent = '✓ Saved';
      setTimeout(function() { save.textContent = '💾 Save'; }, 1600);
      if (historyContainerId) renderHistoryPanel(tool, historyContainerId, onLoadFn);
    });
    actions.appendChild(save);
    // Export PDF button
    var pdf = document.createElement('button');
    pdf.type = 'button'; pdf.className = 'btn-pdf';
    pdf.textContent = '📄 Export PDF';
    pdf.addEventListener('click', function() {
      if (!isPremium()) { showPaywall('PDF Export'); return; }
      exportPDF();
    });
    actions.appendChild(pdf);
  }

  function exportPDF() {
    // Print stylesheet hides nav/ads/buttons; user picks "Save as PDF" in dialog.
    window.print();
  }

  // ---------- Boot ----------
  function init() {
    ensurePaywall();
    if (isPremium()) {
      hideAds();
      showPremiumBanner();
      showPremiumBadge();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    isPremium: isPremium, setPremium: setPremium, clearPremium: clearPremium,
    getDaysRemaining: getDaysRemaining,
    showPremiumBadge: showPremiumBadge, showPremiumBanner: showPremiumBanner,
    showPaywall: showPaywall, hidePaywall: hidePaywall, gate: gate,
    hideAds: hideAds, showAds: showAds,
    saveCalculation: saveCalculation, getHistory: getHistory, clearHistory: clearHistory,
    renderHistoryPanel: renderHistoryPanel,
    afterResult: afterResult, exportPDF: exportPDF,
    LINKS: LINKS
  };
})();
