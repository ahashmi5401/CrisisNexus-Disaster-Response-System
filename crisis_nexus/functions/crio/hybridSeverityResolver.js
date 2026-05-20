/**
 * hybridSeverityResolver.js
 * CRIO v2 — Hybrid Priority Resolution Layer
 *
 * Implements HYBRID MODE severity decision:
 *
 *   FINAL = MAX(citizenSeverity, fusionSeverity, aiSeverity)
 *
 * With mandatory safeguards for life-threatening citizen reports:
 *   - citizenSeverity == CRITICAL → floor at HIGH even under contradiction
 *   - citizenSeverity == HIGH + valid GPS → never downgrade below MEDIUM
 *   - Fusion score only enhances confidence, NEVER silently overrides citizen intent
 *
 * Outputs a severity badge for the NGO dashboard:
 *   CITIZEN OVERRIDE  → citizen's declared severity was higher than AI
 *   HYBRID CONFIRMED  → citizen + fusion agree on the same level
 *   FUSION ONLY       → no citizen severity input; fusion result used
 */

const SEVERITY_RANK = {
  "CRITICAL": 4,
  "HIGH": 3,
  "MEDIUM": 2,
  "LOW": 1,
  "NEEDS_VERIFICATION": 0,
  "UNKNOWN": 0,
};

const RANK_TO_SEVERITY = {
  4: "CRITICAL",
  3: "HIGH",
  2: "MEDIUM",
  1: "LOW",
  0: "MEDIUM", // safe fallback: never emit UNKNOWN from hybrid layer
};

function rankOf(severity) {
  if (!severity) return 2; // default MEDIUM
  const s = severity.toString().toUpperCase().trim();
  return SEVERITY_RANK[s] !== undefined ? SEVERITY_RANK[s] : 2;
}

/**
 * Resolves the final crisis severity using the HYBRID PRIORITY MODEL.
 *
 * @param {object}  params
 * @param {string}  params.citizenSeverity    - Severity declared by citizen ("LOW"|"MEDIUM"|"HIGH"|"CRITICAL")
 * @param {string}  params.aiSeverity         - Severity from AI / fusion engine
 * @param {string}  params.contradictionLevel - Signal contradiction level: "NONE"|"LOW"|"MEDIUM"|"HIGH"
 * @param {boolean} params.hasGps             - Whether the signal carries a valid GPS coordinate
 * @param {number}  params.reliabilityScore   - 0.0–1.0 credibility score from credibilityEngine
 *
 * @returns {{
 *   finalSeverity: string,
 *   finalConfidence: number,
 *   decisionSource: string,
 *   severityBadge: string,
 *   citizenSeverity: string,
 *   aiSeverity: string,
 *   contradictionLevel: string
 * }}
 */
function resolveHybridSeverity({
  citizenSeverity,
  aiSeverity,
  contradictionLevel,
  hasGps,
  reliabilityScore,
}) {
  const citizenRank = rankOf(citizenSeverity);
  const aiRank = rankOf(aiSeverity);
  const contradiction = (contradictionLevel || "NONE").toUpperCase();
  const isHighContradiction = contradiction === "HIGH";
  const baseConfidence = typeof reliabilityScore === "number" ? reliabilityScore : 0.65;

  let finalRank;
  let decisionSource;
  let finalConfidence;

  // ── SAFETY RULE 1: Citizen declares CRITICAL ────────────────────────────────
  // A CRITICAL citizen report is a life-threatening escalation signal.
  // Policy: NEVER downgrade below HIGH regardless of fusion output.
  if (citizenRank === 4) {
    if (isHighContradiction) {
      // Active sensor contradiction → floor at HIGH (still a serious escalation)
      finalRank = 3;
      decisionSource = "citizen_override_constrained";
      finalConfidence = parseFloat(Math.min(0.75, baseConfidence + 0.10).toFixed(2));
    } else {
      // No contradiction → preserve CRITICAL exactly as reported
      finalRank = 4;
      decisionSource = "citizen_override";
      finalConfidence = parseFloat(Math.min(0.92, baseConfidence + 0.22).toFixed(2));
    }
  }

  // ── SAFETY RULE 2: Citizen declares HIGH with valid GPS ────────────────────
  // GPS-verified HIGH reports are highly reliable field observations.
  // Policy: NEVER downgrade below MEDIUM under any circumstance.
  else if (citizenRank === 3 && hasGps) {
    if (isHighContradiction) {
      // Allow one-step compromise but floor at MEDIUM
      finalRank = Math.max(2, aiRank);
      decisionSource = "hybrid_ai_constrained";
      finalConfidence = parseFloat(Math.min(0.72, baseConfidence).toFixed(2));
    } else {
      // Take MAX — citizen GPS HIGH is authoritative
      finalRank = Math.max(citizenRank, aiRank);
      decisionSource = finalRank > citizenRank ? "fusion_enhanced" : "citizen_override";
      finalConfidence = parseFloat(Math.min(0.87, baseConfidence + 0.17).toFixed(2));
    }
  }

  // ── STANDARD HYBRID: Take the MAX of citizen + AI ─────────────────────────
  else {
    finalRank = Math.max(citizenRank, aiRank);

    if (citizenRank > aiRank) {
      decisionSource = "citizen";
    } else if (aiRank > citizenRank) {
      decisionSource = "fusion";
    } else {
      // Both agree — highest confidence
      decisionSource = "hybrid_confirmed";
    }

    finalConfidence = decisionSource === "hybrid_confirmed"
      ? parseFloat(Math.min(0.90, baseConfidence + 0.15).toFixed(2))
      : parseFloat(Math.min(0.80, baseConfidence + 0.05).toFixed(2));
  }

  const finalSeverity = RANK_TO_SEVERITY[finalRank] || "MEDIUM";

  // ── NGO Dashboard Badge ────────────────────────────────────────────────────
  let severityBadge;
  if (decisionSource === "citizen_override" || decisionSource === "citizen_override_constrained" || decisionSource === "citizen") {
    severityBadge = "CITIZEN OVERRIDE";
  } else if (decisionSource === "hybrid_confirmed" || decisionSource === "fusion_enhanced") {
    severityBadge = "HYBRID CONFIRMED";
  } else {
    severityBadge = "FUSION ONLY";
  }

  return {
    finalSeverity,
    finalConfidence,
    decisionSource,
    severityBadge,
    citizenSeverity: RANK_TO_SEVERITY[citizenRank] || "MEDIUM",
    aiSeverity: RANK_TO_SEVERITY[aiRank] || "MEDIUM",
    contradictionLevel: contradiction,
  };
}

module.exports = { resolveHybridSeverity };
