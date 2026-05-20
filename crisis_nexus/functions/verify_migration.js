const admin = require("firebase-admin");
const path = require("path");

const credPath = path.join(__dirname, "firebase-admin-creds.json");
process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "crisisnexus-bf9fc"
});

const db = admin.firestore();

async function verify() {
  console.log("=== Verifying Canonical Schema in Firestore ===");
  const snap = await db.collection("crises").get();
  snap.forEach(doc => {
    const d = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`  severity: ${JSON.stringify(d.severity)} (${typeof d.severity})`);
    console.log(`  priorityScore: ${JSON.stringify(d.priorityScore)} (${typeof d.priorityScore})`);
    console.log(`  status: ${JSON.stringify(d.status)} (${typeof d.status})`);
    console.log(`  updatedAt: ${d.updatedAt ? (d.updatedAt.toDate ? d.updatedAt.toDate().toISOString() : d.updatedAt) : 'MISSING'}`);
    console.log(`  history: ${JSON.stringify(d.history)} (isArray: ${Array.isArray(d.history)})`);
    console.log("----------------------------------------");
  });
}

verify().catch(console.error);
