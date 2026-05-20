const admin = require("firebase-admin");
const path = require("path");

try {
  const credPath = path.join(__dirname, "firebase-admin-creds.json");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "crisisnexus-bf9fc"
  });

  const db = admin.firestore();
  console.log("Testing admin with GOOGLE_APPLICATION_CREDENTIALS...");
  db.collection("crises").limit(1).get()
    .then(snap => {
      console.log(`Success! Found ${snap.size} docs.`);
    })
    .catch(err => {
      console.error("Firestore get error:", err.message);
    });
} catch (e) {
  console.error("Init error:", e.message);
}
