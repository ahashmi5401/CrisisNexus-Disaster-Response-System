const UNREGISTERED_IDENTITY_LABELS = new Set([
  "Unregistered Citizen (No Firebase Profile)",
  "Unregistered Citizen",
  "Unknown",
  "Unknown Reporter",
]);

export function resolveCitizenIdentity(record: any, profileData?: any): string {
  if (!record || typeof record !== "object") return "Unknown Reporter";

  const profile = (profileData || record.profile || record.profileData || {}) as any;
  const ci = (record.citizenInput || {}) as any;

  const candidates = [
    profile.displayName,
    profile.name,
    profile.profile?.displayName,
    profile.profile?.name,
    record.displayName,
    record.name,
    ci.name,
    ci.displayName,
    profile.email,
    profile.profile?.email,
    ci.userEmail,
    record.userEmail,
    ci.userId,
    record.userId
  ];

  for (const val of candidates) {
    if (val && typeof val === "string" && val.trim() && val.trim().toLowerCase() !== "unknown") {
      return val.trim();
    }
  }

  return "Unknown Reporter";
}

export function isCitizenIdentityVerified(record: any, profileData?: any): boolean {
  const profile = profileData || record?.profile || record?.profileData;
  const resolvedName = record?._display?.citizenName || resolveCitizenIdentity(record, profile);
  return !UNREGISTERED_IDENTITY_LABELS.has(resolvedName);
}

const getSignalsArray = (record: any, schemaContext?: any): any[] =>
  record?.inputs?.citizenSignals ||
  record?.citizenSignals ||
  schemaContext?.ciro_intelligence?.inputs?.citizenSignals ||
  schemaContext?.intelligence?.inputs?.citizenSignals ||
  [];

const getSystemExplanation = (record: any, schemaContext?: any): string => {
  const candidates = [
    record?.systemExplanation,
    record?.rawDecision?.systemExplanation,
    record?.analysis?.systemExplanation,
    schemaContext?.systemExplanation,
    schemaContext?.rawDecision?.systemExplanation,
    schemaContext?.analysis?.systemExplanation,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim()) || "";
};

const getPrimaryLocationName = (record: any, schemaContext?: any): string => {
  const candidates = [
    record?.location?.name,
    record?.rawDecision?.crises?.[0]?.location?.name,
    record?.payload?.location?.name,
    schemaContext?.location?.name,
    schemaContext?.rawDecision?.crises?.[0]?.location?.name,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim()) || "";
};

export function isSyntheticCrisis(crisisDoc: any, schemaContext?: any): boolean {
  if (!crisisDoc || typeof crisisDoc !== "object") return false;

  const signalsArray = getSignalsArray(crisisDoc, schemaContext);
  const hasCitizenSignals = Array.isArray(signalsArray)
    && signalsArray.some((signal: any) => typeof signal?.description === "string" && signal.description.trim() && !isSyntheticText(signal.description));

  const systemExplanation = getSystemExplanation(crisisDoc, schemaContext);
  const locationName = getPrimaryLocationName(crisisDoc, schemaContext);
  const combinedDescription = [crisisDoc.description, crisisDoc.aiSummary, systemExplanation].filter(Boolean).join(" ");
  const confidence = typeof crisisDoc.confidence === "number"
    ? crisisDoc.confidence
    : typeof crisisDoc.confidenceScore === "number"
      ? crisisDoc.confidenceScore
      : typeof crisisDoc.rawDecision?.confidence === "number"
        ? crisisDoc.rawDecision.confidence
        : null;

  return Boolean(
    crisisDoc.fallbackReason ||
    crisisDoc.fallbackTriggered ||
    systemExplanation ||
    String(crisisDoc.type || crisisDoc.subType || crisisDoc.eventType || crisisDoc.rawDecision?.crises?.[0]?.type || "").trim().toLowerCase() === "unknown" ||
    (typeof locationName === "string" && locationName.toLowerCase().includes("hybrid")) ||
    (typeof combinedDescription === "string" && combinedDescription.toLowerCase().includes("telemetry")) ||
    (typeof confidence === "number" && confidence < 0.6 && !hasCitizenSignals)
  );
}

