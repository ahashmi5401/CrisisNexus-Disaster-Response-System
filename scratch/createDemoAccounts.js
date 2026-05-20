/**
 * createDemoAccounts.js
 * Creates demo Firebase Auth users + Firestore profiles for each CrisisNexus role.
 * Run from: crisis_nexus/functions  (needs firebase-admin in scope)
 * Usage: node ../../scratch/createDemoAccounts.js
 */

const admin = require("firebase-admin");
const path = require("path");

// Initialize with default credentials (uses GOOGLE_APPLICATION_CREDENTIALS or ADC)
if (!admin.apps.length) {
  try {
    const credPath = path.join(__dirname, "../crisis_nexus/functions/firebase-admin-creds.json");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: "crisisnexus-bf9fc",
    });
  } catch (err) {
    console.error("Failed to load credentials from firebase-admin-creds.json:", err.message);
    admin.initializeApp({
      projectId: "crisisnexus-bf9fc",
    });
  }
}

const auth = admin.auth();
const db   = admin.firestore();

const DEMO_ACCOUNTS = [
  {
    email:       "coordinator@crisisnexus.demo",
    password:    "12345678",
    displayName: "Hashmi Coordinator",
    role:        "coordinator",
    department:  "Emergency Operations Center",
    clearance:   "FULL_ACCESS",
  },
  {
    email:       "medical@crisisnexus.demo",
    password:    "12345678",
    displayName: "Dr. Sara Medical",
    role:        "medical_team",
    department:  "Medical & Triage",
    clearance:   "MEDICAL_APPROVE",
  },
  {
    email:       "logistics@crisisnexus.demo",
    password:    "12345678",
    displayName: "Ali Logistics",
    role:        "logistics",
    department:  "Logistics & Supply Chain",
    clearance:   "DISPATCH_APPROVE",
  },
  {
    email:       "rescue@crisisnexus.demo",
    password:    "12345678",
    displayName: "Rescue Team Alpha",
    role:        "rescue",
    department:  "Search & Rescue",
    clearance:   "FIELD_OPS",
  },
  {
    email:       "observer@crisisnexus.demo",
    password:    "12345678",
    displayName: "UN Observer",
    role:        "observer",
    department:  "External Observer / Read-Only",
    clearance:   "READ_ONLY",
  },
  {
    email:       "citizen@crisisnexus.demo",
    password:    "12345678",
    displayName: "Demo Citizen",
    role:        "citizen",
    department:  "Citizen Reporter",
    clearance:   "CITIZEN_REPORT",
  },
];

async function createAccounts() {
  console.log("\n🚀 CrisisNexus — Creating/Updating Demo Accounts\n" + "=".repeat(50));

  for (const account of DEMO_ACCOUNTS) {
    try {
      // Try to create in Firebase Auth
      let userRecord;
      try {
        userRecord = await auth.createUser({
          email:        account.email,
          password:     account.password,
          displayName:  account.displayName,
          emailVerified: true,
        });
        console.log(`✅ Created Auth user: ${account.email} (uid: ${userRecord.uid})`);
      } catch (err) {
        if (err.code === "auth/email-already-exists") {
          userRecord = await auth.getUserByEmail(account.email);
          console.log(`⚠️  Already exists: ${account.email} (uid: ${userRecord.uid})`);
          // Update password to guarantee it matches
          await auth.updateUser(userRecord.uid, {
            password: account.password,
            displayName: account.displayName,
          });
          console.log(`   └── Updated Auth user password/profile`);
        } else {
          throw err;
        }
      }

      // Write Firestore profile
      await db.collection("users").doc(userRecord.uid).set({
        uid:         userRecord.uid,
        email:       account.email,
        displayName: account.displayName,
        role:        account.role,
        department:  account.department,
        clearance:   account.clearance,
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
        isDemo:      true,
      }, { merge: true });

      console.log(`   └── Firestore profile written/merged for role: ${account.role}`);
    } catch (err) {
      console.error(`❌ Failed for ${account.email}: ${err.message}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ All demo accounts created/updated successfully.\n");
  process.exit(0);
}

createAccounts();
