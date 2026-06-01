/* =======================================================================
   /tools/firebase.js — Firebase free-tier scaffold.

   Exposes:
     window.ttAuth     auth + premium + encrypted sync
     window.ttSecrets  secret-share RTDB API

   Loads Firebase v10 compat from CDN on first use.
   No-ops gracefully until firebase-config.js has real values.
   ======================================================================= */
(function () {
  "use strict";

  // -------- lazy CDN loader --------
  var CDN = "https://www.gstatic.com/firebasejs/10.12.5/";
  var SDK = ["firebase-app-compat.js", "firebase-auth-compat.js",
             "firebase-firestore-compat.js", "firebase-database-compat.js"];
  var _ready;
  function load() {
    if (_ready) return _ready;
    var cfg = window.TT_FIREBASE_CONFIG || {};
    if (!cfg.apiKey || /REPLACE/.test(cfg.apiKey)) {
      _ready = Promise.reject(new Error("firebase-config.js not filled in"));
      return _ready;
    }
    _ready = SDK.reduce(function (chain, name) {
      return chain.then(function () {
        return new Promise(function (res, rej) {
          var s = document.createElement("script");
          s.src = CDN + name; s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      return firebase;
    });
    return _ready;
  }

  // -------- crypto helpers (AES-GCM, all in-browser) --------
  function buf2b64(buf) {
    var b = ""; var a = new Uint8Array(buf);
    for (var i = 0; i < a.length; i++) b += String.fromCharCode(a[i]);
    return btoa(b);
  }
  function b642buf(b64) {
    var bin = atob(b64); var a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a.buffer;
  }
  function deriveKey(passphrase) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(passphrase),
      "PBKDF2", false, ["deriveKey"]).then(function (km) {
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode("tt-sync-v1"),
          iterations: 250000, hash: "SHA-256" },
        km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  function encryptString(plaintext, passphrase) {
    return deriveKey(passphrase).then(function (key) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      var enc = new TextEncoder().encode(plaintext);
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc)
        .then(function (ct) { return { ciphertext: buf2b64(ct), iv: buf2b64(iv) }; });
    });
  }
  function decryptString(ciphertext, ivB64, passphrase) {
    return deriveKey(passphrase).then(function (key) {
      return crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(b642buf(ivB64)) },
        key, b642buf(ciphertext));
    }).then(function (buf) { return new TextDecoder().decode(buf); });
  }

  // =====================================================================
  // ttAuth
  // =====================================================================
  var authListeners = [];
  var lastUser = null;

  function getUser() { return lastUser; }

  function onAuthChange(cb) {
    authListeners.push(cb);
    try { cb(lastUser); } catch (e) {}
    return function () {
      authListeners = authListeners.filter(function (l) { return l !== cb; });
    };
  }

  function fireAuth(u) {
    lastUser = u;
    authListeners.forEach(function (l) { try { l(u); } catch (e) {} });
  }

  function ensureAuthBound() {
    return load().then(function (fb) {
      if (!ensureAuthBound._bound) {
        ensureAuthBound._bound = true;
        fb.auth().onAuthStateChanged(function (u) {
          fireAuth(u || null);
          if (u) syncPremium();
        });
      }
      return fb;
    });
  }

  function sendMagicLink(email) {
    return ensureAuthBound().then(function (fb) {
      var settings = {
        url: location.origin + location.pathname + "?elFinish=1",
        handleCodeInApp: true
      };
      return fb.auth().sendSignInLinkToEmail(email, settings).then(function () {
        try { localStorage.setItem("tt_pending_email", email); } catch (e) {}
        return { ok: true };
      });
    });
  }

  function maybeCompleteMagicLink() {
    return ensureAuthBound().then(function (fb) {
      if (!fb.auth().isSignInWithEmailLink(location.href)) return null;
      var email = "";
      try { email = localStorage.getItem("tt_pending_email") || ""; } catch (e) {}
      if (!email) email = prompt("Please confirm your email for sign-in:") || "";
      if (!email) return null;
      return fb.auth().signInWithEmailLink(email, location.href).then(function (r) {
        try { localStorage.removeItem("tt_pending_email"); } catch (e) {}
        return r.user;
      });
    });
  }

  function signInWithGoogle() {
    return ensureAuthBound().then(function (fb) {
      var p = new fb.auth.GoogleAuthProvider();
      return fb.auth().signInWithPopup(p).then(function (r) { return r.user; });
    });
  }

  function signOut() {
    return ensureAuthBound().then(function (fb) { return fb.auth().signOut(); });
  }

  // ------- Premium / subscriptions -------
  var PREM_KEY = "tt_premium";
  var PREM_EXPIRY = "tt_premium_expiry";

  function setLocalPremium(on, expiresAtMs) {
    try {
      if (on) {
        localStorage.setItem(PREM_KEY, "1");
        if (expiresAtMs) localStorage.setItem(PREM_EXPIRY, String(expiresAtMs));
        document.body.classList.add("ads-hidden");
      } else {
        localStorage.removeItem(PREM_KEY);
        localStorage.removeItem(PREM_EXPIRY);
        document.body.classList.remove("ads-hidden");
      }
    } catch (e) {}
  }

  function isPremium() {
    try {
      if (localStorage.getItem(PREM_KEY) !== "1") return false;
      var exp = parseInt(localStorage.getItem(PREM_EXPIRY) || "0", 10);
      if (exp > 0 && Date.now() > exp) { setLocalPremium(false); return false; }
      return true;
    } catch (e) { return false; }
  }

  function syncPremium() {
    return ensureAuthBound().then(function (fb) {
      var u = fb.auth().currentUser; if (!u) return null;
      return fb.firestore().collection("subscriptions").doc(u.uid).get();
    }).then(function (snap) {
      if (!snap || !snap.exists) { setLocalPremium(false); return null; }
      var d = snap.data() || {};
      var active = d.status === "premium" || d.status === "active";
      var exp = d.expiresAt ? (d.expiresAt.toMillis ? d.expiresAt.toMillis()
                                                    : Number(d.expiresAt)) : 0;
      if (active && (!exp || exp > Date.now())) {
        setLocalPremium(true, exp);
      } else {
        setLocalPremium(false);
      }
      return d;
    }).catch(function () { return null; });
  }

  // ------- Encrypted sync blobs -------
  function saveBlob(kind, plaintext, passphrase) {
    return ensureAuthBound().then(function (fb) {
      var u = fb.auth().currentUser;
      if (!u) return Promise.reject(new Error("sign in first"));
      return encryptString(plaintext, passphrase).then(function (b) {
        return fb.firestore()
          .collection("sync").doc(u.uid)
          .collection("blobs").doc(kind)
          .set({
            ciphertext: b.ciphertext, iv: b.iv,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
      });
    });
  }

  function loadBlob(kind, passphrase) {
    return ensureAuthBound().then(function (fb) {
      var u = fb.auth().currentUser;
      if (!u) return Promise.reject(new Error("sign in first"));
      return fb.firestore().collection("sync").doc(u.uid)
        .collection("blobs").doc(kind).get();
    }).then(function (snap) {
      if (!snap.exists) return null;
      var d = snap.data();
      return decryptString(d.ciphertext, d.iv, passphrase);
    });
  }

  // ------- drop-in sign-in card -------
  function renderSignInCard(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML =
      '<div class="tt-signin">' +
      '  <h3>Sign in to sync</h3>' +
      '  <p>Get a magic link by email — no password to remember.</p>' +
      '  <input type="email" id="tt-signin-email" placeholder="you@example.com" autocomplete="email" />' +
      '  <button type="button" id="tt-signin-send">Send magic link</button>' +
      '  <p class="tt-or">or</p>' +
      '  <button type="button" id="tt-signin-google">Continue with Google</button>' +
      '  <p class="tt-msg" id="tt-signin-msg" role="status"></p>' +
      '</div>';
    var msg = el.querySelector("#tt-signin-msg");
    el.querySelector("#tt-signin-send").addEventListener("click", function () {
      var e = (el.querySelector("#tt-signin-email").value || "").trim();
      if (!e) { msg.textContent = "Enter your email."; return; }
      msg.textContent = "Sending…";
      sendMagicLink(e).then(function () {
        msg.textContent = "Magic link sent. Check your inbox.";
      }).catch(function (err) { msg.textContent = err.message || "Failed."; });
    });
    el.querySelector("#tt-signin-google").addEventListener("click", function () {
      msg.textContent = "Opening Google…";
      signInWithGoogle().then(function () { msg.textContent = "Signed in."; })
        .catch(function (err) { msg.textContent = err.message || "Failed."; });
    });
  }

  window.ttAuth = {
    sendMagicLink: sendMagicLink,
    maybeCompleteMagicLink: maybeCompleteMagicLink,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getUser: getUser,
    onAuthChange: onAuthChange,
    isPremium: isPremium,
    syncPremium: syncPremium,
    saveBlob: saveBlob,
    loadBlob: loadBlob,
    renderSignInCard: renderSignInCard,
    _crypto: { encryptString: encryptString, decryptString: decryptString }
  };

  // Auto-complete email-link sign-in on every page load.
  if (location.search.indexOf("apiKey=") !== -1 ||
      location.search.indexOf("elFinish=1") !== -1) {
    try { maybeCompleteMagicLink(); } catch (e) {}
  }

  // =====================================================================
  // ttSecrets — Firebase Realtime Database for ephemeral ciphertext.
  //
  // Path:   secrets/{id}
  // Fields: ciphertext, iv, expiresAt (ms), viewCount, maxViews
  // Rules (set in Firebase console):
  //   { "rules": {
  //       "secrets": {
  //         "$id": {
  //           ".read":  "data.child('expiresAt').val() > now &&
  //                      data.child('viewCount').val() < data.child('maxViews').val()",
  //           ".write": "!data.exists() || (auth == null && newData.exists())"
  //         }
  //       }
  //   } }
  //
  // TTL: Firebase RTDB has no native TTL. The Cloud Function
  //      `purgeExpiredSecrets` (functions/index.js) runs hourly and
  //      removes records where expiresAt < now.
  // =====================================================================
  function nano(len) {
    var alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var out = ""; var arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    for (var i = 0; i < len; i++) out += alpha[arr[i] % alpha.length];
    return out;
  }

  function createSecret(ciphertext, iv, ttlHours, maxViews) {
    return load().then(function (fb) {
      var id = nano(16);
      var rec = {
        ciphertext: ciphertext,
        iv: iv,
        expiresAt: Date.now() + Math.max(1, ttlHours) * 3600 * 1000,
        viewCount: 0,
        maxViews: Math.max(1, maxViews || 1),
        createdAt: Date.now()
      };
      return fb.database().ref("secrets/" + id).set(rec)
        .then(function () { return id; });
    });
  }

  function readSecret(id) {
    return load().then(function (fb) {
      var ref = fb.database().ref("secrets/" + id);
      return ref.once("value").then(function (snap) {
        var d = snap.val();
        if (!d) return null;
        if (d.expiresAt < Date.now()) { ref.remove(); return null; }
        if (d.viewCount >= d.maxViews) { ref.remove(); return null; }
        var nextCount = d.viewCount + 1;
        return ref.update({ viewCount: nextCount, lastReadAt: Date.now() })
          .then(function () {
            if (nextCount >= d.maxViews) ref.remove();
            return { ciphertext: d.ciphertext, iv: d.iv,
                     viewCount: nextCount, maxViews: d.maxViews,
                     expiresAt: d.expiresAt };
          });
      });
    });
  }

  function deleteSecret(id) {
    return load().then(function (fb) {
      return fb.database().ref("secrets/" + id).remove();
    });
  }

  window.ttSecrets = {
    createSecret: createSecret,
    readSecret: readSecret,
    deleteSecret: deleteSecret,
    _nano: nano
  };
})();
