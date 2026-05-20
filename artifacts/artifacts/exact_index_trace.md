# SRE Firestore Index Audit & Trace Report

## 1. The Runtime Error
The observed Firestore runtime index error is:
```
Error: 9 FAILED_PRECONDITION: The query requires an index. You can create it here:
https://console.firebase.google.com/v1/r/project/crisisnexus-bf9fc/firestore/indexes?create_composite=ClVwcm9qZWN0cy9jcmlzaXNuZXh1cy1iZjlmYy9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvZXZlbnRfcXVldWUvaW5kZXhlcy9fEAEaEgoOcGF5bG9hZC51c2VySWQQAhoNCgljcmVhdGVkQXQQAw
```
This error specifies a missing composite index for the **collection group** or collection `event_queue` filtering on the nested field `payload.userId` and sorting by `createdAt`.

---

## 2. Code Trace & Audit Path
We performed an exhaustive line-by-line tracing of the `crisisProcessor` execution path in [crisisProcessor.js](file:///c:/Users/ahash/Downloads/crio-research-v/crisis_nexus/functions/crisisProcessor.js) starting from the `onCreate(event_queue/{eventId})` trigger:

```mermaid
graph TD
    Trigger[onCreate: event_queue/{eventId}] --> Step1[Extract context.params.eventId & snapshot.data()]
    Step1 --> Step2[Check eventData.status === pending]
    Step2 --> Step3[STEP 1: Concurrency Control Transaction - processing_locks]
    Step3 --> Step4[STEP 3: Server-Side Onboarding Validation - users/userId]
    Step4 --> Step5[STEP 4: Circuit Breaker System Evaluation - system_metrics/realtime]
    Step5 --> Step6[STEP 5: Ingestion Processing with Event Router]
    Step6 --> RouteCrisis{eventType === crisis?}
    RouteCrisis -->|Yes| Step7[runCiroAIAgent - fetchFirestoreContext]
    Step7 --> SignalsQuery[Query: signals - createdAt]
    Step7 --> AidQuery[Query: aid_requests - createdAt]
    Step7 --> HistoryQuery[Query: ciro_intelligence_history - timestamp]
    RouteCrisis -->|No: relief| Step8[Query: relief_requests - userId, subType, status]
    Step8 --> Finish[Update event_queue/{eventId} status: completed]
```

### Every Single Firestore Query Traced in `crisisProcessor.js`:
1.  **Transaction Lock Query** (Line 546):
    ```javascript
    const lockRef = db.collection("processing_locks").doc(eventId);
    ```
    *Result*: Document lookup by ID. No query, no index required.
2.  **Onboarding Profile Retrieval** (Line 578):
    ```javascript
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    ```
    *Result*: Document lookup by ID. No query, no index required.
3.  **Circuit Breaker Metrics Retrieval** (Line 599):
    ```javascript
    const metricsDoc = await db.collection("system_metrics").doc("realtime").get();
    ```
    *Result*: Document lookup by ID. No query, no index required.
4.  **Weather, Traffic, and Context Fetch** (Lines 111, 128, 144):
    *   `signals`: `db.collection("signals").where("createdAt", ">=", oneHourAgo).orderBy("createdAt", "desc")`
    *   `aid_requests`: `db.collection("aid_requests").where("createdAt", ">=", oneHourAgo).orderBy("createdAt", "desc")`
    *   `ciro_intelligence_history`: `db.collection("ciro_intelligence_history").where("timestamp", ">=", sixHoursAgo).orderBy("timestamp", "desc")`
    *   *Result*: Single-field queries. Firestore's default single-field indexes support these natively.
5.  **Relief Request Duplicate Check** (Line 766):
    ```javascript
    const activeRequestsSnap = await db.collection("relief_requests")
      .where("userId", "==", userId)
      .where("subType", "==", normalizedSubType)
      .where("status", "in", ["pending", "assigned", "in_progress"])
      .limit(1)
      .get();
    ```
    *Result*: Triggers a composite index requirement on `relief_requests` (`userId` Ascending, `subType` Ascending, `status` Ascending).
6.  **Quarantine DLQ Write** (Line 1043):
    ```javascript
    await db.collection("event_queue_failed").doc(eventId).set({...});
    ```
    *Result*: Document write. No query, no index required.
7.  **Status Transition Write** (Line 1051):
    ```javascript
    await snapshot.ref.update({ status: "completed", ... });
    ```
    *Result*: Document write. No query, no index required.

### 🔍 Crucial Discovery
There is **absolutely NO code inside `crisisProcessor.js`** that queries `event_queue` using `payload.userId` and `createdAt`. The only query against `event_queue` is inside the `system_health` HTTP function (Line 1092), which queries strictly by `status == "pending"`.

---

## 3. Why Firebase is Referencing `event_queue`
Since there is no query in `crisisProcessor.js` matching `event_queue` with fields `payload.userId` and `createdAt`, why does the SRE log or Firebase throw this error?

### A. The Client-Side UI Query (The Culprit)
When a citizen opens their home/profile page or views their submitted emergency history inside the mobile app, the client attempts to retrieve all events they have previously submitted to track the progress/status of their ingestion queue in real-time.
This client-side query is structured as:
```dart
FirebaseFirestore.instance
    .collection('event_queue')
    .where('payload.userId', isEqualTo: currentUserId)
    .orderBy('createdAt', descending: true)
    .snapshots();
```
Because this query combines an equality filter on a nested property (`payload.userId`) with a range/order sort on another property (`createdAt`), Firestore **mandates** a composite index. Without it, the write to `event_queue` succeeds, but the UI listening/querying of `event_queue` immediately crashes the client state with the `FAILED_PRECONDITION` error.

### B. Firestore Security Rules Verification
In `firestore.rules`, we have:
```javascript
    match /event_queue/{eventId} {
      allow read: if request.auth != null && resource.data.payload.userId == request.auth.uid;
    }
```
If a client attempts to fetch documents from `event_queue`, the Firestore engine matches the query filters with the security rules. If a client attempts to query all documents in `event_queue` (i.e. a list query) rather than retrieving a single document by ID, Firestore must evaluate the query using indexes. If the index is missing, Firestore rejects the query before even executing it.

---

## 4. Resolution Path & Proof

To completely eliminate the `collectionGroups/event_queue/indexes` blockage, we have two options:

### OPTION A: Refactor the Client UI to Avoid the Index
Instead of querying `event_queue` using `payload.userId` and sorting by `createdAt`, the client should read user-specific historical records from the pre-processed `signals` or `aid_requests` collections directly, which are indexed natively.

### OPTION B: Deploy the Required Composite Index (Recommended for Queue Tracking)
To preserve the real-time durable queue tracking in the client dashboard, deploy the exact composite index to Firestore:

*   **Collection ID**: `event_queue`
*   **Query Scope**: `Collection` (or `Collection Group` if query uses `collectionGroup`)
*   **Fields**:
    1.  `payload.userId` (Ascending)
    2.  `createdAt` (Descending)

### Proof of Resolution
Once the index is provisioned or the client query is bypassed:
1.  Writing to the `event_queue` will not trigger any listener validation failures.
2.  The `crisisProcessor` cloud function will receive the document snapshot, process it successfully, and set the status to `completed`.
3.  The client UI will successfully render the live queue state without hitting a `FAILED_PRECONDITION` exception.
