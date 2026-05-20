# 🔐 CrisisNexus — Demo Credentials & User Accounts Walkthrough

This guide details all functional user roles within the **CrisisNexus Platform** (Next.js NGO Coordinator Dashboard and Flutter Citizen Mobile Application). 

Each account has been pre-configured in **Firebase Authentication** and has a corresponding user profile in the **Firestore `users` collection** mapping their respective security roles, departments, and clearance scopes.

---

## 🎯 Role Matrix & Credentials

| # | Role / Persona | Email Address | Password | Firestore Role | Clearance Scope | Department / Purpose |
|---|----------------|---------------|----------|----------------|-----------------|----------------------|
| **1** | **Coordinator** | `coordinator@crisisnexus.demo` | `CrisisNexus@2024` | `coordinator` | `FULL_ACCESS` | Emergency Operations Center. Final case verification, overall workflow orchestration, routing, and dispatch. |
| **2** | **Medical Team** | `medical@crisisnexus.demo` | `CrisisNexus@2024` | `medical_team` | `DISPATCH_APPROVE` (Phase 1) | Medical & Triage. Evaluates incident health metrics, validates medical supply availability, and issues Phase 1 clearances. |
| **3** | **Logistics Team** | `logistics@crisisnexus.demo` | `CrisisNexus@2024` | `logistics` | `DISPATCH_APPROVE` (Phase 2/3) | Logistics & Supply Chain. Coordinates bulk aid material packing, manages fleet transport routing, and signs off on resource dispatches. |
| **4** | **Rescue Team** | `rescue@crisisnexus.demo` | `CrisisNexus@2024` | `rescue` | `FIELD_OPS` | Search & Rescue. Handles tactical field response, real-time victim navigation, extraction, and direct mobile status updates. |
| **5** | **Observer** | `observer@crisisnexus.demo` | `CrisisNexus@2024` | `observer` | `READ_ONLY` | Read-Only/Auditor. Global analytical view of active incidents and live telemetry without authorization to modify state. |
| **6** | **Citizen** | `citizen@crisisnexus.demo` | `CrisisNexus@2024` | `citizen` | `CITIZEN_REPORT` | Citizen App User. Submits real-time crisis reports, monitors local status updates, and transmits live panic/beacon telemetry. |

> [!NOTE]
> All passwords have been standardized to `CrisisNexus@2024` (or alternative fallback `12345678` in raw configs) for ease of manual and automated testing.

---

## 🚦 Recommended Role-Based Testing Workflows

To simulate a complete crisis resolution lifecycle, follow this step-by-step workflow:

### Phase 1: Citizen Incident Reporting
1. Open the **Citizen Mobile Application**.
2. Log in using `citizen@crisisnexus.demo`.
3. Submit a new **Medical Emergency / Infrastructure Failure** report at a specific location on the map.
4. Verify that a live document is successfully written to the `crises` Firestore collection.

### Phase 2: Coordinator Triage & Assessment
1. Open the **NGO Dashboard** (`http://localhost:3000`).
2. Log in as `coordinator@crisisnexus.demo`.
3. Locate the newly reported citizen crisis on the live map or incident sidebar.
4. Verify that the **CRIO-2 AI Engine** has processed the event, populated fallback coordinate systems, and computed a priority rating.

### Phase 3: Multi-Stage Dispatch Approvals
1. **Medical Review**: Log in as `medical@crisisnexus.demo`. Verify that you can review the medical triage parameters and issue the first stage of dispatch clearance.
2. **Logistics Planning**: Log in as `logistics@crisisnexus.demo`. Approve the dispatch of rescue supply trucks and relief packages.
3. **Rescue Dispatch**: Log in as `rescue@crisisnexus.demo` (on-field mobile app). Receive the navigation route to the incident location, execute the search, and close the incident.

---

## 🛠️ Script Execution Details

To rebuild or refresh these user accounts in your local/production database at any time, run the custom database utility:

```bash
# Navigate to functions folder
cd crisis_nexus/functions

# Execute creation script
node ../../scratch/createDemoAccounts.js
```

This utility ensures that:
- Every email is registered in **Firebase Authentication**.
- Every registered user receives a matching Firestore user profile in `users/{uid}` matching the credentials matrix above.
