/**
 * CrisisNexus Canonical Firestore Schema Backfill & Migration Script
 * Converts legacy/numeric severity to canonical uppercase strings and backfills missing required fields.
 */

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "crisisnexus-bf9fc"
  });
}

const db = admin.firestore();

function normalizeSeverity(s) {
  if (s === undefined || s === null) return "MEDIUM";
  if (typeof s === "number" || !isNaN(Number(s))) {
    const n = Number(s);
    if (n <= 1) return "LOW";
    if (n === 2) return "MEDIUM";
    if (n === 3) return "HIGH";
    return "CRITICAL";
  }
  const upper = s.toString().toUpperCase().trim();
  if (upper === "LOW") return "LOW";
  if (upper === "MEDIUM") return "MEDIUM";
  if (upper === "HIGH") return "HIGH";
  if (upper === "CRITICAL") return "CRITICAL";
  return "MEDIUM";
}

function computePriorityScore(impactScore, confidenceScore, severityStr) {
  const imp = typeof impactScore === "number" ? impactScore : 50;
  const conf = typeof confidenceScore === "number" ? confidenceScore : 0.50;
  let severityWeight = 2; // MEDIUM
  if (severityStr === "LOW") severityWeight = 1;
  else if (severityStr === "MEDIUM") severityWeight = 2;
  else if (severityStr === "HIGH") severityWeight = 3;
  else if (severityStr === "CRITICAL") severityWeight = 4;

  const score = (imp * 0.45) + (conf * 100 * 0.35) + (severityWeight * 0.20);
  return parseFloat(score.toFixed(2));
}

async function migrateCrises() {
  console.log("=== Starting CrisisNexus Firestore Migration & Backfill ===");
  const crisesRef = db.collection("crises");
  const snapshot = await crisesRef.get();

  if (snapshot.empty) {
    console.log("No crisis documents found in collection.");
    return;
  }

  console.log(`Found ${snapshot.size} crisis documents. Processing migration...`);
  let batch = db.batch();
  let count = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    let isModified = false;
    const updateObj = {};

    // 1. Convert severity
    let rawSeverity = data.severity;
    if (rawSeverity === undefined && Array.isArray(data.crises) && data.crises.length > 0) {
      rawSeverity = data.crises[0].severity;
    }
    const canonicalSeverity = normalizeSeverity(rawSeverity);
    if (data.severity !== canonicalSeverity) {
      updateObj.severity = canonicalSeverity;
      isModified = true;
    }

    // 2. Add status if missing
    if (!data.status || typeof data.status !== "string") {
      updateObj.status = "NEW";
      isModified = true;
    }

    // 3. Add updatedAt if missing
    if (!data.updatedAt) {
      updateObj.updatedAt = data.time || data.createdAt || admin.firestore.FieldValue.serverTimestamp();
      isModified = true;
    }

    // 4. Add priorityScore if missing or recompute if needed
    const imp = typeof data.impactScore === "number" ? data.impactScore : 50;
    const conf = typeof data.confidenceScore === "number" ? data.confidenceScore : (typeof data.confidence === "number" ? data.confidence : 0.50);
    const canonicalPriority = computePriorityScore(imp, conf, canonicalSeverity);
    if (data.priorityScore === undefined || data.priorityScore === null || isNaN(Number(data.priorityScore)) || data.priorityScore !== canonicalPriority) {
      updateObj.priorityScore = canonicalPriority;
      isModified = true;
    }

    // 5. Add history if missing
    if (!Array.isArray(data.history)) {
      updateObj.history = [];
      isModified = true;
    }

    if (isModified) {
      batch.update(doc.ref, updateObj);
      count++;

      if (count % 400 === 0) {
        await batch.commit();
        console.log(`Committed batch of ${count} documents.`);
        batch = db.batch();
      }
    }
  }

  if (count % 400 !== 0) {
    await batch.commit();
  }

  console.log(`=== Migration Complete! Successfully migrated ${count} documents. ===`);
}

migrateCrises().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
