/* =======================================================================
   /tools/firebase-config.js — single source of truth for Firebase + IAP.
   Change values here once; every page imports them.
   ======================================================================= */
window.TT_FIREBASE_CONFIG = {
  // REPLACE: paste your Firebase project config (Project Settings → Web app)
  apiKey:            "REPLACE_FIREBASE_API_KEY",
  authDomain:        "REPLACE.firebaseapp.com",
  projectId:         "REPLACE",
  storageBucket:     "REPLACE.appspot.com",
  messagingSenderId: "REPLACE",
  appId:             "REPLACE",
  // RTDB URL needed for the Secret Sharer.
  databaseURL:       "https://REPLACE-default-rtdb.firebaseio.com"
};

// REPLACE: paste your Lemon Squeezy checkout URLs
window.TT_LEMON_SQUEEZY_MONTHLY_LINK = "https://YOUR_LEMON_SQUEEZY_MONTHLY_LINK";
window.TT_LEMON_SQUEEZY_ANNUAL_LINK  = "https://YOUR_LEMON_SQUEEZY_ANNUAL_LINK";

// REPLACE: deployed Cloud Function URL — used as the webhook target in
// Lemon Squeezy dashboard. Surfaced here so the developer can copy-paste
// it during setup; the page itself does not call it.
window.TT_LEMONSQUEEZY_WEBHOOK_URL =
  "https://REGION-PROJECT.cloudfunctions.net/lemonsqueezyWebhook";
