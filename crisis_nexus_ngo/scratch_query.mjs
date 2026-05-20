import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, orderBy, limit, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA_YHsh_Fbd0sR_qoTGrN_BFAsccs_zszQ",
  authDomain: "crisisnexus-bf9fc.firebaseapp.com",
  projectId: "crisisnexus-bf9fc",
  storageBucket: "crisisnexus-bf9fc.firebasestorage.app",
  messagingSenderId: "1095654129175",
  appId: "1:1095654129175:web:32fcad871271c82d6fe652",
  measurementId: "G-DHX6DK9EGH"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("=== LATEST 5 EVENT_QUEUE ===");
  const eqSnap = await getDocs(query(collection(db, "event_queue"), orderBy("time", "desc"), limit(5)));
  const eqDocs = eqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(JSON.stringify(eqDocs, null, 2));

  console.log("\n=== LATEST 5 CRISES ===");
  const crSnap = await getDocs(query(collection(db, "crises"), orderBy("createdAt", "desc"), limit(5)));
  const crDocs = crSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(JSON.stringify(crDocs, null, 2));

  console.log("\n=== LATEST 5 CIRO_INTELLIGENCE ===");
  const ciSnap = await getDocs(query(collection(db, "ciro_intelligence"), limit(5)));
  const ciDocs = ciSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(JSON.stringify(ciDocs, null, 2));
  
  process.exit(0);
}

run().catch(console.error);
