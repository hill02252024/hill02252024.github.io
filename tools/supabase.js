/* =======================================================================
   /tools/supabase.js — minimal backend scaffold (no VPS).
   Auth: magic-link email.
   Subscription state + encrypted history sync.
   Library loaded lazily from CDN; no-op until URL + key are filled in.
   Exposes: window.ttSync
   ======================================================================= */

window.ttSync = (function() {
  // ============================================================
  // CONFIG — replace these two values to enable backend sync.
  // Leave as empty strings to run the site fully offline / static.
  // ============================================================
  var SUPABASE_URL = '';      // e.g. 'https://abcd.supabase.co'
  var SUPABASE_ANON_KEY = '';  // e.g. 'eyJhbGciOiJIUzI1...'

  // ============================================================
  // Required Supabase schema (run once in SQL editor):
  //
  //   create table subscriptions (
  //     user_id uuid primary key references auth.users on delete cascade,
  //     status text not null default 'free',     -- 'free' | 'monthly' | 'annual'
  //     expires_at timestamptz,
  //     ls_subscription_id text,                 -- Lemon Squeezy ref
  //     updated_at timestamptz default now()
  //   );
  //   alter table subscriptions enable row level security;
  //   create policy "users see own sub" on subscriptions
  //     for select using (auth.uid() = user_id);
  //
  //   create table sync_blobs (
  //     user_id uuid not null references auth.users on delete cascade,
  //     kind text not null,                      -- 'vault' | 'history_<tool>' | 'settings'
  //     ciphertext text not null,                -- AES-GCM base64
  //     iv text not null,
  //     updated_at timestamptz default now(),
  //     primary key (user_id, kind)
  //   );
  //   alter table sync_blobs enable row level security;
  //   create policy "users CRUD own blobs" on sync_blobs
  //     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  //
  // Edge function `lemonsqueezy-webhook` should:
  //   - verify HMAC signature header
  //   - upsert subscriptions row for matching email
  //   - handle subscription_created / cancelled / expired events
  // ============================================================

  var supabase = null;
  var listeners = [];

  function isConfigured() { return !!(SUPABASE_URL && SUPABASE_ANON_KEY); }

  // ============================================================
  // Lazy SDK loader. Returns a promise resolving to the supabase client.
  // ============================================================
  function getClient() {
    if (!isConfigured()) return Promise.reject(new Error('Supabase not configured'));
    if (supabase) return Promise.resolve(supabase);
    return new Promise(function(resolve, reject) {
      if (window.supabase && window.supabase.createClient) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        wireAuthListener(); resolve(supabase); return;
      }
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.async = true;
      script.onload = function() {
        try {
          supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
          wireAuthListener(); resolve(supabase);
        } catch (e) { reject(e); }
      };
      script.onerror = function() { reject(new Error('Failed to load Supabase SDK')); };
      document.head.appendChild(script);
    });
  }

  function wireAuthListener() {
    if (!supabase || !supabase.auth) return;
    supabase.auth.onAuthStateChange(function(event, session) {
      listeners.forEach(function(fn) { try { fn(event, session); } catch (e) {} });
      if (session && session.user) {
        // On sign-in, pull subscription status from server.
        syncSubscription();
      } else if (event === 'SIGNED_OUT') {
        // Don't touch local Premium — the user may still be Premium via localStorage.
      }
    });
  }
  function onAuthChange(fn) { listeners.push(fn); }

  // ============================================================
  // Auth — magic link sign-in / sign-out / current user.
  // ============================================================
  function signInWithEmail(email) {
    return getClient().then(function(c) {
      return c.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: location.origin + location.pathname }
      });
    });
  }
  function signInWithGoogle() {
    return getClient().then(function(c) {
      return c.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname }
      });
    });
  }
  function signOut() {
    return getClient().then(function(c) { return c.auth.signOut(); });
  }
  function getUser() {
    if (!isConfigured()) return Promise.resolve(null);
    return getClient().then(function(c) { return c.auth.getUser(); })
      .then(function(r) { return r.data && r.data.user; })
      .catch(function() { return null; });
  }

  // ============================================================
  // Subscription state — server -> local cache (ttPremium).
  // ============================================================
  function syncSubscription() {
    return getUser().then(function(user) {
      if (!user) return null;
      return supabase.from('subscriptions').select('status, expires_at').eq('user_id', user.id).single()
        .then(function(r) {
          var sub = r.data;
          if (!sub || sub.status === 'free') {
            if (window.ttPremium) ttPremium.clearPremium();
            return null;
          }
          var expiry = sub.expires_at ? new Date(sub.expires_at).getTime() : Date.now() + 30*86400000;
          if (window.ttPremium) ttPremium.setPremium(user.email, expiry);
          return sub;
        })
        .catch(function() { return null; });
    });
  }

  // ============================================================
  // Encrypted sync — AES-GCM with a passphrase only the user knows.
  // The server only stores ciphertext. Zero-knowledge sync.
  // ============================================================
  function deriveKey(passphrase, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
      .then(function(km) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: enc.encode(salt), iterations: 250000, hash: 'SHA-256' },
          km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
      });
  }
  function b64(buf) {
    var bytes = new Uint8Array(buf); var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function fromB64(str) {
    var s = atob(str); var arr = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
    return arr;
  }
  function encrypt(plaintext, passphrase, saltSeed) {
    return deriveKey(passphrase, saltSeed).then(function(key) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      var enc = new TextEncoder().encode(plaintext);
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc)
        .then(function(ct) { return { ciphertext: b64(ct), iv: b64(iv) }; });
    });
  }
  function decrypt(ciphertext, ivB64, passphrase, saltSeed) {
    return deriveKey(passphrase, saltSeed).then(function(key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ciphertext))
        .then(function(pt) { return new TextDecoder().decode(pt); });
    });
  }

  // Public helpers: client encrypts before upload, decrypts after fetch.
  function upsertBlob(kind, plaintext, passphrase) {
    return getUser().then(function(user) {
      if (!user) throw new Error('Not signed in');
      return encrypt(plaintext, passphrase, user.id).then(function(payload) {
        return supabase.from('sync_blobs').upsert({
          user_id: user.id, kind: kind,
          ciphertext: payload.ciphertext, iv: payload.iv,
          updated_at: new Date().toISOString()
        });
      });
    });
  }
  function fetchBlob(kind, passphrase) {
    return getUser().then(function(user) {
      if (!user) throw new Error('Not signed in');
      return supabase.from('sync_blobs').select('ciphertext, iv').eq('user_id', user.id).eq('kind', kind).single()
        .then(function(r) {
          if (!r.data) return null;
          return decrypt(r.data.ciphertext, r.data.iv, passphrase, user.id);
        });
    });
  }

  // ============================================================
  // UI helpers — render a sign-in / sync card into a container.
  // ============================================================
  function renderSyncCard(containerId, opts) {
    var c = document.getElementById(containerId);
    if (!c) return;
    if (!isConfigured()) {
      c.innerHTML =
        '<div class="sync-card"><h3>☁️ Cross-device sync</h3>' +
        '<p>Backend not configured yet. Drop a Supabase URL + anon key into <code>/tools/supabase.js</code> to enable sign-in.</p></div>';
      return;
    }
    getUser().then(function(user) {
      if (user) {
        c.innerHTML =
          '<div class="sync-card signed-in">' +
            '<h3>☁️ Signed in</h3>' +
            '<p>Synced as <span class="signed-email">' + user.email + '</span>. Your subscription and ' +
            (opts && opts.kind ? opts.kind : 'history') + ' are kept up to date across devices.</p>' +
            '<button type="button" id="syncSignOut">Sign out</button>' +
          '</div>';
        document.getElementById('syncSignOut').addEventListener('click', function() {
          signOut().then(function() { renderSyncCard(containerId, opts); });
        });
      } else {
        c.innerHTML =
          '<div class="sync-card">' +
            '<h3>☁️ Sync across devices</h3>' +
            '<p>Sign in with a magic link to back up your history end-to-end encrypted. We never see your data.</p>' +
            '<div class="sync-row">' +
              '<input type="email" id="syncEmail" placeholder="you@example.com" autocomplete="email" />' +
              '<button type="button" id="syncSend">Send link</button>' +
            '</div>' +
            '<p id="syncStatus" style="margin-top:8px;font-size:12.5px"></p>' +
          '</div>';
        document.getElementById('syncSend').addEventListener('click', function() {
          var email = document.getElementById('syncEmail').value.trim();
          if (!/@/.test(email)) { document.getElementById('syncStatus').textContent = 'Please enter a valid email.'; return; }
          document.getElementById('syncStatus').textContent = 'Sending…';
          signInWithEmail(email).then(function() {
            document.getElementById('syncStatus').textContent = '✓ Check your email for the magic link.';
          }).catch(function(e) {
            document.getElementById('syncStatus').textContent = '⚠ ' + (e.message || 'Failed to send.');
          });
        });
      }
    });
  }

  return {
    isConfigured: isConfigured,
    getClient: getClient,
    signInWithEmail: signInWithEmail,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getUser: getUser,
    onAuthChange: onAuthChange,
    syncSubscription: syncSubscription,
    upsertBlob: upsertBlob,
    fetchBlob: fetchBlob,
    encrypt: encrypt,
    decrypt: decrypt,
    renderSyncCard: renderSyncCard
  };
})();
