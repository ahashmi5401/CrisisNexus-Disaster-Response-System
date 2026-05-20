import { resolveLocationLabel, resolveCitizenIdentity, isCitizenIdentityVerified } from "./displayUtils";
import { isValidLatLng, isSyntheticText, isSyntheticCrisis } from "./safeCrisisResolver";

// Step 5: GLOBAL SAFETY PATCH helper
export const safe = <T>(v: T | null | undefined, fallback: T): T =>
  v === undefined || v === null ? fallback : v;

export interface NormalizedNGORecord {
  id: string;
  type: 'crisis' | 'relief' | 'intelligence' | 'event' | 'user';
  title: string;
  citizenName: string;
  citizenEmail: string;
  description: string;
  aiSummary: string;
  displayDescription: string;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
  identityState: "VERIFIED" | "UNVERIFIED" | "N/A";
  safeForMap: boolean;
  severity: string;
  isSynthetic?: boolean;
  hasCitizenSignals?: boolean;

  // Compatibility metadata for EOC visuals & Truth Panels
  confidence: number | null;
  accuracy: number | null;
  reliabilityScore: number | null;
  maskedUserId: string;
  citizenSeverity: string | null;
  finalSeverity: string | null;
  rawDescription: string;

  // Decision engine metrics
  decisionEngine: Record<string, unknown> | null;
  recommendedAction: string | null;
  dataSources: string[] | null;
  reasoning: string | null;
  priorityScore: number | null;
}

type NGORecord = Record<string, unknown> & {
  profile?: { profile?: { displayName?: string; name?: string; email?: string }; displayName?: string; name?: string; email?: string };
  citizenInput?: { userEmail?: string; userId?: string; description?: string | null; severity?: string | null };
  inputs?: { citizenSignals?: Array<{ description?: string; location?: { lat?: number; lng?: number; accuracy?: number; reliabilityScore?: number }; severity?: string }> };
  citizenSignals?: Array<{ description?: string; location?: { lat?: number; lng?: number; accuracy?: number; reliabilityScore?: number }; severity?: string }>;
  location?: { lat?: number | string | null; lng?: number | string | null; name?: string; accuracy?: number; reliabilityScore?: number };
  payload?: { location?: { lat?: number | string | null; lng?: number | string | null; name?: string; accuracy?: number; reliabilityScore?: number }; lat?: number | string | null; lng?: number | string | null };
  severityString?: string;
  severity?: number | string;
  aiSummary?: string;
  description?: string;
  notes?: string;
  title?: string;
  subType?: string;
  eventType?: string;
  analysis?: { finalSeverity?: string; citizenSeverity?: string; confidence?: number };
  rawDecision?: { confidence?: number; recommendedAction?: string };
  decisionEngine?: { priorityScore?: number; recommendedAction?: string; dataSources?: string[]; reasoning?: string };
  priorityScore?: number;
  userEmail?: string;
  userId?: string;
  requestId?: string;
  eventId?: string;
  crisisId?: string;
  id?: string;
  recommendedAction?: string;
  recommendedActions?: string | string[];
  dataSources?: string[];
  reasoning?: string[] | string;
  confidenceScore?: number;
  confidence?: number;
  reliabilityScore?: number;
};

