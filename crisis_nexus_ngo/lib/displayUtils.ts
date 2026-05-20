import {
  resolveCitizenIdentity,
  isCitizenIdentityVerified,
  isValidLatLng,
  isSyntheticText
} from "./safeCrisisResolver";

export { resolveCitizenIdentity, isCitizenIdentityVerified };

const PLACEHOLDER_ZONE_NAMES = new Set(["Target Zone", "Fusion Zone", "Hybrid Zone", "Fallback Zone"]);

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

interface DisplayProfile {
  displayName?: string;
  name?: string;
  email?: string;
  phone?: string;
  profile?: DisplayProfile;
}

interface CitizenInput {
  name?: string;
  displayName?: string;
  description?: string | null;
  severity?: string;
  userEmail?: string;
  userId?: string;
}

interface DisplayLocation {
  lat?: number | string | null;
  lng?: number | string | null;
  name?: string;
  accuracy?: number;
  reliabilityScore?: number;
}

export interface DisplayRecord extends Record<string, unknown> {
  profile?: DisplayProfile;
  profileData?: DisplayProfile;
  citizenInput?: CitizenInput;
  location?: DisplayLocation;
  payload?: { location?: DisplayLocation; lat?: number | string | null; lng?: number | string | null };
  analysis?: { finalSeverity?: string; citizenSeverity?: string; severityBadge?: string };
  _display?: { citizenName?: string; lat?: number | null; lng?: number | null; confidence?: number | null; accuracy?: number | null; reliabilityScore?: number | null };
}

/** Main-view description: citizen truth only (no AI summary) */
export function resolveCitizenDescription(record: DisplayRecord | null | undefined): string {
  if (!record || typeof record !== "object") return "";
  const ci = (record.citizenInput ?? {}) as CitizenInput;
  const candidates = [ci.description, record.description, record.notes];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const trimmed = c.trim();
      if (!isSyntheticText(trimmed)) {
        return trimmed;
      }
    }
  }
  return "";
}

