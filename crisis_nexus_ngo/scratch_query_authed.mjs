import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

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
const auth = getAuth(app);

function getDeepKeys(obj, prefix = "") {
  let keys = [];
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      keys.push(fullKey);
      keys = keys.concat(getDeepKeys(obj[k], fullKey));
    }
  }
  return keys;
}

async function run() {
  await signInWithEmailAndPassword(auth, "coordinator@crisisnexus.demo", "12345678");
  
  const collections = ["crises", "ciro_intelligence"];
  
  for (const colName of collections) {
    console.log(`\n=== Analyzing keys in collection: ${colName} ===`);
    const snap = await getDocs(collection(db, colName));
    const allKeys = new Set();
    
    snap.docs.forEach(doc => {
      const data = doc.data();
      const keys = getDeepKeys(data);
      keys.forEach(k => allKeys.add(k));
    });
    
    console.log(Array.from(allKeys).sort());
  }

  process.exit(0);
}

run().catch(console.error);