export function normalizeNGORecord(
  record: NGORecord | null | undefined,
  type: 'crisis' | 'relief' | 'intelligence' | 'event' | 'user',
  profileData?: NGORecord | null
): NormalizedNGORecord {
  if (!record) {
    return {
      id: "",
      type,
      title: "",
      citizenName: "",
      citizenEmail: "",
      description: "",
      aiSummary: "",
      displayDescription: "",
      lat: null,
      lng: null,
      locationLabel: "",
      identityState: "UNVERIFIED",
      safeForMap: false,
      severity: "",
      confidence: null,
      accuracy: null,
      reliabilityScore: null,
      maskedUserId: "usr_***",
      citizenSeverity: null,
      finalSeverity: "",
      rawDescription: "",
      decisionEngine: null,
      recommendedAction: null,
      dataSources: null,
      reasoning: null,
      priorityScore: null,
      isSynthetic: false,
      hasCitizenSignals: false
    };
  }

  const id = safe(record?.crisisId || record?.id || record?.requestId || record?.eventId, "");

  // 1. Identity Resolution (Step 3 fallback chain)
  const profile = profileData || record?.profile || record;
  const citizenNameResolved = resolveCitizenIdentity(record, profileData);
  const citizenName = citizenNameResolved && !/^(unknown reporter|unregistered citizen(?: \(no firebase profile\))?|unknown|n\/a|not reported|null|undefined)$/i.test(citizenNameResolved.trim())
    ? citizenNameResolved
    : "";

  // Email Resolver
  const rawEmail = 
    profile?.profile?.email || 
    profile?.email || 
    record?.citizenInput?.userEmail || 
    record?.userEmail || 
    "";
  const citizenEmail = (typeof rawEmail === "string" && rawEmail.trim() && !/^(unknown|n\/a|not reported|null|undefined)$/i.test(rawEmail.trim()) ? rawEmail.trim() : "");

  const identityState = (type === 'user' || type === 'relief' || type === 'crisis')
    ? (isCitizenIdentityVerified(record, profile) ? "VERIFIED" : "UNVERIFIED")
    : "UNVERIFIED";

  // Traverse citizenSignals list if present to fetch real citizen inputs (meaning/purpose fallbacks)
  const signalsArray = record?.inputs?.citizenSignals || record?.citizenSignals || [];
  const hasCitizenSignals = Array.isArray(signalsArray) && signalsArray.some((s) => typeof s?.description === "string" && s.description.trim() && !isSyntheticText(s.description));
  const isSynthetic = isSyntheticCrisis(record);
  
  let signalDesc = "";
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

    for (const sig of signalsArray) {
      if (sig.location && isValidLatLng(sig.location.lat, sig.location.lng)) {
        signalLat = Number(sig.location.lat);
        signalLng = Number(sig.location.lng);
        signalAccuracy = sig.location.accuracy ?? null;
        signalReliability = sig.location.reliabilityScore ?? null;
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

  // 2. Description priority (Step 2 SAFE PRIORITY)
  // citizenSignals[i].description -> citizenInput.description || crisis.description || crisis.aiSummary || "No description available"
  const citizenInput = record?.citizenInput || {};
  
  let citizenDesc = "";
  if (signalDesc && signalDesc.trim() && !isSyntheticText(signalDesc)) {
    citizenDesc = signalDesc.trim();
  } else if (citizenInput?.description && typeof citizenInput.description === "string" && citizenInput.description.trim() && !isSyntheticText(citizenInput.description)) {
    citizenDesc = citizenInput.description.trim();
  } else if (record?.description && typeof record.description === "string" && record.description.trim() && !isSyntheticText(record.description)) {
    citizenDesc = record.description.trim();
  } else if (record?.notes && typeof record.notes === "string" && record.notes.trim() && !isSyntheticText(record.notes)) {
    citizenDesc = record.notes.trim();
  }

  // "If citizenSignals exist → NEVER use AI or fallback for display"
  const aiSummary = hasCitizenSignals || isSynthetic ? "" : safe(record?.aiSummary, "");

  let displayDescription = "";
  if (citizenDesc) {
    displayDescription = citizenDesc;
  } else if (!hasCitizenSignals && aiSummary && typeof aiSummary === "string" && aiSummary.trim() && !isSyntheticText(aiSummary)) {
    displayDescription = aiSummary.trim();
  } else if (!hasCitizenSignals && record?.description && typeof record.description === "string" && record.description.trim() && !isSyntheticText(record.description)) {
    displayDescription = record.description.trim();
  }

  // 3. Location & coordinates
  const loc = record?.location || {};
  const payload = record?.payload || {};
  const payloadLoc = payload?.location || {};

  let lat: number | null = null;
  let lng: number | null = null;

  const rawLat = loc?.lat !== undefined ? loc.lat : (payloadLoc?.lat !== undefined ? payloadLoc.lat : payload?.lat);
  const rawLng = loc?.lng !== undefined ? loc.lng : (payloadLoc?.lng !== undefined ? payloadLoc.lng : payload?.lng);

  if (typeof rawLat === "number") lat = rawLat;
  else if (typeof rawLat === "string") {
    const parsed = parseFloat(rawLat);
    if (!isNaN(parsed)) lat = parsed;
  }

  if (typeof rawLng === "number") lng = rawLng;
  else if (typeof rawLng === "string") {
    const parsed = parseFloat(rawLng);
    if (!isNaN(parsed)) lng = parsed;
  }

  // Semantic coordinate fallback
  if (lat === null || lng === null) {
    lat = signalLat;
    lng = signalLng;
  }

  // Strict map coordinate check — uses centralized isValidLatLng (rejects 0,0 / NA / non-finite)
  const safeForMap = !isSynthetic && lat !== null && lng !== null && isValidLatLng(lat, lng);

  const resolvedLocationObj = safeForMap ? { lat: lat!, lng: lng!, name: loc?.name || payloadLoc?.name } : (loc as { lat?: number; lng?: number; name?: string });
  const resolvedLocationLabel = resolveLocationLabel(resolvedLocationObj);
  const locationLabel = resolvedLocationLabel && !/^(not reported|unknown|n\/a|null|undefined)$/i.test(resolvedLocationLabel.trim()) ? resolvedLocationLabel : "";

  // Severity & extra metadata
  const severity = safe(record?.severityString || (record?.severity !== undefined ? String(record?.severity) : null) || (signalSeverity && signalSeverity.trim()), "");
  
  // Resolve accuracy + reliability
  const accuracy = typeof payloadLoc?.accuracy === "number" ? payloadLoc.accuracy
    : typeof loc?.accuracy === "number" ? loc.accuracy
    : signalAccuracy !== null ? signalAccuracy
    : null;
  const reliabilityScore = typeof payloadLoc?.reliabilityScore === "number" ? payloadLoc.reliabilityScore
    : typeof record?.reliabilityScore === "number" ? record.reliabilityScore
    : signalReliability !== null ? signalReliability
    : null;

  // Resolve confidence
  const confidence = typeof record?.confidenceScore === "number" ? record.confidenceScore
    : typeof record?.confidence === "number" ? record.confidence
    : typeof record?.analysis?.confidence === "number" ? record.analysis.confidence
    : typeof record?.rawDecision?.confidence === "number" ? record.rawDecision.confidence
    : null;

  const reporterUserId = safe(record?.citizenInput?.userId || record?.userId, "");
  const maskedUserId = reporterUserId ? `usr_${reporterUserId.slice(-6)}` : "usr_***";

  const citizenSeverity = safe((signalSeverity && signalSeverity.trim()) || citizenInput?.severity || record?.analysis?.citizenSeverity, null);
  const finalSeverity = safe(record?.analysis?.finalSeverity || record?.severityString || (record?.severity !== undefined ? String(record?.severity) : null) || (signalSeverity && signalSeverity.trim()), "");

  const rawTitle = record?.title || record?.subType || record?.eventType || "";
  const title = (rawTitle && rawTitle.trim().toLowerCase() !== "unknown" && !isSyntheticText(rawTitle) ? rawTitle : "");

  const rawDescription = safe(citizenDesc || aiSummary || record?.description, "");
  const normalizedDescription = isSynthetic && !hasCitizenSignals ? "" : displayDescription;

  return {
    id,
    type,
    title: isSynthetic && !hasCitizenSignals ? "" : title,
    citizenName,
    citizenEmail,
    description: isSynthetic && !hasCitizenSignals ? "" : citizenDesc,
    aiSummary,
    displayDescription: normalizedDescription,
    lat: safeForMap ? lat : null,
    lng: safeForMap ? lng : null,
    locationLabel,
    identityState,
    safeForMap,
    severity,
    confidence,
    accuracy,
    reliabilityScore,
    maskedUserId,
    citizenSeverity,
    finalSeverity,
    rawDescription,
    isSynthetic,
    hasCitizenSignals,
    decisionEngine: record?.decisionEngine || null,
    recommendedAction: (() => {
      const ra = record?.recommendedAction || record?.recommendedActions || record?.decisionEngine?.recommendedAction;
      if (Array.isArray(ra)) return ra.join("; ");
      if (typeof ra === "string") return ra;
      return null;
    })(),
    dataSources: record?.dataSources || record?.decisionEngine?.dataSources || null,
    reasoning: (() => {
      const r = record?.reasoning || record?.decisionEngine?.reasoning;
      if (Array.isArray(r)) return r.join("; ");
      if (typeof r === "string") return r;
      return null;
    })(),
    priorityScore: typeof record?.priorityScore === 'number' ? record.priorityScore : (typeof record?.decisionEngine?.priorityScore === 'number' ? record.decisionEngine.priorityScore : null),
  };
}
