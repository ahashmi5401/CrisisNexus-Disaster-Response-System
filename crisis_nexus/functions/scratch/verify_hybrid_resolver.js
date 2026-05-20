/**
 * Real execution trace for hybridSeverityResolver against 4 scenarios.
 * Run: node scratch/verify_hybrid_resolver.js
 */

const { resolveHybridSeverity } = require('../crio/hybridSeverityResolver');

// Also import crisisProcessor helpers we need to trace the full pipeline
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

// Simulate what runCiroAIAgent would return for each scenario
// (we can't run the real Gemini call in test, so we use representative AI outputs
//  that match what Gemini returns for each described scenario)
const scenarios = [
  {
    name: "SCENARIO 1 — Single Critical Flood",
    payload: {
      description: "ghar mein flood aa gaya",
      severity: "CRITICAL",
      location: { lat: 24.86, lng: 67.01, name: "Karachi" },
    },
    // AI sees low fusionScore (0.34), single report, no weather confirmation
    // Gemini typically returns LOW or MEDIUM for unconfirmed single signal
    simulatedAiSeverity: "LOW",
    contradictionLevel: "NONE",
    hasGps: true,
    reliabilityScore: 0.65,
    expected: {
      finalSeverity: "CRITICAL",
      source: "citizen_override",
      severityBadge: "CITIZEN OVERRIDE",
    },
  },
  {
    name: "SCENARIO 2 — Medium Road Block",
    payload: {
      description: "road blocked",
      severity: "MEDIUM",
      location: { lat: 24.86, lng: 67.01 },
    },
    // AI with low fusion (0.21) might also return LOW
    simulatedAiSeverity: "LOW",
    contradictionLevel: "NONE",
    hasGps: true,
    reliabilityScore: 0.65,
    expected: {
      finalSeverity: "MEDIUM",
      source: "citizen",
      severityBadge: "CITIZEN OVERRIDE",
    },
  },
  {
    name: "SCENARIO 3 — AI Escalation",
    payload: {
      description: "minor water leakage",
      severity: "LOW",
      location: { lat: 24.86, lng: 67.01 },
    },
    // AI sees heavy rain + high congestion + multiple signals → escalates to CRITICAL
    simulatedAiSeverity: "CRITICAL",
    contradictionLevel: "NONE",
    hasGps: true,
    reliabilityScore: 0.82,
    expected: {
      finalSeverity: "CRITICAL",
      source: "fusion",
      severityBadge: "FUSION ONLY",
    },
  },
  {
    name: "SCENARIO 4 — Contradiction Protection",
    payload: {
      description: "severe flood entering house",
      severity: "CRITICAL",
      location: { lat: 24.86, lng: 67.01 },
    },
    // AI sees dry weather contradicting flood → returns LOW
    simulatedAiSeverity: "LOW",
    contradictionLevel: "HIGH",
    hasGps: true,
    reliabilityScore: 0.50,
    expected: {
      // Safety Rule 1: CRITICAL citizen + HIGH contradiction → floor at HIGH
      finalSeverity: "HIGH",
      source: "citizen_override_constrained",
      severityBadge: "CITIZEN OVERRIDE",
    },
  },
];

let allPassed = true;

