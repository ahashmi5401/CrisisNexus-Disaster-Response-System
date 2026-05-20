# CrisisNexus: Implementation Plan

## 📌 Project Overview
**CrisisNexus** is a highly resilient, intelligent crisis management ecosystem designed to bridge the gap between citizens in distress and NGO responders. The **Citizen App** serves as the primary data ingestion point and aid-request interface, operating with mission-critical stability under real-world emergency pressures.

---

## 🛠️ Technology Stack
- **Framework**: Flutter (Dart)
- **Backend**: Firebase (Authentication, Firestore, Cloud Functions)
- **Architecture**: Multi-Role Service Oriented Architecture (fully aligned with the `Multi-CrisisNexus` master specification)

---

## 🏗️ Core Architecture & Stabilization

The system is divided into three distinct layers as defined in the high-level architecture:
1. **Input Layer**: Citizen app for real-time signal and aid request generation.
2. **Processing Layer (Firebase + CIRO)**:
   - **Signal Ingestion**: Normalizing data for CIRO analysis.
   - **CIRO Engine**: Computing real-time risk scores and compiling intelligence factors.
   - **ReliefCycle**: Deduplicating and managing aid requests.
3. **Output Layer**: Real-time status updates and NGO-facing database streams.

---

## 🚀 Functional Modules & Stability Upgrades

### 1. Mandatory Citizen Onboarding Guard & Real Live GPS Location Ingestion Layer
To ensure the `users/{uid}` collection never contains null or incomplete profile fields and captures real live GPS tracking details, a robust location module has been integrated:
* **The Guard**: Converts the Home Screen to a Stateful interceptor checking `profile.displayName` and `profile.phone`. If empty, it redirects the citizen immediately to `/onboarding`.
* **The Onboarding Form**: A high-fidelity, validated form collecting displayName, phone, age, gender, and permission clearances.
* **The Real Live GPS Permission Flow**:
  - Automatically requests system GPS permission using standard Geolocator check/request routines.
  - If permissions are declined, the app proceeds gracefully, maintaining `null` safely without database failures or runtime crashes.
* **MODE A — Single Fix Ingestion**:
  - Pinpoints user's location upon onboarding submission to capture permanent `homeLat` and `homeLng` coordinates.
* **MODE B — Continuous Live Tracking**:
  - Activates a highly optimized battery-friendly Geolocator stream listener upon login / verified home navigation.
  - Tracks and updates `lastKnownLat` and `lastKnownLng` in `users/{uid}` every 10 meters distance delta.
  - Automatically terminates and cleans up the active stream listener on sign-out to prevent resources or battery leakage.
* **Locked Stats Protection**: The submission strictly writes using dot-notation updates (`profile.*`, `permissions.*`, `location.*`), preventing any client-side modification of system-controlled fields (`stats.totalReports`, `stats.totalAidRequests`, `stats.riskScore`).

### 2. Fail-Safe Crisis Ingestion Pipeline (NEW STABILIZATION LAYER)
To guarantee that a processed crisis intelligence document is **always** created upon signal submission, the ingestion pipeline has been completely decoupled:
* **The Process**:
  1. **STEP 1**: Writes raw signal directly to `/signals/{signalId}`.
  2. **STEP 2**: Attempts CIRO enrichment and write to `/crises` within an isolated `try-catch` sub-layer.
  3. **STEP 3**: If Step 2 fails (due to index delay, network loss, or rule blocks), the system **instantly activates a fallback writer** to create the crisis document using high-confidence defaults:
     * `severity`: Mapped from signal (1-5 integer)
     * `confidence`: `0.8`
     * `keyFactors`: `["citizen_report", "ciro_fallback_activated"]`
  4. **STEP 4**: Safely triggers user stats and risk score updates, completely unaffected by processing anomalies.
* **Benefit**: Ensures the core crisis collection never remains empty and the client UI never crashes due to processing blockers.

### 3. Smart Aid System (ReliefCycle)
* Resource request management (Food, Water, Shelter, Medical Care).
* **Deduplication Engine**: Enforces a unique `dedupKey` (`userId_type`) to block duplicate requests, preventing resource inflation.

