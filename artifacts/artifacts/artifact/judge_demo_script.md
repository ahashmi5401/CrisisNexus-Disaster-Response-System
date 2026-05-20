# CrisisNexus Citizen App: Judge Demo Script

## 🎯 System Vision
"CrisisNexus is a real-time crisis coordination system that bridges the gap between citizens in distress and NGO responders using AI-driven risk intelligence."

---

## 🏎️ Demo Flow

### 1. 🔐 Secure Entry (Login/Signup)
*   **Action**: Open the app to the Login screen.
*   **Narration**: "We start with a secure entry point. CrisisNexus uses Firebase Authentication to ensure every report is tied to a verified user, preventing spam and ensuring accountability during emergencies."
*   **Action**: Navigate to Signup and create a new account.
*   **Key Point**: "Notice that upon signup, the system automatically initializes a structured Firestore user profile with risk tracking metrics ready to go."

### 2. 📱 The Command Center (Home Dashboard)
*   **Action**: Show the Home Screen cards.
*   **Narration**: "The Citizen Dashboard is designed for high-stress environments—simple, premium, and focused. Citizens can report emergencies, request specific aid, or monitor nearby crises in real-time."

### 3. 🚨 Real-Time Reporting (Report Emergency)
*   **Action**: Open 'Report Emergency', select 'Flood', set severity to 'Critical', and hit 'Fetch Location'.
*   **Narration**: "When a citizen reports a crisis, we capture the type, severity, and precise GPS coordinates. This isn't just a form; it's a **Signal Ingestion** point for our backend."
*   **Action**: Submit the report.
*   **Key Point**: "As soon as this is submitted, the **CIRO Risk Engine** triggers. It calculates the impact and updates the user's risk profile instantly."

### 4. 🍞 Smart Aid System (Request Aid)
*   **Action**: Open 'Request Aid', select 'Food', and submit.
*   **Narration**: "In a crisis, resource allocation is everything. Citizens can request specific aid like food or shelter."
*   **Action**: Try to submit a 'Food' request again immediately.
*   **Key Point**: "CrisisNexus features a **Bulletproof Deduplication System**. It prevents double-counting and resource inflation by blocking duplicate active requests using a unique `userId_type` key."

### 5. 🧠 CIRO Intelligence (Profile Screen)
*   **Action**: Navigate to the Profile Screen.
*   **Narration**: "Finally, we see the output of our CIRO engine. The **Risk Score** isn't just a number—it's a real-time computation of user vulnerability based on report frequency, severity multipliers, and activity recency."
*   **Key Point**: "This data allows NGO responders to prioritize aid for those with the highest Risk Scores in the system."

### 6. 🏢 NGO Integration (Closing)
*   **Narration**: "While we are looking at the Citizen App, our NGO Dashboard is simultaneously reading this live Firestore data to make life-saving allocation decisions. Together, they form a closed-loop crisis management ecosystem."

---

## 🏆 Presentation Highlights
- **Real-time Sync**: Everything you saw happened instantly across Firestore.
- **AI-Ready**: The signals are pre-processed with priority scores for the Gemini AI batching engine.
- **Production Safe**: The system is protected by strict Firestore Security Rules, ensuring data privacy and integrity.
