const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "crisisnexus-bf9fc"
  });
}
const db = admin.firestore();

async function run() {
  console.log("Fetching user profiles from Firestore...");
  const snapshot = await db.collection("users").get();
  if (snapshot.empty) {
    console.log("No users found in users collection.");
    return;
  }
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`UID: ${doc.id} | Email: ${data.email} | Role: ${data.role} | Name: ${data.name}`);
  });
}

run().catch(console.error);
