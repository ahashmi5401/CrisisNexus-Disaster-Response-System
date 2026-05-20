const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, doc, updateDoc, setDoc, getDoc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyA_YHsh_Fbd0sR_qoTGrN_BFAsccs_zszQ",
  authDomain: "crisisnexus-bf9fc.firebaseapp.com",
  projectId: "crisisnexus-bf9fc",
};

const app = initializeApp(firebaseConfig, "default");
const db = getFirestore(app);
const auth = getAuth(app);

async function createOrGetUser(email, password, role) {
  let uid;
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    uid = userCredential.user.uid;
  } catch (e) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    uid = userCredential.user.uid;
  }
  await setDoc(doc(db, "users", uid), { email, role }, { merge: true });
  return uid;
}

async function runAudit() {
  console.log("[AUDIT] Starting Concurrency Audit...");
  
  // 1. Setup Test Users
  console.log("[AUDIT] Setting up 3 authenticated roles: coordinator, medical_team, logistics");
  await createOrGetUser("audit_coord@crisisnexus.pk", "password123", "coordinator");
  await createOrGetUser("audit_med@crisisnexus.pk", "password123", "medical_team");
  await createOrGetUser("audit_log@crisisnexus.pk", "password123", "logistics");

  // 2. Initialize 3 Client SDK Instances
  const appCoord = initializeApp(firebaseConfig, "appCoord");
  const appMed = initializeApp(firebaseConfig, "appMed");
  const appLog = initializeApp(firebaseConfig, "appLog");

  const authCoord = getAuth(appCoord);
  const authMed = getAuth(appMed);
  const authLog = getAuth(appLog);

  await signInWithEmailAndPassword(authCoord, "audit_coord@crisisnexus.pk", "password123");
  await signInWithEmailAndPassword(authMed, "audit_med@crisisnexus.pk", "password123");
  await signInWithEmailAndPassword(authLog, "audit_log@crisisnexus.pk", "password123");

  const dbCoord = getFirestore(appCoord);
  const dbMed = getFirestore(appMed);
  const dbLog = getFirestore(appLog);

  // 3. Setup Test Documents
  console.log("[AUDIT] Seeding test crisis and relief request...");
  const crisisId = "audit_crisis_" + Date.now();
  const reliefId = "audit_relief_" + Date.now();
  
  // Need coordinator privileges to create crises
  await setDoc(doc(dbCoord, "crises", crisisId), {
    crisisId, status: "new", title: "Concurrency Test Crisis"
  });
  
  // Anyone can create a relief request for themselves
  await setDoc(doc(dbCoord, "relief_requests", reliefId), {
    requestId: reliefId, userId: authCoord.currentUser.uid, status: "PENDING"
  });

  console.log(`[AUDIT] Seeded Crisis: ${crisisId}`);
  console.log(`[AUDIT] Seeded Relief Request: ${reliefId}`);

  // ==========================================
  // TEST 1: Role Enforcement & State Machine on Relief Requests
  // ==========================================
  console.log("\n[TEST 1] Testing Role Enforcement on Relief Requests (Concurrent)");
  
  console.log("  -> Coordinator initiating APPROVE transition...");
  console.log("  -> Logistics initiating DISPATCH transition (should fail because not approved yet)...");
  
  const p1 = updateDoc(doc(dbCoord, "relief_requests", reliefId), { status: "APPROVED" })
    .then(() => "Coordinator (APPROVE) Success")
    .catch(e => "Coordinator (APPROVE) Failed: " + e.code);
    
  const p2 = updateDoc(doc(dbLog, "relief_requests", reliefId), { status: "DISPATCHED" })
    .then(() => "Logistics (DISPATCH) Success")
    .catch(e => "Logistics (DISPATCH) Failed: " + e.code);

  const [res1, res2] = await Promise.all([p1, p2]);
  console.log(`  -> RESULT: ${res1}`);
  console.log(`  -> RESULT: ${res2}`);

  // ==========================================
  // TEST 2: Concurrent Crises Updates (Race Condition Check)
  // ==========================================
  console.log("\n[TEST 2] Testing Simultaneous Crises State Overwrites");
  console.log("  -> Med Team initiating MEDICAL_TRIAGED (status=in_progress)...");
  console.log("  -> Coordinator initiating RESOLVED (status=resolved) simultaneously...");

  const p3 = updateDoc(doc(dbMed, "crises", crisisId), { status: "in_progress", medicalNotes: "Triage done", updatedAt: new Date().toISOString() })
    .then(() => "Med Team (in_progress) Success")
    .catch(e => "Med Team (in_progress) Failed: " + e.code);
    
  const p4 = updateDoc(doc(dbCoord, "crises", crisisId), { status: "resolved", resolvedNotes: "Done", updatedAt: new Date().toISOString() })
    .then(() => "Coordinator (resolved) Success")
    .catch(e => "Coordinator (resolved) Failed: " + e.code);

  const [res3, res4] = await Promise.all([p3, p4]);
  console.log(`  -> RESULT: ${res3}`);
  console.log(`  -> RESULT: ${res4}`);

  // Read final state
  const finalCrisis = await getDoc(doc(dbCoord, "crises", crisisId));
  console.log(`  -> Final Crisis Status in DB: ${finalCrisis.data().status}`);

  console.log("\n[AUDIT] Audit Complete. Exiting.");
  process.exit(0);
}

runAudit().catch(e => {
  console.error("Audit failed:", e);
  process.exit(1);
});