### 4. CIRO Risk Engine
* Proprietary scoring algorithm:
  * **Signal Ingest**: Base 10pts * Severity Multiplier: `Low (1x)`, `Medium (1.5x)`, `High (2x)`, `Critical (3x)`.
  * **Aid Request Ingest**: `+5` points.
  * **Recency Weighting**: `+20%` boost for user activity in the last 24 hours.

### 5. Hardened Security Rules (`firestore.rules`)
* **UID-Level Isolation**: Restricts citizens to only read/write their own profiles, signals, and aid requests.
* **Open Crisis Feed**: Allows authenticated users to query the `/crises` feed in real time for nearby threats.
* **Role-Based NGO Status Writes**: Restricts request status alterations to verified NGO roles.

### 6. Architectural Hardening: Single Source of Truth
To eliminate UI-driven database anomalies, a robust, centralized architectural pattern has been established:
* **The Controller (`lib/core/crisis_ingestion_controller.dart`)**: Serves as the sole orchestrator of all reads and writes to the `/signals`, `/crises`, and `/aid_requests` collections.
* **Onboarding Completeness Enforcer**: Before committing any write, the controller reads the citizen profile from `/users/{uid}` and validates the presence of all required fields (`displayName`, `phone`, `age`, `gender`). If any field is incomplete, it instantly throws a strict operational exception and blocks the ingestion.
* **Global Onboarding Guard Interceptor (`lib/core/onboarding_guard.dart`)**: Implements a strict route interceptor on `HomeScreen`, `ReportEmergencyScreen`, `RequestAidScreen`, `NearbyCrisesScreen`, and `ProfileScreen`. On initialization, the guard queries Firestore; if profile registries are incomplete, it immediately forces a redirection to the onboarding portal, preventing bypasses.
* **Decoupled Fail-Safe Pipeline**: Isolates external dependencies (like the CIRO scoring engine) in try-catch sub-layers and automatically activates high-confidence defaults in a fallback pipeline, ensuring that `/crises` and stats updates are written successfully every time without client crashes.

### 7. Emergency-Grade Distributed Ingestion Event Queue
To transform the codebase from a basic CRUD application into a highly resilient, emergency-grade event-driven infrastructure, a state-managed Event Ingestion Queue has been implemented:
* **The Event Queue (`lib/core/crisis_event_queue.dart`)**: Completely decouples the UI / Controller layer from the Firestore layer. Direct writes are strictly prohibited; instead, actions are packaged as discrete `CrisisEvent` models and committed to a fast, non-blocking in-memory queue.
* **Outbox Persistent Logging**: All enqueued events are instantly written to the `/event_logs` collection to guarantee durability, auditing, and recovery across sudden application restarts or network drops.
* **Background Worker Processor Thread**: An active, asynchronous background loop runs periodically to consume pending events from the queue, execute deep profile validation checks, call the CIRO engine, and write normalized data to Firestore.
* **Guaranteed Delivery Engine**: Deploys an exponential backoff retry mechanism (max 3 retries). If an ingestion event encounters temporary fires (e.g. timeout, network index delay), the background worker delays retries (4s, 8s, 16s...) before gracefully logging a permanently `failed` state under `/event_logs` on complete exhaustion, preventing all silent failures.

### 8. Server-Side Truth Engine
To ensure the platform operates as a secure, disaster-scale emergency system, all ingestion, validation, and analytics have been offloaded to the cloud:
* **The Function (`/functions/crisisProcessor.js`)**: An event-driven Firebase Cloud Function that triggers automatically when a new document is written to the `/event_queue` Firestore collection.
* **Lightweight Input Device Client**: Flutter now operates strictly as a lightweight data generator. All local CPU/battery intensive background loops, processing timers, and validation queries are completely purged.
* **Centralized Security and Compliance**: The server validates user onboarding profiles directly inside the Cloud Function execution boundary, preventing any malicious client bypass or code tampering.
* **Robust Real-Time Processing**: The Cloud Function processes signals, applies server-side CIRO risk formulas, logs verified crises, manages deduplicated aid cycles, updates stats, and writes standard transaction logs safely in a unified backend loop.