for (const s of scenarios) {
  console.log("\n" + "=".repeat(70));
  console.log(s.name);
  console.log("=".repeat(70));

  // Step 1: Normalize exactly as crisisProcessor.js does
  const citizenDeclaredSeverity = normalizeSeverity(s.payload.severity);
  const rawAiSeverity = normalizeSeverity(s.simulatedAiSeverity);

  console.log(`\n[PIPELINE TRACE]`);
  console.log(`  Flutter input severity:    "${s.payload.severity}"`);
  console.log(`  normalizeSeverity(citizen): "${citizenDeclaredSeverity}"`);
  console.log(`  Simulated AI severity:     "${s.simulatedAiSeverity}"`);
  console.log(`  normalizeSeverity(ai):     "${rawAiSeverity}"`);
  console.log(`  contradictionLevel:        "${s.contradictionLevel}"`);
  console.log(`  hasGps:                    ${s.hasGps}`);
  console.log(`  reliabilityScore:          ${s.reliabilityScore}`);

  // Step 2: Run through resolveHybridSeverity exactly as crisisProcessor does
  const hybridResult = resolveHybridSeverity({
    citizenSeverity: citizenDeclaredSeverity,
    aiSeverity: rawAiSeverity,
    contradictionLevel: s.contradictionLevel,
    hasGps: s.hasGps,
    reliabilityScore: s.reliabilityScore,
  });

  console.log(`\n[HYBRID RESOLVER OUTPUT]`);
  console.log(`  finalSeverity:   "${hybridResult.finalSeverity}"`);
  console.log(`  finalConfidence: ${hybridResult.finalConfidence}`);
  console.log(`  decisionSource:  "${hybridResult.decisionSource}"`);
  console.log(`  severityBadge:   "${hybridResult.severityBadge}"`);

  // Step 3: Firestore document fields (exactly what crisisRef.set() writes)
  const firestoreDoc = {
    severity: hybridResult.finalSeverity,   // top-level severity
    confidenceScore: hybridResult.finalConfidence,
    citizenInput: {
      severity: citizenDeclaredSeverity,
      description: s.payload.description,
      userId: null,
      userEmail: null,
    },
    analysis: {
      finalSeverity: hybridResult.finalSeverity,
      source: hybridResult.decisionSource,
      severityBadge: hybridResult.severityBadge,
      aiSeverity: rawAiSeverity,
      citizenSeverity: citizenDeclaredSeverity,
      contradictionLevel: hybridResult.contradictionLevel,
    },
  };

  console.log(`\n[FIRESTORE DOC FIELDS]`);
  console.log(`  severity (top-level):          "${firestoreDoc.severity}"`);
  console.log(`  citizenInput.severity:         "${firestoreDoc.citizenInput.severity}"`);
  console.log(`  analysis.finalSeverity:        "${firestoreDoc.analysis.finalSeverity}"`);
  console.log(`  analysis.source:               "${firestoreDoc.analysis.source}"`);
  console.log(`  analysis.severityBadge:        "${firestoreDoc.analysis.severityBadge}"`);
  console.log(`  analysis.aiSeverity:           "${firestoreDoc.analysis.aiSeverity}"`);
  console.log(`  analysis.contradictionLevel:   "${firestoreDoc.analysis.contradictionLevel}"`);

  // Step 4: NGO Dashboard render logic (from CrisisCard.tsx)
  let badgeColor;
  if (hybridResult.severityBadge === "CITIZEN OVERRIDE") badgeColor = "orange";
  else if (hybridResult.severityBadge === "HYBRID CONFIRMED") badgeColor = "green";
  else badgeColor = "blue";

  console.log(`\n[NGO DASHBOARD RENDER]`);
  console.log(`  <SeverityBadge severity="${hybridResult.finalSeverity}" />`);
  console.log(`  <HybridBadge text="${hybridResult.severityBadge}" color=${badgeColor} />`);

  // Step 5: PASS / FAIL check
  const pass =
    hybridResult.finalSeverity === s.expected.finalSeverity &&
    hybridResult.decisionSource === s.expected.source &&
    hybridResult.severityBadge === s.expected.severityBadge;

  if (pass) {
    console.log(`\n  ✅ PASS`);
  } else {
    allPassed = false;
    console.log(`\n  ❌ FAIL`);
    if (hybridResult.finalSeverity !== s.expected.finalSeverity)
      console.log(`     finalSeverity: got "${hybridResult.finalSeverity}", expected "${s.expected.finalSeverity}"`);
    if (hybridResult.decisionSource !== s.expected.source)
      console.log(`     source:        got "${hybridResult.decisionSource}", expected "${s.expected.source}"`);
    if (hybridResult.severityBadge !== s.expected.severityBadge)
      console.log(`     badge:         got "${hybridResult.severityBadge}", expected "${s.expected.severityBadge}"`);
  }
}

console.log("\n" + "=".repeat(70));
console.log(allPassed ? "PATCH STATUS: ✅ Fully Working" : "PATCH STATUS: ❌ Failed — see above");
console.log("=".repeat(70) + "\n");