export interface ResolvedCrisis {
  id: string;
  title: string;
  description: string;
  citizenName: string;
  citizenEmail: string;
  lat: number | null;
  lng: number | null;
  severity: string;
  priorityScore: number;
  safeForMap: boolean;

  // Compatibility extensions for extra dashboard elements
  aiSummary: string;
  isSynthetic?: boolean;
  hasCitizenSignals?: boolean;
  rawRecord: Record<string, unknown>;
}

export const safe = <T>(v: T | null | undefined, fallback: T): T =>
  v === undefined || v === null ? fallback : v;

export function isValidCoordinate(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  let num: number;
  if (typeof v === "number") {
    num = v;
  } else if (typeof v === "string") {
    const clean = v.trim().toLowerCase();
    if (
      clean === "" ||
      clean === "na" ||
      clean === "n/a" ||
      clean === "unknown" ||
      clean === "null" ||
      clean === "undefined"
    ) {
      return false;
    }
    num = parseFloat(v);
  } else {
    return false;
  }
  return !isNaN(num) && isFinite(num) && num !== 0;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return isValidCoordinate(lat) && isValidCoordinate(lng);
}

export function isSyntheticText(text: unknown): boolean {
  if (typeof text !== "string") return true;
  const t = text.trim().toLowerCase();
  return (
    t === "" ||
    t === "na" ||
    t === "n/a" ||
    t === "unknown" ||
    t === "null" ||
    t === "undefined" ||
    t === "no description available" ||
    t === "no description provided by reporter" ||
    t.includes("fusion zone") ||
    t.includes("hybrid zone") ||
    t.includes("target zone") ||
    t.includes("fallback zone") ||
    t.includes("incident prioritized via hybrid geospatial telemetry") ||
    t.includes("active situational monitoring initiated") ||
    t.includes("dispatch channels notified") ||
    t.includes("local simulator execution") ||
    t.includes("emergency heuristic fallback") ||
    t.includes("fallback protocol") ||
    t.includes("verification team") ||
    t.includes("target coordinates") ||
    t.includes("local grid status") ||
    t.includes("incoming patients") ||
    t.includes("regional situational monitoring") ||
    t.includes("local fusion heuristic") ||
    t.includes("hybrid mode activation")
  );
}

export function resolveCrisisTruth(crisisDoc: any, schemaContext?: any): string | null {
  if (!crisisDoc) return null;

  // Extract citizenSignals
  const signalsArray =
    crisisDoc.inputs?.citizenSignals ||
    crisisDoc.citizenSignals ||
    schemaContext?.ciro_intelligence?.inputs?.citizenSignals ||
    schemaContext?.intelligence?.inputs?.citizenSignals ||
    [];

  // If citizenSignals exist, we use them and NEVER fall back to AI summaries or synthetic fallbacks.
  const hasCitizenSignals = Array.isArray(signalsArray) && signalsArray.length > 0 && signalsArray.some((s: any) => s?.description && !isSyntheticText(s?.description));
  if (hasCitizenSignals) {
    const desc = signalsArray
      .map((s: any) => s?.description)
      .filter((d: any) => typeof d === "string" && d.trim() && !isSyntheticText(d))
      .join(" | ");
    if (desc) return desc.trim();

    // Check citizenInput.description as a safe citizen fallback
    const citizenInput = crisisDoc.citizenInput || {};
    if (
      typeof citizenInput.description === "string" &&
      citizenInput.description.trim() &&
      !isSyntheticText(citizenInput.description)
    ) {
      return citizenInput.description.trim();
    }

    return null; // Don't fall back to event_queue, crisis, or intelligence
  }

  // Check citizenInput.description even if signalsArray is empty
  const citizenInput = crisisDoc.citizenInput || {};
  if (
    typeof citizenInput.description === "string" &&
    citizenInput.description.trim() &&
    !isSyntheticText(citizenInput.description)
  ) {
    return citizenInput.description.trim();
  }

  // 2. event_queue.description
  const eventDesc =
    crisisDoc.payload?.description ||
    schemaContext?.event_queue?.description ||
    schemaContext?.event_queue?.payload?.description;
  if (typeof eventDesc === "string" && eventDesc.trim() && !isSyntheticText(eventDesc)) {
    return eventDesc.trim();
  }

  // 3. crisis.description
  const crisisDesc = crisisDoc.description;
  if (typeof crisisDesc === "string" && crisisDesc.trim() && !isSyntheticText(crisisDesc)) {
    return crisisDesc.trim();
  }

  // 4. ciro_intelligence.summary ONLY if explicitly verified from schema flag
  const ciroDoc = schemaContext?.ciro_intelligence || schemaContext?.intelligence || crisisDoc.ciro_intelligence || crisisDoc;
  if (ciroDoc) {
    const fallbackReason = ciroDoc.fallbackReason;
    const fallbackTriggered = ciroDoc.fallbackTriggered || crisisDoc.fallbackTriggered;
    const hasFallback = fallbackReason !== null && fallbackReason !== undefined || fallbackTriggered === true;

    if (!hasFallback) {
      const summary = ciroDoc.summary || ciroDoc.analysis?.summary || ciroDoc.reasoning;
      if (typeof summary === "string" && summary.trim() && !isSyntheticText(summary)) {
        return summary.trim();
      }
    }
  }

  return null;
}