### 9. Consistency, Idempotency, & Real-Time Diagnostics
To harden the backend Truth Engine for high-volume emergency environments, several reliability and observability layers have been established:
* **Absolute Single Source of Truth**: All client-side scoring logic and impact calculations have been completely deleted from the Flutter codebase, securing the server as the sole arbiter of operational intelligence.
* **Idempotency Guarantee**: Deploys `eventId` as the global idempotency key across the ingestion pipeline. If an event is triggered multiple times (e.g., connection flap retries), the function intercepts it and skips duplicate database entries.
* **Dead Letter Queue (DLQ)**: Implements `/event_queue_failed` as a secure quarantine log collection.
* **Resilient Retry Framework (5 Max)**: Cloud Functions utilize exponential backoff delays (up to 5 attempts) to process events safely through network spikes and indexing delays.
* **Metrics Observability**: The system automatically aggregates system telemetry (`events_received`, `events_processed`, `events_failed`, `avg_processing_time`, `queue_backlog_size`) under `/system_metrics/realtime`.
* **Diagnostics Health Endpoint**: Exposes a GET `/system_health` Cloud Function endpoint reporting overall health status (`healthy`, `degraded`, `critical`), queue depth, latency averages, and failure ratios in real-time.

### 10. Concurrency Locking & SRE Reliability Hardening
For high-scale concurrent load protection under massive natural disasters, several robust infrastructure shields have been added to the Cloud Ingestion Processor:
* **Distributed Lock Manager**: Uses a Firestore transactional write on `/processing_locks/{eventId}`. The worker acquires this lock before execution and deletes it post-processing, preventing duplicate executions or database race conditions.
* **Decoupled Queue Trigger Layer**: Deploys the Firestore event stream to Pub/Sub / Cloud Tasks triggering pattern, separating event storage from worker thread execution.
* **User Rate-Limit Protection**: Enforces rate limiting per citizen user ID (max 5 events per minute) inside the function transaction, preventing accidental input spam or client misbehavior.
* **Intelligent Circuit Breaker**: Automatically tracks failure ratios and backlog depths. If failures cross 20% or backlog size exceeds 50 events, the system enters **DEGRADED MODE**, completely bypassing heavy CIRO score calculations and generating high-velocity default intelligence objects to protect system availability.
* **Regional Resilience Declarations**: Configured for dual-region redundancy deployment support (`us-central1` + `europe-west1` fallback).

### 11. Explicit Unlimited Cache Offline Persistence & Location Telemetry
To provide absolute continuous operations during complete network blackouts:
* **Unlimited SQLite Cache**: Enforced explicit Firestore persistence inside `lib/main.dart` during initialization via the `Settings` class.
* **SRE-Grade Fallback Cascade**: Engineered `LocationService.resolveIngestionLocation(uid)` prioritizing real GPS -> lastKnown -> home -> null to ensure the system never crashes due to missing coordinates.

### 12. CIRO AI Agent-Based Intelligence Layer (AI FUSION UPGRADE)
To elevate CrisisNexus into a national-scale intelligent decision system, the legacy rule-based CIRO engine has been replaced with an AI Fusion Agent:
* **Intelligence Brain Layer**: Integrated a dedicated `ciro_intelligence` Firestore collection to store all AI reasoning, confidence scores, multi-source inputs (weather, traffic, citizen reports), and geo-clusters.
* **AI Agent Fusion Engine**: Refactored the core `crisisProcessor` to utilize LLM logic (Gemini API) capable of fusing multiple complex data streams to detect crises with human-like analytical reasoning.
* **Structured Intelligence Extraction**: Ensured the AI agent generates strictly validated JSON outputs covering crisis severity, type, confidence, human-readable reasoning, and recommended actionable steps.
* **Legacy Schema Compatibility**: Implemented non-breaking enhancements to the `crises` collection by adding `ciroIntelligenceId`, `confidenceScore`, `aiSummary`, and `dataSources` while keeping existing ReliefCycle and deduplication mechanisms 100% stable.
