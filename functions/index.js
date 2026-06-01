/* =======================================================================
   functions/index.js — Firebase Cloud Functions (free tier).

   Two functions:
     1) lemonsqueezyWebhook  — verify HMAC + upsert subscriptions doc.
     2) purgeExpiredSecrets  — hourly cron that removes expired RTDB
                               records under /secrets/{id}.

   Deploy:
     cd functions && npm install && firebase deploy --only functions

   Required Firebase config:
     firebase functions:config:set \
       lemonsqueezy.webhook_secret="REPLACE_LEMON_SQUEEZY_WEBHOOK_SECRET"

   Set the webhook URL in the Lemon Squeezy dashboard:
     https://REGION-PROJECT.cloudfunctions.net/lemonsqueezyWebhook
   ======================================================================= */
const functions = require("firebase-functions");
const admin     = require("firebase-admin");
const crypto    = require("crypto");

admin.initializeApp();
const db  = admin.firestore();
const rtdb = admin.database();

// ---------- helpers ----------
function verifySignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  // timingSafeEqual requires equal-length Buffers
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function pickUserId(payload) {
  // Lemon Squeezy stores Firebase uid as `custom_data.uid` (set when
  // building the checkout URL: ?checkout[custom][uid]=<firebase-uid>).
  const attrs   = payload?.data?.attributes || {};
  const custom  = attrs?.first_subscription_item?.subscription_id
                  ? attrs?.custom_data || {}
                  : attrs?.custom_data || {};
  return custom.uid || attrs.user_email || null;
}

// =====================================================================
// 1) Lemon Squeezy webhook
// =====================================================================
exports.lemonsqueezyWebhook = functions
  .runWith({ memory: "256MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("POST only");

    // REPLACE: add LEMON_SQUEEZY_WEBHOOK_SECRET via:
    //   firebase functions:config:set lemonsqueezy.webhook_secret="..."
    const secret =
      (functions.config().lemonsqueezy && functions.config().lemonsqueezy.webhook_secret) ||
      process.env.LEMON_SQUEEZY_WEBHOOK_SECRET ||
      "";

    const raw = req.rawBody ? req.rawBody.toString("utf8")
                            : JSON.stringify(req.body || {});
    const sig = req.get("X-Signature") || req.get("x-signature") || "";

    if (!verifySignature(raw, sig, secret)) {
      console.warn("invalid HMAC", { sig });
      return res.status(401).send("invalid signature");
    }

    let payload;
    try { payload = JSON.parse(raw); }
    catch (e) { return res.status(400).send("bad json"); }

    const evt = payload?.meta?.event_name || "";
    const uid = pickUserId(payload);
    if (!uid) {
      console.warn("no uid on payload", { evt });
      return res.status(202).send("no uid — acknowledged");
    }

    const attrs = payload?.data?.attributes || {};
    const ref = db.collection("subscriptions").doc(uid);

    try {
      switch (evt) {
        case "subscription_created":
        case "subscription_updated":
        case "subscription_resumed": {
          await ref.set({
            status:           "premium",
            expiresAt:        attrs.renews_at
                                ? admin.firestore.Timestamp.fromDate(new Date(attrs.renews_at))
                                : null,
            lsCustomerId:     attrs.customer_id || null,
            lsSubscriptionId: payload?.data?.id || null,
            updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          break;
        }
        case "subscription_cancelled":
        case "subscription_expired":
        case "subscription_payment_failed": {
          await ref.set({
            status:    "cancelled",
            expiresAt: attrs.ends_at
                         ? admin.firestore.Timestamp.fromDate(new Date(attrs.ends_at))
                         : admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          break;
        }
        default:
          // Acknowledge unknown events so Lemon Squeezy stops retrying.
          break;
      }
      return res.status(200).send("ok");
    } catch (err) {
      console.error("upsert failed", err);
      return res.status(500).send("upsert failed");
    }
  });

// =====================================================================
// 2) Hourly cleanup of expired secrets in Realtime Database.
//    Firebase RTDB has no native TTL, so we sweep every hour.
//    With free-tier 125k invocations/month, hourly = 720/month.
// =====================================================================
exports.purgeExpiredSecrets = functions.pubsub
  .schedule("every 60 minutes")
  .onRun(async () => {
    const now = Date.now();
    const snap = await rtdb.ref("secrets")
      .orderByChild("expiresAt").endAt(now).once("value");
    const updates = {};
    snap.forEach((child) => { updates[child.key] = null; });
    if (Object.keys(updates).length) {
      await rtdb.ref("secrets").update(updates);
      console.log("purged", Object.keys(updates).length, "expired secrets");
    }
    return null;
  });
