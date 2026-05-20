/**
 * CrisisNexus NGO Dashboard Canonical Normalization Layer
 * Resolves schema mismatches between backend Cloud Functions and frontend Expectations.
 */

export function normalizeSeverity(s: unknown): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "NEEDS_VERIFICATION" {
  if (s === undefined || s === null) return "MEDIUM";
  
  const upper = s.toString().toUpperCase().trim();
  if (upper === "UNKNOWN" || upper === "NEEDS_VERIFICATION") {
    return "NEEDS_VERIFICATION";
  }
  
  if (typeof s === "number" || !isNaN(Number(s))) {
    const n = Number(s);
    if (n <= 1) return "LOW";
    if (n === 2) return "MEDIUM";
    if (n === 3) return "HIGH";
    return "CRITICAL";
  }

  if (upper === "LOW") return "LOW";
  if (upper === "MEDIUM") return "MEDIUM";
  if (upper === "HIGH") return "HIGH";
  if (upper === "CRITICAL") return "CRITICAL";

  return "MEDIUM";
}

export function normalizeStatus(status: unknown): string {
  if (!status || typeof status !== "string") return "reported";
  const lower = status.toLowerCase().trim();
  
  const validNGOStatuses = ["new", "reported", "approved", "triaged", "assigned", "in_progress", "mitigated", "resolved"];
  if (validNGOStatuses.includes(lower)) {
    return lower;
  }
  
  if (lower === "pending" || lower === "provisional") return "reported";
  if (lower === "active" || lower === "dispatched") return "in_progress";
  if (lower === "closed") return "resolved";
  if (lower === "confirmed") return "approved";
  
  return "reported";
}

export function normalizeCrisis(crisis: any): Record<string, any> {
  if (!crisis || typeof crisis !== "object") return {};

  // 1. Convert severity
  // Check root severity first, then fallback to nested crises[0].severity if present
  let rawSeverity = crisis.severity;
  if (rawSeverity === undefined && Array.isArray(crisis.crises) && crisis.crises.length > 0) {
    rawSeverity = crisis.crises[0].severity;
  }
  const severity = normalizeSeverity(rawSeverity);

  // 2. Normalize status
  const status = normalizeStatus(crisis.status);

  // 3. Fallback updatedAt to time
  let updatedAt = crisis.updatedAt;
  if (!updatedAt) {
    updatedAt = crisis.time || crisis.createdAt || { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
  }

  // 4. Compute priorityScore if missing
  let priorityScore = crisis.priorityScore;
  if (priorityScore === undefined || priorityScore === null || isNaN(Number(priorityScore))) {
    priorityScore = crisis.decisionEngine?.priorityScore;
  }
  
  if (priorityScore === undefined || priorityScore === null || isNaN(Number(priorityScore))) {
    const imp = typeof crisis.impactScore === "number" ? crisis.impactScore : 50;
    const conf = typeof crisis.confidenceScore === "number" ? crisis.confidenceScore : (typeof crisis.confidence === "number" ? crisis.confidence : 0.50);
    let severityWeight = 2; // MEDIUM
    if (severity === "LOW") severityWeight = 1;
    else if (severity === "NEEDS_VERIFICATION") severityWeight = 1.5;
    else if (severity === "MEDIUM") severityWeight = 2;
    else if (severity === "HIGH") severityWeight = 3;
    else if (severity === "CRITICAL") severityWeight = 4;

    priorityScore = parseFloat(((imp * 0.45) + (conf * 100 * 0.35) + (severityWeight * 0.20)).toFixed(2));
  } else {
    priorityScore = Number(priorityScore);
  }

  // 5. Default history to []
  const history = Array.isArray(crisis.history) ? crisis.history : [];

  // Enforce assignedRoles is an array of strings, filtering out single characters (garbage from spread strings)
  let assignedRoles: string[] = [];
  if (Array.isArray(crisis.assignedRoles)) {
    assignedRoles = crisis.assignedRoles.filter((r: unknown) => typeof r === "string" && r.length > 1);
  } else if (typeof crisis.assignedRoles === "string") {
    assignedRoles = [crisis.assignedRoles];
  } else if (typeof crisis.assignedRole === "string" && crisis.assignedRole.length > 1) {
    assignedRoles = [crisis.assignedRole];
  }

  // 6. SubType extraction fallback
  let subType = crisis.subType;
  if (!subType && Array.isArray(crisis.crises) && crisis.crises.length > 0) {
    subType = crisis.crises[0].subType || crisis.crises[0].type;
  }
  if (!subType) subType = crisis.type || "unknown";

  return {
    ...crisis,
    severity,
    status,
    updatedAt,
    priorityScore,
    history,
    assignedRoles,
    subType: subType.toLowerCase(),
  };
}
