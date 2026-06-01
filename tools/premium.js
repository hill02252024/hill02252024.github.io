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
    // Production restore — validates against Lemon Squeezy license keys API.
    // REPLACE: optionally add your Lemon Squeezy store ID check inside validateLicense().
    modal.querySelector('.paywall-restore').addEventListener('click', function(e) {
      e.preventDefault();
      var key = prompt('Enter your license key (sent by email after purchase):');
      if (!key) return;
      key = key.trim();
      if (!key) return;
      var restoreLink = modal.querySelector('.paywall-restore');
      var oldHtml = restoreLink.innerHTML;
      restoreLink.textContent = 'Verifying license…';
      validateLicense(key).then(function(res){
        if (res && res.valid) {
          setPremium(res.email || '', res.expiresAt || (Date.now() + 365*86400000));
          alert('🎉 License validated. Premium is now active on this device.');
          hidePaywall();
          location.reload();
        } else {
          restoreLink.innerHTML = oldHtml;
          alert(res && res.error ? res.error : 'License key not found or expired. Please check your email.');
        }
      }).catch(function(){
        restoreLink.innerHTML = oldHtml;
        alert('Could not verify license — please try again or contact support.');
      });
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

  // ---------- E2E Premium chain helpers ----------
  // Lemon Squeezy License Keys API — https://docs.lemonsqueezy.com/api/license-api
  function validateLicense(licenseKey) {
    return fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'license_key=' + encodeURIComponent(licenseKey) +
            '&instance_name=' + encodeURIComponent('todays-tasks-web-' + (Date.now() % 100000))
    }).then(function(r){ return r.json().catch(function(){ return null; }); })
      .then(function(j){
        if (!j) return { valid: false, error: 'Invalid response from license server.' };
        if (j.valid !== true) return { valid: false, error: j.error || 'License key not found or expired.' };
        // OPTIONAL: enforce store id
        // if (j.meta && j.meta.store_id !== YOUR_STORE_ID) return { valid: false, error: 'Wrong store.' };
        var exp = 0;
        if (j.license_key && j.license_key.expires_at) {
          var t = Date.parse(j.license_key.expires_at);
          if (!isNaN(t)) exp = t;
        }
        if (!exp) exp = Date.now() + 365 * 86400000; // lifetime → grant 1y
        return { valid: true, email: (j.meta && j.meta.customer_email) || '', expiresAt: exp };
      });
  }

  function ensureExpiryBanner() {
    if (!isPremium()) return;
    var exp = parseInt(localStorage.getItem(KEYS.expiry) || '0', 10);
    if (!exp) return;
    var days = Math.ceil((exp - Date.now()) / 86400000);
    if (days > 7 || days <= 0) return;
    if (document.getElementById('ttExpiryBanner')) return;
    var bar = document.createElement('div');
    bar.id = 'ttExpiryBanner';
    bar.className = 'tt-expiry-banner';
    bar.innerHTML = 'Your Premium expires in <strong>' + days + ' day' + (days === 1 ? '' : 's') +
                    '</strong> — renew to keep your benefits. ' +
                    '<a href="' + LINKS.annual + '" class="tt-renew">Renew Now</a>';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function handleSuccessRedirect() {
    var p = new URLSearchParams(location.search);
    if (p.get('success') !== 'true') return;
    var email = p.get('email') || '';
    // Show welcome
    var box = document.createElement('div');
    box.className = 'tt-welcome-modal';
    box.innerHTML = '<div class="tt-welcome-card">' +
                    '<h2>🎉 Welcome to Premium!</h2>' +
                    '<p>Your account is now active. Enter the license key from your purchase email to finalise:</p>' +
                    '<input id="ttWelcomeKey" placeholder="License key" />' +
                    '<button id="ttWelcomeGo" class="btn-plan">Activate Premium</button>' +
                    '<button id="ttWelcomeSkip" class="btn-plan outline">Maybe later</button>' +
                    '<p class="tt-welcome-msg" id="ttWelcomeMsg"></p>' +
                    '</div>';
    document.body.appendChild(box);
    var msg = box.querySelector('#ttWelcomeMsg');
    box.querySelector('#ttWelcomeSkip').addEventListener('click', function(){ box.remove(); });
    box.querySelector('#ttWelcomeGo').addEventListener('click', function(){
      var k = box.querySelector('#ttWelcomeKey').value.trim();
      if (!k) return;
      msg.textContent = 'Verifying…';
      validateLicense(k).then(function(res){
        if (res && res.valid) {
          setPremium(res.email || email, res.expiresAt || (Date.now() + 365*86400000));
          msg.textContent = 'Activated. Reloading…';
          setTimeout(function(){ location.reload(); }, 800);
        } else {
          msg.textContent = (res && res.error) || 'License not found or expired.';
        }
      }).catch(function(){ msg.textContent = 'Network error — try again.'; });
    });
    // Strip query params
    var clean = location.pathname + location.hash;
    history.replaceState(null, '', clean);
  }

  function checkExpiryAndSync() {
    var exp = parseInt(localStorage.getItem(KEYS.expiry) || '0', 10);
    if (exp > 0 && Date.now() > exp) {
      clearPremium();
      console.log('[ttPremium] Subscription expired — reverted to free tier.');
    }
    // Firebase passthrough (no-op until config is filled in)
    try {
      var hasFb = window.TT_FIREBASE_CONFIG &&
                  !/REPLACE/.test(window.TT_FIREBASE_CONFIG.apiKey || '');
      if (hasFb && window.ttAuth && window.ttAuth.syncPremium) {
        window.ttAuth.syncPremium();
      }
    } catch (e) {}
  }

  // ---------- Boot ----------
  function init() {
    ensurePaywall();
    checkExpiryAndSync();
    handleSuccessRedirect();
    if (isPremium()) {
      hideAds();
      showPremiumBanner();
      showPremiumBadge();
      ensureExpiryBanner();
    } else {
      showAds();
    }
    // Dev-only diagnostic
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      console.log('[ttPremium] Premium:', isPremium(),
                  '· ads hidden:', document.body.classList.contains('ads-hidden'));
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
    validateLicense: validateLicense,
    LINKS: LINKS
  };
})();
