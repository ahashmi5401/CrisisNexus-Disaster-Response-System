const admin = require("firebase-admin");
const path = require("path");
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, "firebase-admin-creds.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "crisisnexus-bf9fc"
  });
}
const db = admin.firestore();

async function run() {
  const eventId = "test_verification_" + Date.now();
  console.log("Writing test event ID:", eventId);
  const docRef = db.collection("event_queue").doc(eventId);
  await docRef.set({
    eventId: eventId,
    eventType: "crisis",
    subType: "flood",
    payload: {
      userId: "JWvM3mzZpRXwE4iYrNxTqTXcaye2", // a known user in system
      crisisType: "Flood",
      severity: "High",
      description: "Severe flooding has occurred in the downtown residential area. Multiple houses are partially submerged, and several elderly citizens require urgent medical assistance and evacuation assistance due to trapped rising waters. The main road is completely blocked with debris, and grid power is offline.",
      location: {
        lat: 24.9556,
        lng: 67.0716,
        name: "North Nazimabad, Block H"
      }
    },
    status: "pending",
    retryCount: 0,
    timestamp: new Date().toISOString(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log("Write successful!");
}
run().catch(console.error);