export type CrisisRecord = any;

export function resolveCrisis(crisis: CrisisRecord | null | undefined): ResolvedCrisis {
  if (!crisis) {
    return {
      id: "",
      title: "",
      description: "",
      citizenName: "",
      citizenEmail: "",
      lat: null,
      lng: null,
      severity: "",
      priorityScore: 0,
      safeForMap: false,
      aiSummary: "",
      isSynthetic: false,
      hasCitizenSignals: false,
      rawRecord: {},
    };
  }

  // Flatten nested crises[] array if root fields are missing
  let base = crisis;
  if (Array.isArray(crisis.crises) && crisis.crises.length > 0) {
    const firstNested = crisis.crises[0] || {};
    if (!crisis.title || (!crisis.location && !crisis.lat && !crisis.lng)) {
      base = { ...firstNested, ...crisis };
    }
  }

  const id = safe(base.crisisId || base.id || "", "");

  // ── Step 1: Traverse citizenSignals for real citizen data ───────────────────
  const signalsArray = base.inputs?.citizenSignals || base.citizenSignals || [];
  const hasCitizenSignals = Array.isArray(signalsArray) && signalsArray.some((s: any) => typeof s?.description === "string" && s.description.trim() && !isSyntheticText(s.description));
  const isSynthetic = isSyntheticCrisis(base);

  let signalDesc = "";
  let signalCrisisType = "";
  let signalLat: number | null = null;
  let signalLng: number | null = null;
  let signalAccuracy: number | null = null;
  let signalReliability: number | null = null;
  let signalSeverity: string | null = null;

  if (Array.isArray(signalsArray) && signalsArray.length > 0) {
    signalDesc = signalsArray
      .map((s) => s.description)
      .filter((d) => typeof d === "string" && d.trim() && !isSyntheticText(d))
      .join(" | ");

    signalCrisisType =
      signalsArray
        .map((s) => s.crisisType)
        .find(
          (t) =>
            typeof t === "string" &&
            t.trim() &&
            t.toLowerCase() !== "unknown" &&
            !isSyntheticText(t)
        ) || "";

    for (const sig of signalsArray) {
      if (sig.location && isValidLatLng(sig.location.lat, sig.location.lng)) {
        signalLat = Number(sig.location.lat);
        signalLng = Number(sig.location.lng);
        signalAccuracy =
          typeof sig.location.accuracy === "number" ? sig.location.accuracy : null;
        signalReliability =
          typeof sig.location.reliabilityScore === "number"
            ? sig.location.reliabilityScore
            : null;
        break;
      }
    }

    for (const sig of signalsArray) {
      if (sig.severity) {
        signalSeverity = String(sig.severity).toUpperCase();
        break;
      }
    }
  }

  // ── Step 2: Title resolution ────────────────────────────────────────────────
  const rawTitle =
    base.title || base.subType || base.eventType || signalCrisisType || "";
  const title =
    rawTitle && rawTitle.trim().toLowerCase() !== "unknown" && !isSyntheticText(rawTitle)
      ? rawTitle
      : signalDesc
      ? signalDesc.split("|")[0].trim().slice(0, 60)
      : "";

  // ── Step 3: Description resolution (Truth Priority) ─────────────────────────
  const truthDescription = resolveCrisisTruth(base);
  const description = hasCitizenSignals ? (truthDescription || "") : (isSynthetic ? "" : (truthDescription || ""));

  // ── Step 4: Identity ────────────────────────────────────────────────────────
  const rawEmail = base.citizenInput?.userEmail || base.userEmail || base.userId || "";
  const citizenEmail = (rawEmail && !isSyntheticText(rawEmail) ? rawEmail : "").trim();
  const citizenName = resolveCitizenIdentity(base);

  // ── Step 5: Location ────────────────────────────────────────────────────────
  let lat: number | null = null;
  let lng: number | null = null;

  const loc = base.location || {};
  const nestedLoc =
    Array.isArray(crisis.crises) && crisis.crises.length > 0
      ? crisis.crises[0]?.location || {}
      : {};
  const payload = base.payload || {};
  const payloadLoc = payload.location || {};

  const getCoord = (obj: { [key: string]: unknown } | null | undefined, key: "lat" | "lng"): number | null => {
    const val = obj?.[key];
    if (isValidCoordinate(val)) return Number(val);
    return null;
  };

  lat = getCoord(loc, "lat");
  lng = getCoord(loc, "lng");

  if (lat === null || lng === null) {
    lat = signalLat;
    lng = signalLng;
  }

  if (lat === null || lng === null) {
    lat = getCoord(nestedLoc, "lat");
    lng = getCoord(nestedLoc, "lng");
  }

  if (lat === null || lng === null) {
    lat = getCoord(payloadLoc, "lat");
    lng = getCoord(payloadLoc, "lng");
  }

  if (lat === null || lng === null) {
    lat = getCoord(payload, "lat");
    lng = getCoord(payload, "lng");
  }

  const safeForMap = !isSynthetic && lat !== null && lng !== null && isValidLatLng(lat, lng);
  const finalLat = safeForMap ? lat : null;
  const finalLng = safeForMap ? lng : null;

  // ── Step 6: Severity ────────────────────────────────────────────────────────
  const severity = safe(
    signalSeverity ||
      base.severityString ||
      (base.severity !== undefined ? String(base.severity) : null) ||
      base.analysis?.finalSeverity,
    ""
  );

  // ── Step 7: Priority score ──────────────────────────────────────────────────
  const rawPriorityScore =
    base.priorityScore !== undefined && base.priorityScore !== null
      ? base.priorityScore
      : base.decisionEngine?.priorityScore;
  const priorityScore =
    typeof rawPriorityScore === "number" && !isNaN(rawPriorityScore)
      ? rawPriorityScore
      : 0;

  // "If citizenSignals exist → NEVER use AI or fallback for display fields"
  const aiSummary = hasCitizenSignals ? "" : safe(base.aiSummary, "");

  return {
    id,
    title: isSynthetic && !hasCitizenSignals ? "" : title,
    description,
    citizenName,
    citizenEmail,
    lat: finalLat,
    lng: finalLng,
    severity,
    priorityScore,
    safeForMap,
    aiSummary: isSynthetic && !hasCitizenSignals ? "" : aiSummary,
    isSynthetic,
    hasCitizenSignals,
    rawRecord: crisis,
  };
}

