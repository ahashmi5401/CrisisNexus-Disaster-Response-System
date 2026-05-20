# CrisisNexus (CIRO) Manual Verification & Operations Guide

This guide describes how to verify, audit, and operate the hardened disaster response pipelines, security models, real-time observability metrics, and the operator dashboard.

---

## 1. PIPELINE VALIDATION & METRICS VERIFICATION

### 1.1 Trigger Event Queue Submission
To verify the normalized event pipeline and the Dual-Pipeline Event Router, submit a mock event to the `/event_queue` collection in Firestore.

**JSON Schema for a Normalized Crisis Event:**
```json
{
  "type": "event",
  "eventType": "crisis",
  "subType": "flood",
  "payload": {
    "userId": "test_citizen_uid",
    "location": {
      "lat": 37.7749,
      "lng": -122.4194
    },
    "description": "Severe flooding near downtown main street, rising rapidly.",
    "affectedPopulation": 120
  },
  "status": "pending",
  "retryCount": 0,
  "createdAt": "serverTimestamp"
}
```

**JSON Schema for a Normalized Relief Event:**
```json
{
  "type": "event",
  "eventType": "relief",
  "subType": "shelter",
  "payload": {
    "userId": "test_citizen_uid",
    "location": {
      "lat": 37.7801,
      "lng": -122.4120
    },
    "needs": "blankets, clean water, immediate medical supplies",
    "numberOfPeople": 45
  },
  "status": "pending",
  "retryCount": 0,
  "createdAt": "serverTimestamp"
}
```

### 1.2 Observable Metrics Validation
Once the event queue processor runs, check the `/system_metrics/realtime` document. You should observe:
- `events_processed`: Incremented atomically.
- `avg_processing_time`: Recalculated dynamically without race conditions.
- `queue_backlog_size`: Dynamically calculated queue size.
- `circuit_breaker_status`: `HEALTHY` or `DEGRADED`.

---

## 2. FIRESTORE SECURITY RULES VERIFICATION

### 2.1 Locked Crises Collection
Validate that the `/crises` collection is write-locked for client-side SDK traffic.
- **Expected Behavior:** Any attempt from client-side Web/Flutter apps to `create`, `update`, or `delete` documents in `/crises` MUST fail with a `permission-denied` exception. Only the server-side Cloud Function Admin SDK can write.

### 2.2 Aid Request Lifecycle Rules
Verify that:
- Citizens can create aid requests bound strictly to their verified `userId`.
- Only NGO operators can transition the `status` field.
- Citizens cannot change the status or other metadata once created.

---

## 3. MANUAL EMERGENCY RECOVERY & RETRY PROCEDURE

### 3.1 Failure Detection
If a Cloud Function processing error occurs, it will log the incident with an infrastructure failure label:
`[INFRASTRUCTURE ENGINE] Processing failure. Retry: X. Error: ...`

### 3.2 Automated Retries
- The processing engine automatically handles failures up to **3 times** with exponential backoff.
- The event's `status` field will update to `failed` once all retry attempts are exhausted.

### 3.3 Manual Recovery Trigger
To manually recover and reprocess a stalled or failed event:
1. Locate the document in `/event_queue/{eventId}` in the Firestore console.
2. Edit the document attributes:
   - Change `status` to `"pending"`.
   - Set `retryCount` to `0`.
3. Save changes. The Cloud Function trigger `onCreate` or your manual batch recovery trigger will immediately pick up and re-process the event.

---

## 4. NGO DASHBOARD DYNAMIC METRICS VALIDATION

### 4.1 Verify Dynamic Metrics
Launch the NGO Next.js Dashboard and verify that hardcoded values are replaced:
- **Emergency Logistics Director View:** Displays real-time dynamic logistics status calculated as `[Resolved Logistics Events / Total Logistics Events] * 100%`.
- **Rescue Squad Commander View:** Displays real-time dynamic rescue status calculated as `[Resolved Rescue Events / Total Rescue Events] * 100%`.

All calculations are tied directly to the active `/crises` collection in Firestore.
