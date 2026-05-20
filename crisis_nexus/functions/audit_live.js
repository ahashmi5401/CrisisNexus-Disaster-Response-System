const admin = require('firebase-admin');
const path = require('path');

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'firebase-admin-creds.json');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'crisisnexus-bf9fc'
});

const db = admin.firestore();

async function run() {
  console.log("=== LATEST 5 EVENT_QUEUE ===");
  const eqSnap = await db.collection("event_queue").orderBy("time", "desc").limit(5).get();
  const eqDocs = eqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(JSON.stringify(eqDocs, null, 2));

  console.log("\n=== LATEST 5 CRISES ===");
  const crSnap = await db.collection("crises").orderBy("createdAt", "desc").limit(5).get();
  const crDocs = crSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(JSON.stringify(crDocs, null, 2));

  console.log("\n=== LATEST 5 CIRO_INTELLIGENCE ===");
  const ciSnap = await db.collection("ciro_intelligence").limit(5).get();
  const ciDocs = ciSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(JSON.stringify(ciDocs, null, 2));
  
  process.exit(0);
}

run().catch(console.error);
