# NGO Dashboard Production Hardening & Data Integrity Fix Plan

## 1. System Audit Summary
We audited the live Next.js + Firestore Dashboard (`crisis_nexus_ngo/`) and cross-referenced it with live Firestore schemas (`crises`, `relief_requests`, `users`, `event_queue`, `ciro_intelligence`). The frontend is highly responsive and feature-rich, but suffers from key edge-case data rendering bugs, false mobile degradation triggers, unverified identity states, and latent risk of map crash when coordinates are corrupted or empty.

## 2. Data Mismatches (Firebase vs UI)
- **Coordinates Resolution:** Firestore coordinates inside `event_queue` and `relief_requests` are nested under `payload.location.lat` / `payload.location.lng` or flat `payload.lat` / `payload.lng`. The data quality engine inside `DataQualityLayer.tsx` only parses `item.lat` and `item.location.lat`, completely missing payload values. This creates a false mismatch between the map (which successfully renders) and the quality layer (which reports missing location).
- **User Document Schema:** The Firestore `users` collection saves identity labels as `name` and `email` directly at the root, while the UI relies heavily on nested auth mappings like `profile.displayName` or `profile.profile.email`.

## 3. CrisisCard Issues (Truth vs AI vs Fallback Contamination)
- **AI Override:** If a crisis fails its Gemini execution, the backend writes a synthetic fallback summary ("Emergency heuristic fallback activated...") directly to the root `description` field. The UI's `resolveCitizenDescription` method uses `firstNonEmptyString(ci.description, record.description, record.notes)` which displays this synthetic message under the **Citizen Report** section, polluting citizen truth.
- **Title Fallbacks:** If titles are missing or resolved to `"Unknown"`, they should instantly fallback to a clean, clinical constant `"CRITICAL INCIDENT"` to preserve dashboard clarity.

## 4. Map Crash Risks
- **Circle Radius:** Google Maps `<Circle>` will crash the entire dashboard runtime if `radius={crisis.radiusKm * 1000}` is evaluated with a non-numeric, null, or undefined `radiusKm`.
- **Map Center Pin:** The `mapCenter` selection will crash if it references invalid or non-finite coordinates. A robust check is needed.

## 5. Identity Resolution Issues
- **UNVERIFIED False Positives:** The dynamic Firestore profiles fetched inside `CrisisCard.tsx` and `ReliefQueue.tsx` are not propagated to `isCitizenIdentityVerified()`. Thus, even registered citizens with names like "Muhammad Ayan Hashmi" are flagged as `UNVERIFIED` because the engine checks the un-enriched record.

## 6. Relief Pipeline Mismatches
- **Relief Case Groups:** Expanded needs inside `ReliefQueue` render flat requests. Pre-fetching logic for users uses `profile.displayName` which returns `undefined` for actual citizen records using `name` in the Firestore database.

---

## 7. Fix Priority List (TOP 5 Only)

### Priority 1: Citizen-First Truth Isolation
- Refactor `resolveCitizenDescription` and `normalizeNGORecord` to prioritize `citizenInput.description`, and ignore synthetic fallback strings in root `description` fields.

### Priority 2: Google Maps Crash Proofing
- Add strict type verification for circular radius bounds and memoized cluster coordinate checks inside `MapOpsLayer.tsx`.

### Priority 3: Identity Registry Propagation
- Update `isCitizenIdentityVerified()` and `resolveCitizenIdentity()` to accept and evaluate dynamic user profile data, correcting `UNVERIFIED` false triggers.

### Priority 4: Data Quality Logic Alignment
- Add support for nested `payload.location` paths to the `hasLat`/`hasLng` check in `calculateDataIntegrity` to eliminate false `MOBILE_DEGRADED` triggers.

### Priority 5: Record Telemetry Completeness
- Update `normalizeNGORecord` mapping to preserve `decisionEngine`, `priorityScore`, `reasoning`, and `recommendedActions` so critical Firestore metrics are not dropped during UI normalization.

---

## 8. Minimal Safe Patch Strategy

1. **`lib/displayUtils.ts`:**
   - Update `resolveCitizenIdentity` and `isCitizenIdentityVerified` to accept and utilize `profileData` to avoid identity flips.
   - Refactor `resolveCitizenDescription` to skip synthetic text fallbacks (e.g. starting with "Emergency heuristic", "Local simulator") and prioritize true citizen reports.

2. **`lib/normalizeNGORecord.ts`:**
   - Integrate full `decisionEngine`, `priorityScore`, `reasoning`, and `recommendedActions` mapping to prevent field loss.

3. **`components/DataQualityLayer.tsx`:**
   - Update `calculateDataIntegrity` coordinates resolution to match `normalizeNGORecord` and fix `MOBILE_DEGRADED` false alarms.

4. **`components/MapOpsLayer.tsx`:**
   - Guard circle rendering against non-numeric `radiusKm`.
   - Implement robust `mapCenter` fallback scanning.

5. **`components/ReliefQueue.tsx`:**
   - Correct identity mapping inside case list rendering to read `name` from pre-fetched users.