/** Resolve lat/lng from crisis root location or payload.location (no synthetic coords). */
export function resolveCrisisCoordinates(record: DisplayRecord | null | undefined): { lat: number; lng: number } | null {
  if (!record || typeof record !== "object") return null;
  const loc = record.location ?? {};
  const payloadLoc = record.payload?.location ?? {};
  const lat = typeof loc.lat === "number" ? loc.lat : typeof payloadLoc.lat === "number" ? payloadLoc.lat : null;
  const lng = typeof loc.lng === "number" ? loc.lng : typeof payloadLoc.lng === "number" ? payloadLoc.lng : null;
  if (lat === null || lng === null || !isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

/** Lowercase NGO workflow status for stepper / role-action matching. */
export function normalizeWorkflowStatus(status: unknown): string {
  const s = (status ?? "new").toString().toLowerCase();
  if (s === "reported" || s === "provisional" || s === "confirmed") return "new";
  if (s === "approved") return "triaged";
  return s;
}

export function resolveLocationLabel(location?: { lat?: number; lng?: number; name?: string } | null): string {
  if (!location || typeof location !== "object") return "Not Reported";
  const { lat, lng, name } = location;
  if (typeof name === "string" && name.trim() && !PLACEHOLDER_ZONE_NAMES.has(name) && !isSyntheticText(name)) {
    return name.trim();
  }
  if (typeof lat === "number" && typeof lng === "number" && isValidLatLng(lat, lng)) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  if (typeof name === "string" && name.trim() && !isSyntheticText(name)) return name.trim();
  return "Not Reported";
}

// ── Task 4: UI-Safe Display Normalizer ───────────────────────────────────────
// Prepares a crisis object for rendering. Does NOT mutate the original.
export function normalizeDisplayCrisis(crisis: DisplayRecord | null | undefined, profileData?: DisplayProfile | DisplayRecord | null): Record<string, unknown> {
  if (!crisis || typeof crisis !== "object") return {};
  const c = crisis as any;

  const loc = c.location ?? {};
  const payload = c.payload ?? {};
  const payloadLoc = payload.location ?? {};
  const citizenInput = c.citizenInput ?? {};
  const analysis = c.analysis ?? {};

  // Resolve lat/lng from root location or payload.location
  const lat: number | null = typeof loc.lat === "number" ? loc.lat
    : typeof payloadLoc.lat === "number" ? payloadLoc.lat
    : null;
  const lng: number | null = typeof loc.lng === "number" ? loc.lng
    : typeof payloadLoc.lng === "number" ? payloadLoc.lng
    : null;

  // Resolve accuracy + reliability
  const accuracy: number | null = typeof payloadLoc.accuracy === "number" ? payloadLoc.accuracy
    : typeof loc.accuracy === "number" ? loc.accuracy
    : null;
  const reliabilityScore: number | null = typeof payloadLoc.reliabilityScore === "number" ? payloadLoc.reliabilityScore
    : typeof c.reliabilityScore === "number" ? c.reliabilityScore
    : null;

  // Resolve confidence
  const confidence: number | null = typeof c.confidenceScore === "number" ? c.confidenceScore
    : typeof c.confidence === "number" ? c.confidence
    : null;

  // Resolve citizen identity fields
  const reporterEmail: string = (citizenInput.userEmail || c.userEmail || "") as string;
  const reporterUserId: string = (citizenInput.userId || c.userId || "") as string;
  const maskedUserId: string = reporterUserId ? `usr_${reporterUserId.slice(-6)}` : "usr_***";

  // Citizen-first description (main card); AI only for truth-panel fallback
  const citizenDescription: string = resolveCitizenDescription(crisis);
  const rawDescription: string = (citizenDescription || c.aiSummary || c.description || "") as string;

  const locationLabel: string = resolveLocationLabel(
    lat !== null && lng !== null ? { lat, lng, name: loc.name } : { lat: undefined, lng: undefined, name: loc.name }
  );

  const citizenName: string = resolveCitizenIdentity(crisis, profileData);
  const citizenSeverity: string | null = firstNonEmptyString(
    analysis.citizenSeverity,
    citizenInput.severity
  );
  const finalSeverity: string =
    firstNonEmptyString(analysis.finalSeverity, c.severityString, String(c.severity ?? "")) ?? "UNKNOWN";

  const rawTitle = c.title || c.subType || c.eventType || "";
  const title = (rawTitle && rawTitle.trim().toLowerCase() !== "unknown" ? rawTitle : "CRITICAL INCIDENT");

  return {
    ...crisis,
    title,
    _display: {
      lat,
      lng,
      accuracy,
      reliabilityScore,
      confidence,
      reporterEmail,
      reporterUserId,
      maskedUserId,
      citizenName,
      citizenDescription,
      rawDescription,
      locationLabel,
      citizenSeverity,
      finalSeverity,
    },
  };
}

// ── Task 3: Reality Accuracy Badge ───────────────────────────────────────────
export type RealityBadge = "HIGH REALITY" | "ESTIMATED" | "PARTIAL DATA";

export function computeRealityBadge(crisis: DisplayRecord): RealityBadge {
  const d = crisis._display ?? {};
  const loc = crisis.location ?? {};
  const payloadLoc = (crisis.payload ?? {}).location ?? {};

  const hasGps = d.lat !== null && d.lng !== null;
  const accuracy: number | null = d.accuracy ?? null;
  const reliabilityScore: number | null = d.reliabilityScore ?? null;
  const confidence: number | null = d.confidence ?? null;

  // HIGH REALITY: has GPS + high accuracy + high reliability
  if (
    hasGps &&
    accuracy !== null && accuracy < 20 &&
    reliabilityScore !== null && reliabilityScore > 0.8
  ) {
    return "HIGH REALITY";
  }

  // PARTIAL DATA: missing GPS or multiple null critical fields
  const nullCount = [
    d.lat === null,
    d.lng === null,
    d.confidence === null,
    !crisis.citizenInput?.userEmail && !crisis.userEmail,
    crisis.affectedPopulation === null || crisis.affectedPopulation === undefined,
  ].filter(Boolean).length;

  if (!hasGps || nullCount >= 3) {
    return "PARTIAL DATA";
  }

  // ESTIMATED: default
  return "ESTIMATED";
}

export function getRealityBadgeStyle(badge: RealityBadge): string {
  switch (badge) {
    case "HIGH REALITY":
      return "bg-emerald-500/15 border-emerald-500/40 text-emerald-400";
    case "ESTIMATED":
      return "bg-amber-500/15 border-amber-500/40 text-amber-400";
    case "PARTIAL DATA":
      return "bg-rose-500/15 border-rose-500/40 text-rose-400";
  }
}

// ── Task 2: Relief Request Grouping ──────────────────────────────────────────
export interface ReliefNeed {
  id: string;
  subType: string;
  status: string;
  priorityScore?: number;
  notes?: string;
  description?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  location?: Record<string, unknown>;
  userId?: string;
  urgency?: string;
  duplicateCheckStatus?: string;
}

export interface ReliefCase {
  /** The shared eventId (doc IDs are `${eventId}_${subType}`) */
  eventId: string;
  userId: string;
  needs: ReliefNeed[];
  /** Highest-priority need drives the case card status */
  dominantStatus: string;
  dominantPriority: number;
  location?: Record<string, unknown>;
  createdAt?: unknown;
  /** True if multiple subTypes exist under same eventId */
  isMultiNeed: boolean;
}

/**
 * Groups flat relief_requests by eventId.
 *
 * Doc ID format from backend: `${eventId}_${subType}` (new multi-need)
 * or just `${eventId}` (legacy single-need).
 *
 * Extraction: strip known subType suffixes to get the base eventId,
 * then group all docs sharing that base.
 */
export function groupReliefByEvent(requests: Array<Record<string, unknown> & { id?: string; requestId?: string; eventId?: string; userId?: string; subType?: string; type?: string; status?: string; priorityScore?: number; notes?: string; description?: string; createdAt?: unknown; updatedAt?: unknown; location?: Record<string, unknown>; urgency?: string; duplicateCheckStatus?: string }>): ReliefCase[] {
  const KNOWN_SUBTYPES = ["medical_aid", "food", "shelter", "water", "logistics", "rescue"];

  const extractEventId = (docId: string): string => {
    for (const sub of KNOWN_SUBTYPES) {
      if (docId.endsWith(`_${sub}`)) {
        return docId.slice(0, docId.length - sub.length - 1);
      }
    }
    // Also try `eventId` field if present (new backend writes it)
    return docId;
  };

  // Build a map: resolvedEventId → raw docs
  const map = new Map<string, Array<Record<string, unknown> & { id?: string; requestId?: string; eventId?: string; userId?: string; subType?: string; type?: string; status?: string; priorityScore?: number; notes?: string; description?: string; createdAt?: unknown; updatedAt?: unknown; location?: Record<string, unknown>; urgency?: string; duplicateCheckStatus?: string }>>();

  for (const req of requests) {
    // Prefer explicit eventId field (backend writes this on multi-need docs)
    const resolvedId: string = req.eventId || extractEventId(req.id || req.requestId || "");
    const bucket = map.get(resolvedId) ?? [];
    bucket.push(req);
    map.set(resolvedId, bucket);
  }

  const cases: ReliefCase[] = [];

  map.forEach((docs, eventId) => {
    // Sort needs by priorityScore desc
    const sorted = [...docs].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
    const top = sorted[0];

    const needs: ReliefNeed[] = sorted.map(d => ({
      id: d.id || d.requestId || "",
      subType: d.subType || d.type || "general",
      status: d.status || "PENDING",
      priorityScore: d.priorityScore,
      notes: d.notes || d.description,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      location: d.location,
      userId: d.userId,
      urgency: d.urgency,
      duplicateCheckStatus: d.duplicateCheckStatus,
    }));

    cases.push({
      eventId,
      userId: top.userId || "",
      needs,
      dominantStatus: top.status || "PENDING",
      dominantPriority: top.priorityScore ?? 0,
      location: top.location,
      createdAt: top.createdAt,
      isMultiNeed: docs.length > 1,
    });
  });

  // Sort cases by dominantPriority desc then createdAt desc
  cases.sort((a, b) => {
    if (b.dominantPriority !== a.dominantPriority) return b.dominantPriority - a.dominantPriority;
    const ta = (a.createdAt as any)?.seconds ?? 0;
    const tb = (b.createdAt as any)?.seconds ?? 0;
    return tb - ta;
  });

  return cases;
}
