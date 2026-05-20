// node scripts/fetch_firestore_samples.js
const admin = require("firebase-admin");
const fs = require("fs");

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./firebase-admin-creds.json";
if (!fs.existsSync(keyPath)) {
  console.error("Service account JSON not found at", keyPath);
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS env or place firebase-admin-creds.json in repo root.");
  process.exit(1);
}
const serviceAccount = require(keyPath);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function sampleCollection(name, limit = 5) {
  console.log(`\n--- Collection: ${name} ---`);
  try {
    const snap = await db.collection(name).limit(limit).get();
    if (snap.empty) { console.log("(no documents)"); return; }
    snap.forEach(doc => {
      console.log("DOC_ID:", doc.id);
      console.log(JSON.stringify(doc.data(), null, 2));
      console.log("---");
    });
  } catch (err) {
    console.error("ERR reading", name, err && err.message || err);
  }
}

(async () => {
  await sampleCollection("crises");
  await sampleCollection("ciro_intelligence");
  await sampleCollection("event_queue");
  await sampleCollection("relief_requests");
   await sampleCollection("users");
  await sampleCollection("signals");
  await sampleCollection("family_profiles");
  process.exit(0);
})();
