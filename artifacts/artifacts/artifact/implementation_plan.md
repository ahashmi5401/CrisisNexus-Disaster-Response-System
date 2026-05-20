# CrisisNexus: Implementation Plan

## 📌 Project Overview
**CrisisNexus** is an intelligent crisis management ecosystem designed to bridge the gap between citizens in distress and NGO responders. The **Citizen App** serves as the primary data ingestion point and aid-request interface.

## 🛠️ Technology Stack
- **Framework**: Flutter (Dart)
- **Backend**: Firebase (Authentication, Firestore)
- **Architecture**: Multi-Role Service Oriented Architecture (aligned with `Multi-CrisisNexus.svg`)

## 🏗️ Core Architecture
The system is divided into three distinct layers as defined in the high-level architecture:
1. **Input Layer**: Citizen mobile app for real-time signal and aid request generation.
2. **Processing Layer (Firebase)**: 
   - **Signal Ingestion**: Normalizing data for CIRO analysis.
   - **CIRO Engine**: Computing real-time risk scores.
   - **ReliefCycle**: Deduplicating and managing aid requests.
3. **Output Layer**: Real-time status updates and NGO-facing data streams.

## 🚀 Functional Modules

### 1. Secure Authentication & Profiling
- **Firebase Auth**: Secure email/password login.
- **Firestore Profile**: Automatic creation of `users/{uid}` documents with statistics tracking (`totalReports`, `totalAidRequests`, `riskScore`).

### 2. Signal Reporting (Emergency Signals)
- Real-time crisis reporting (Flood, Fire, etc.).
- Severity-based **Priority Scoring** (1-4).
- Geospatial metadata attachment.

### 3. Smart Aid System (ReliefCycle)
- Resource request management (Food, Water, Shelter).
- **Deduplication Logic**: Enforcing `userId_type` unique keys to prevent resource inflation and double-counting.

### 4. CIRO Risk Engine
- Proprietary scoring algorithm:
  - Signal Impact: Base 10pts * Severity Multiplier (up to 3x).
  - Aid Impact: +5pts per request.
  - Recency Boost: +20% boost for activity within a 24-hour window.

### 5. Production Security (Firestore Rules)
- Strict **UID-level isolation**.
- Role-based access control (NGO escalation path).
- Write-once status protection.
