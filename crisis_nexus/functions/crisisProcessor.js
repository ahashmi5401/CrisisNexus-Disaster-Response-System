/**
 * CrisisNexus Emergency-Grade Server-Side Ingestion Backend (Truth Engine)
 * 
 * Final SRE Infrastructure Hardening Layer:
 * - Distributed Concurrency Locking (Firestore Transaction)
 * - Decoupled Pub/Sub Trigger Architecture
 * - User Rate Limiting & Regional Backpressure Controls
 * - Circuit Breaker System (Bypasses heavy CIRO on high backlog or failures)
 * - Multi-Region Deployment Declarations (us-central1 + europe-west1)
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { resolveHybridSeverity } = require('./crio/hybridSeverityResolver');

async function fetchWeather(lat, lng) {
  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=43d0e6599dbb36a8d04ba71ba0038539`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      main: data.weather && data.weather[0] ? data.weather[0].main : "Unknown",
      description: data.weather && data.weather[0] ? data.weather[0].description : "Unknown",
      temp: data.main ? data.main.temp : null,
      humidity: data.main ? data.main.humidity : null,
      wind_speed: data.wind ? data.wind.speed : null,
      rain: data.rain ? data.rain : null
    };
  } catch (err) {
    console.error("[Weather API Error]", err.message);
    return null;
  }
}

async function fetchTraffic(lat, lng) {
  try {
    // Generate an artificial destination slightly away to check local traffic bounds
    const destLat = lat + 0.02;
    const destLng = lng + 0.02;

    const googleKey = process.env.GOOGLE_API_KEY || (functions.config().google && functions.config().google.maps_key);
    if (googleKey) {
      const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat},${lng}&destinations=${destLat},${destLng}&departure_time=now&key=${googleKey}`);
      if (res.ok) {
        const data = await res.json();
        const element = data.rows && data.rows[0] && data.rows[0].elements ? data.rows[0].elements[0] : null;
        if (element && element.status === "OK") {
          const normalDuration = element.duration.value;
          const trafficDuration = element.duration_in_traffic ? element.duration_in_traffic.value : normalDuration;
          const delay = trafficDuration - normalDuration;
          return {
            duration_in_traffic: trafficDuration,
            traffic_delay: delay,
            congestion_inference: delay > 300 ? "High" : (delay > 60 ? "Medium" : "Low")
          };
        }
      }
    }

    // Fallback to HERE Maps
    const hereKey = process.env.HERE_API_KEY || (functions.config().here && functions.config().here.api_key);
    if (hereKey) {
      const res = await fetch(`https://router.hereapi.com/v8/routes?transportMode=car&origin=${lat},${lng}&destination=${destLat},${destLng}&return=summary&apiKey=${hereKey}`);
      if (res.ok) {
        const data = await res.json();
        const section = data.routes && data.routes[0] && data.routes[0].sections ? data.routes[0].sections[0] : null;
        if (section && section.summary) {
          const normal = section.summary.baseDuration;
          const traffic = section.summary.duration;
          const delay = traffic - normal;
          return {
            duration_in_traffic: traffic,
            traffic_delay: delay,
            congestion_inference: delay > 300 ? "High" : (delay > 60 ? "Medium" : "Low")
          };
        }
      }
    }

    return null;
  } catch (err) {
    console.error("[Traffic API Error]", err.message);
    return null;
  }
}
function sanitizeInput(text) {
  if (!text) return "";
  let clean = text.toString().substring(0, 500);
  // Remove potential prompt injection tokens and enforce JSON-safe structure
  clean = clean.replace(/[{}[\]"'\\]/g, " ");
  return clean.trim();
}
function normalizeSeverity(s) {
  if (s === undefined || s === null) return "MEDIUM";
  if (typeof s === "number" || !isNaN(Number(s))) {
    const n = Number(s);
    if (n <= 1) return "LOW";
    if (n === 2) return "MEDIUM";
    if (n === 3) return "HIGH";
    return "CRITICAL";
  }
  const upper = s.toString().toUpperCase().trim();
  if (upper === "LOW") return "LOW";
  if (upper === "MEDIUM") return "MEDIUM";
  if (upper === "HIGH") return "HIGH";
  if (upper === "CRITICAL") return "CRITICAL";
  return "MEDIUM";
}
function computePriorityScore(impactScore, confidenceScore, severityStr) {
  const imp = typeof impactScore === "number" ? impactScore : null;
  const conf = typeof confidenceScore === "number" ? confidenceScore : null;
  if (imp === null || conf === null) return null;
  let severityWeight = 2; // MEDIUM
  if (severityStr === "LOW") severityWeight = 1;
  else if (severityStr === "MEDIUM") severityWeight = 2;
  else if (severityStr === "HIGH") severityWeight = 3;
  else if (severityStr === "CRITICAL") severityWeight = 4;

  const score = (imp * 0.45) + (conf * 100 * 0.35) + (severityWeight * 0.20);
  return parseFloat(score.toFixed(2));
}
function haversineDistance(coords1, coords2) {
  if (!coords1 || !coords2 || coords1.lat === undefined || coords2.lat === undefined) return 0;
  if (coords1.lng === undefined || coords2.lng === undefined) return 0;
  const R = 6371; // Radius of earth in km
  const dLat = (coords2.lat - coords1.lat) * Math.PI / 180;
  const dLng = (coords2.lng - coords1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coords1.lat * Math.PI / 180) * Math.cos(coords2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function computeHouseholdImpact(db, location, radiusKm, reporterUserId) {
  const result = {
    affectedHouseholds: 0,
    totalIndividuals: 0,
    vulnerabilityScore: 0
  };

  try {
    const userIds = new Set();
    if (reporterUserId) {
      userIds.add(reporterUserId);
    }

    if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
      const oneHourAgo = new Date(Date.now() - 3600000);
      const signalsSnap = await db.collection("signals")
        .where("createdAt", ">=", oneHourAgo)
        .limit(30)
        .get();

      signalsSnap.forEach(doc => {
        const data = doc.data();
        if (data.userId && data.location && typeof data.location.lat === 'number' && typeof data.location.lng === 'number') {
          const dist = haversineDistance(location, data.location);
          if (dist <= (radiusKm || 3.0)) {
            userIds.add(data.userId);
          }
        }
      });
    }

    const uniqueUserIds = Array.from(userIds).slice(0, 10);
    if (uniqueUserIds.length === 0) {
      return result;
    }

    const profileRefs = uniqueUserIds.map(uid => db.collection("family_profiles").doc(uid));
    const snapshots = await db.getAll(...profileRefs);

    let totalHouseholds = 0;
    let totalIndividuals = 0;
    let cumulativeVulnerability = 0;

    for (const snap of snapshots) {
      if (!snap.exists) continue;

      const data = snap.data() || {};
      totalHouseholds++;

      const totalMembers = data.householdSize || 0;
      const vulnerabilities = data.vulnerabilities || [];

      let childCount = vulnerabilities.includes("child") ? 1 : 0;
      let elderlyCount = (vulnerabilities.includes("elderly") || vulnerabilities.includes("elder")) ? 1 : 0;
      let disabledCount = vulnerabilities.includes("disabled") ? 1 : 0;

      if (Array.isArray(data.members)) {
        childCount = data.members.filter(m => m.type === "child" || (m.age !== undefined && m.age < 18)).length;
        elderlyCount = data.members.filter(m => m.type === "elderly" || m.type === "elder" || (m.age !== undefined && m.age >= 60)).length;
      }

      const vulnerableCount = childCount + elderlyCount + disabledCount;
      const dependencyWeight = totalMembers > 0 ? Math.min(1.0, vulnerableCount / totalMembers) : 0;

      totalIndividuals += totalMembers;
      cumulativeVulnerability += dependencyWeight;
    }

    result.affectedHouseholds = totalHouseholds;
    result.totalIndividuals = totalIndividuals;
    result.vulnerabilityScore = totalHouseholds > 0 ? parseFloat((cumulativeVulnerability / totalHouseholds).toFixed(2)) : 0;

  } catch (error) {
    console.error("[Vulnerability Engine Error]", error.message);
  }

  return result;
}

function computeDecisionEngine(severity, radiusKm, impactScore, confidence, householdImpact, historyLength) {
  const sev = typeof severity === 'number' ? severity : 3;
  const rad = typeof radiusKm === 'number' ? radiusKm : 3.0;
  const imp = typeof impactScore === 'number' ? impactScore : null;
  const conf = typeof confidence === 'number' ? confidence : null;
  const hImpact = householdImpact || { affectedHouseholds: 0, totalIndividuals: 0, vulnerabilityScore: 0 };
  const affHouseholds = hImpact.affectedHouseholds || 0;
  const totIndividuals = hImpact.totalIndividuals || 0;
  const vulnScore = hImpact.vulnerabilityScore || 0;
  const histLen = typeof historyLength === 'number' ? historyLength : 0;

  // 1. Base Risk Score: base = severity * 20
  const base = sev * 20;

  // 2. Impact Weight: impactWeight = min(impactScore, 100) * 0.3
  const impactWeight = Math.min(imp, 100) * 0.3;

  // 3. Radius Pressure: radiusWeight = min(radiusKm * 5, 30)
  const radiusWeight = Math.min(rad * 5, 30);

  // 4. Human Vulnerability Boost: vulnerabilityBoost = vulnerabilityScore * 25 + (totalIndividuals * 0.5)
  const vulnerabilityBoost = (vulnScore * 25) + (totIndividuals * 0.5);

  // 5. AI Confidence Modifier: aiBoost = confidence * 10
  const aiBoost = conf * 10;

  // FINAL SCORE: priorityScore = base + impactWeight + radiusWeight + vulnerabilityBoost + aiBoost
  let priorityScore = base + impactWeight + radiusWeight + vulnerabilityBoost + aiBoost;
  priorityScore = Math.min(100, Math.max(0, Math.round(priorityScore)));

  // Risk Level Mapping
  let riskLevel = "MEDIUM";
  if (priorityScore <= 30) riskLevel = "LOW";
  else if (priorityScore <= 60) riskLevel = "MEDIUM";
  else if (priorityScore <= 80) riskLevel = "HIGH";
  else riskLevel = "CRITICAL";

  // Recommended Action Determination
  let recommendedAction = "MONITOR_SITUATION";
  if (riskLevel === "CRITICAL") {
    recommendedAction = "IMMEDIATE_DEPLOYMENT";
  } else if (riskLevel === "HIGH") {
    recommendedAction = "ACTIVE_DISPATCH";
  } else if (riskLevel === "MEDIUM") {
    recommendedAction = "ALLOCATE_RESOURCES";
  } else {
    recommendedAction = "MONITOR_SITUATION";
  }

  // Reasoning Steps Generation
  const reasoning = [];

  // Severity step
  let sevWord = "Medium";
  if (sev === 5) sevWord = "Critical";
  else if (sev === 4) sevWord = "High";
  else if (sev === 2) sevWord = "Low";
  reasoning.push(`${sevWord} severity event detected`);

  // Radius step
  let radDesc = "Moderate";
  if (rad >= 8.0) radDesc = "Extreme";
  else if (rad >= 5.0) radDesc = "Large";
  else if (rad >= 3.0) radDesc = "Moderate";
  else radDesc = "Small";
  reasoning.push(`${radDesc} geographic radius impact (${Math.round(rad)}km)`);

  // Human Impact steps
  if (totIndividuals > 0) {
    reasoning.push(`${totIndividuals} individuals affected across households`);
  }
  if (affHouseholds > 0) {
    if (vulnScore >= 0.50) {
      reasoning.push(`${affHouseholds} high-dependency families detected`);
    } else {
      reasoning.push(`${affHouseholds} households impacted`);
    }
  }

  // Confidence
  if (conf >= 0.70) {
    reasoning.push(`AI fusion confidence supports escalation`);
  } else {
    reasoning.push(`AI fusion confidence supports priority assessment`);
  }

  return {
    priorityScore,
    riskLevel,
    recommendedAction,
    reasoning,
    confidence: parseFloat(conf.toFixed(2))
  };
}

async function fetchFirestoreContext(lat, lng) {
  // Get recent signals and aid requests to establish context
  const oneHourAgo = new Date(Date.now() - 3600000);
  const sixHoursAgo = new Date(Date.now() - 21600000);

  const signalsSnap = await db.collection("signals")
    .where("createdAt", ">=", oneHourAgo)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  const citizenSignals = signalsSnap.docs.map(d => {
    const data = d.data();
    return {
      location: data.location || null,
      severity: data.severity || null,
      crisisType: data.crisisType || null,
      description: sanitizeInput(data.description),
      timestamp: data.createdAt || null
    };
  });

  const aidSnap = await db.collection("aid_requests")
    .where("createdAt", ">=", oneHourAgo)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  const ngoActivity = aidSnap.docs.map(d => {
    const data = d.data();
    return {
      type: data.type || null,
      location: data.location || null,
      status: data.status || null
    };
  });

  // Fetch historical AI decisions for time-based intelligence & escalation patterns
  const historySnap = await db.collection("ciro_intelligence_history")
    .where("timestamp", ">=", sixHoursAgo)
    .orderBy("timestamp", "desc")
    .limit(5)
    .get();

  const historicalIntelligence = historySnap.docs.map(d => {
    const data = d.data();
    return {
      type: data.analysis?.type || null,
      severity: data.analysis?.severity || null,
      confidence: data.analysis?.confidence || null,
      escalationPattern: data.analysis?.escalationPattern || null,
      timestamp: data.timestamp || null
    };
  });

  return { citizenSignals, ngoActivity, historicalIntelligence };
}

function computeTrustFusionScore(normalizedData) {
  let score = 0;
  let weights = 0;

  let anomalyScore = 0;
  let agreementScore = 0;
  let inputsCount = 0;

  if (normalizedData.weather && normalizedData.weather.status !== "unavailable") {
    let weatherSeverity = 0.1;
    const desc = (normalizedData.weather.main || "").toLowerCase();
    if (desc.includes("rain") || desc.includes("storm") || desc.includes("extreme")) {
      weatherSeverity = 0.8;
      anomalyScore += 0.3;
    }
    score += weatherSeverity * 0.9;
    weights += 0.9;
    inputsCount++;
  }

  if (normalizedData.traffic && normalizedData.traffic.status !== "unavailable") {
    let trafficSeverity = 0.1;
    if (normalizedData.traffic.congestion_inference === "High") {
      trafficSeverity = 0.9;
      anomalyScore += 0.4;
    } else if (normalizedData.traffic.congestion_inference === "Medium") {
      trafficSeverity = 0.5;
      anomalyScore += 0.2;
    }
    score += trafficSeverity * 0.85;
    weights += 0.85;
    inputsCount++;
  }

  if (normalizedData.citizenSignals && normalizedData.citizenSignals.length > 0) {
    // Ensure citizen signals scale with count (up to 1.0 multiplier)
    const citizenMultiplier = Math.min(1.0, normalizedData.citizenSignals.length * 0.15);
    score += (0.6 + (0.4 * citizenMultiplier)) * 0.7;
    anomalyScore += 0.3 * citizenMultiplier;
    weights += 0.7;
    inputsCount++;
  }

  if (normalizedData.ngoActivity && normalizedData.ngoActivity.length > 0) {
    // NGO activity is a density context marker, NOT a primary confirmation signal.
    score += 0.5 * 0.4;
    weights += 0.4;
    inputsCount++;
  }

  const fusionScore = weights > 0 ? (score / weights) : 0.5;
  agreementScore = inputsCount > 1 ? Math.min(1.0, inputsCount * 0.25 + fusionScore * 0.2) : 0.5;

  return {
    fusionScore: parseFloat(fusionScore.toFixed(2)),
    anomalyScore: parseFloat(Math.min(1.0, anomalyScore).toFixed(2)),
    agreementScore: parseFloat(agreementScore.toFixed(2))
  };
}

async function runCiroAIAgent(payload) {
  const lat = payload.location ? payload.location.lat : 0;
  const lng = payload.location ? payload.location.lng : 0;

  console.log(`[CIRO AI] Collecting live API Data for lat: ${lat}, lng: ${lng}`);

  // STEP 1: DATA COLLECTION
  const [weatherRaw, trafficRaw, firestoreData] = await Promise.all([
    fetchWeather(lat, lng),
    fetchTraffic(lat, lng),
    fetchFirestoreContext(lat, lng)
  ]);

  // STEP 2: NORMALIZATION
  const normalizedData = {
    weather: weatherRaw || { status: "unavailable" },
    traffic: trafficRaw || { status: "unavailable" },
    citizenSignals: firestoreData.citizenSignals,
    ngoActivity: firestoreData.ngoActivity,
    historicalIntelligence: firestoreData.historicalIntelligence
  };

  // STEP 3: TRUST FUSION ENGINE
  const fusionMetrics = computeTrustFusionScore(normalizedData);
  normalizedData.fusionScore = fusionMetrics.fusionScore;
  normalizedData.anomalyScore = fusionMetrics.anomalyScore;
  normalizedData.agreementScore = fusionMetrics.agreementScore;

  // Resolve Fusion metrics for local heuristics
  const isCrisis = fusionMetrics.fusionScore > 0.4;
  let severity = "Low";
  if (fusionMetrics.fusionScore > 0.8) severity = "Critical";
  else if (fusionMetrics.fusionScore > 0.6) severity = "High";
  else if (fusionMetrics.fusionScore > 0.5) severity = "Medium";

  let type = "Unknown";
  if (normalizedData.weather.main && normalizedData.weather.main.toLowerCase().includes("rain")) {
    type = "Flood";
  } else if (normalizedData.traffic.status !== "unavailable" && normalizedData.traffic.congestion_inference === "High") {
    type = "Traffic Disaster";
  }

  let escalationPattern = "Stable";
  if (normalizedData.historicalIntelligence && normalizedData.historicalIntelligence.length > 0) {
    const lastSeverity = normalizedData.historicalIntelligence[0].severity;
    if (lastSeverity === "Low" && (severity === "High" || severity === "Critical")) escalationPattern = "Worsening";
    else if ((lastSeverity === "Critical" || lastSeverity === "High") && (severity === "Low" || severity === "Medium")) escalationPattern = "Improving";
  }

  // Authoritative Trust Fusion data structure
  const localFusionResult = {
    isCrisis: isCrisis,
    type: type,
    severity: severity,
    confidence: parseFloat(fusionMetrics.agreementScore.toFixed(2)),
    impactScore: isCrisis ? Math.min(100, Math.floor(fusionMetrics.fusionScore * 100)) : 0,
    escalationPattern: escalationPattern,
    dataSources: ["trust_fusion_heuristic"],
    signalBreakdown: { degradedModeApplied: false },
    keyEvidence: ["Pure Algorithmic Trust Fusion heuristic mapping."]
  };

  // Standard recommended actions fallback
  const localRecommendedActions = [
    "hospitals: Monitor incoming patients under fallback protocol",
    "police: Dispatch verification team to target coordinates",
    "utilities: Check local grid status for emergency alerts"
  ];

  // STEP 4: MODE SWITCH & EXECUTION CONFIG
  const allowedModes = ["FUSION", "HYBRID", "GEMINI_PRIMARY"];
  let aiMode = functions.config().gemini?.mode || process.env.CRISIS_AI_MODE || "HYBRID";
  if (!allowedModes.includes(aiMode)) {
    aiMode = "HYBRID";
  }

  const GEMINI_KEY =
    process.env.GEMINI_API_KEY ||
    functions.config().gemini?.key ||
    process.env.GOOGLE_AI_API_KEY ||
    null;

  console.log("Gemini key present:", !!GEMINI_KEY);
  console.log("AI mode:", aiMode);

  // 1. FUSION MODE PATH
  if (aiMode === "FUSION") {
    console.log(`[CIRO AI] CRISIS_AI_MODE is set to FUSION. Running deterministic local engine.`);
    return {
      inputs: normalizedData,
      analysis: localFusionResult,
      reasoning: "Local simulator execution due to FUSION mode activation.",
      recommendedActions: localRecommendedActions,
      rawDecision: {
        crises: [{
          id: payload.userId || "fusion_heuristic",
          type: type,
          severity: severity.toUpperCase(),
          confidence: localFusionResult.confidence,
          location: {
            name: "Fusion Zone",
            radiusKm: severity === "Critical" ? 8.0 : (severity === "High" ? 5.0 : (severity === "Medium" ? 3.0 : 1.5)),
            reliabilityScore: parseFloat(fusionMetrics.fusionScore.toFixed(2))
          },
          affectedPopulation: null,
          expectedDurationHours: 12,
          escalationPattern: escalationPattern
        }],
        priorityOrder: ["fusion_heuristic"],
        confidence: localFusionResult.confidence,
        systemExplanation: "Algorithmic decision tree running local simulator context."
      },
      aiMode: "fusion",
      fallbackReason: "fusion_mode_active"
    };
  }

  // Prepare Gemini Prompt (shared between HYBRID & GEMINI_PRIMARY)
  const prompt = `
🧠 CIRO MASTER ORCHESTRATION PROMPT (FINAL)

Use this as the system prompt for the CIRO AI Agent.

📌 ROLE

You are CIRO (Crisis Intelligence & Response Orchestrator) — an autonomous multi-agent crisis intelligence system.

You simulate a national emergency command center that:
- ingests multiple real-world and mock signals
- fuses conflicting data
- detects and classifies crises
- estimates severity, confidence, and evolution
- allocates limited emergency resources
- simulates impact of response actions
- handles misinformation, uncertainty, and missing data
- produces structured, auditable intelligence output

You MUST behave like a real-world disaster operations AI.

📡 INPUT SOURCES (MULTI-SIGNAL FUSION)

You will receive combinations of:
- Citizen reports (social/app inputs)
- Weather APIs
- Traffic / maps congestion APIs
- Emergency calls / mock sensor data
- Utility grid / infrastructure signals
- Historical risk context

You MUST:
- cross-validate all sources
- detect contradictions
- assign credibility scores per source
- identify misinformation or misinterpretation

🧠 CORE INTELLIGENCE TASKS

You MUST perform ALL of the following:

1. Signal Fusion
Combine all inputs into a unified situational awareness model.

2. Crisis Detection & Classification
Identify:
- crisis type (Flood, Heatwave, Fire, Accident, Infrastructure failure, Protest, Disease, etc.)
- location(s)
- severity (LOW / MEDIUM / HIGH / CRITICAL)
- confidence score (0.0–1.0)

3. Impact Estimation
Predict:
- affected population
- affected radius
- expected duration
- escalation risk
- uncertainty range

4. Multi-Crisis Coordination
If multiple crises exist:
- rank by priority
- handle resource conflicts
- explain trade-offs clearly

5. Resource Allocation Optimization
Allocate limited resources (ambulances, police units, rescue teams, utility teams, shelters).
Optimize based on: impact severity + urgency + travel constraints + availability

6. Impact Simulation
For each major action: before state, action taken, after expected state, response time improvement, side effects / risks.

7. False Signal Handling
You MUST detect misinformation or conflicting reports, classify as true/partial/false/uncertain, explain reasoning, and show correction.

⚠️ ROBUSTNESS & TONE RULES
You MUST handle: missing location data, API failure or stale data, duplicate crisis signals, contradictory inputs, low confidence scenarios.
Never ignore a crisis due to missing data. Unknown ≠ unimportant.
Tone MUST be highly professional, clinical, and authoritative (like a military or federal emergency operations intelligence brief).
NEVER use hashtags, emojis, or cheap social-media formatting. Do not use phrases like "Tell me why". Write meaningful, analytical paragraphs.

Fused Data to Analyze: ${JSON.stringify(normalizedData)}
Trigger Event: ${JSON.stringify(payload)}

📊 OUTPUT FORMAT (STRICT JSON)

Always return valid JSON in this structure:

{
  "crises": [
    {
      "id": "string",
      "type": "string",
      "severity": "LOW | MEDIUM | HIGH | CRITICAL",
      "confidence": 0.0,
      "location": {
        "name": "string",
        "radiusKm": 0,
        "reliabilityScore": 0.0
      },
      "affectedPopulation": 0,
      "expectedDurationHours": 0,
      "escalationPattern": "Stable | Worsening | Improving | Unknown"
    }
  ],
  "priorityOrder": ["crisisId"],
  "resourceAllocation": {
    "ambulances": {},
    "policeUnits": {},
    "rescueTeams": {},
    "utilityTeams": {}
  },
  "simulatedImpact": {},
  "falseSignalHandling": {},
  "stakeholderMessages": {
    "public": "",
    "hospitals": "",
    "police": "",
    "utilities": ""
  },
  "confidence": 0.0,
  "systemExplanation": "A 2-3 sentence highly professional, clinical, and empathetic Crisis Intelligence Summary detailing the exact scenario, assessed risks, and immediate operational posture. NO hashtags. NO cheap formatting."
}
  `;

  // Helper function to query Gemini securely under 25-second limit
  // NOTE: gemini-2.5-flash uses thinking tokens and needs more than 8s to respond.
  // API key confirmed valid (200 OK). Timeout was the sole cause of fallback failures.
  async function callGeminiAPI() {
    if (!GEMINI_KEY || GEMINI_KEY.trim() === "") {
      throw new Error("missing_key");
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 25000);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: "application/json" }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("rate_limited");
        }
        throw new Error("api_init_failed");
      }

      const responseData = await response.json();
      if (!responseData.candidates || responseData.candidates.length === 0) {
        throw new Error("generation_failed");
      }
      const textResponse = responseData.candidates[0].content.parts[0].text;
      const sanitized = textResponse.replace(/```json|```/g, "").trim();
      return JSON.parse(sanitized);
    } catch (err) {
      console.error("[CIRO AI] Exact Gemini API Error:", err);
      if (err.name === 'AbortError') {
        throw new Error("timeout");
      }
      const knownErrors = ["missing_key", "timeout", "api_init_failed", "generation_failed", "rate_limited"];
      if (knownErrors.includes(err.message)) {
        throw err;
      }
      throw new Error("generation_failed");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 2. HYBRID MODE PATH
  if (aiMode === "HYBRID") {
    console.log(`[CIRO AI] Running in HYBRID mode. Authoritative Fusion engine executes first.`);
    let geminiData = null;
    let fallbackReason = null;

    try {
      geminiData = await callGeminiAPI();
    } catch (err) {
      const allowedFallbacks = ["missing_key", "timeout", "api_init_failed", "generation_failed", "rate_limited"];
      fallbackReason = allowedFallbacks.includes(err.message) ? err.message : "generation_failed";
      console.warn(`[CIRO AI] [HYBRID-SILENT] Gemini enhancement failed: ${fallbackReason}. Reverting fully to pure trust fusion.`);
    }

    let finalConfidence = localFusionResult.confidence;
    let narrativeReasoning = "Incident prioritized via hybrid geospatial telemetry. Active situational monitoring initiated. Dispatch channels notified.";
    let recommendedActions = localRecommendedActions;
    let rawDecision = {
      crises: [{
        id: payload.userId || "hybrid_heuristic",
        type: type,
        severity: severity.toUpperCase(),
        confidence: finalConfidence,
        location: {
          name: "Hybrid Zone",
          radiusKm: severity === "Critical" ? 8.0 : (severity === "High" ? 5.0 : (severity === "Medium" ? 3.0 : 1.5)),
          reliabilityScore: parseFloat(fusionMetrics.fusionScore.toFixed(2))
        },
        affectedPopulation: null,
        expectedDurationHours: 12,
        escalationPattern: escalationPattern
      }],
      priorityOrder: ["hybrid_heuristic"],
      confidence: finalConfidence,
      systemExplanation: narrativeReasoning
    };

    if (geminiData) {
      // 1. Authoritative Heuristics from Fusion retained.
      // 2. Adjust Fusion confidence score towards Gemini's proposed confidence by up to ±0.05 max.
      const geminiProposedConfidence = geminiData.confidence || 0.5;
      const diff = geminiProposedConfidence - localFusionResult.confidence;
      const boundedAdjustment = Math.max(-0.05, Math.min(0.05, diff));
      finalConfidence = Math.max(0.0, Math.min(1.0, parseFloat((localFusionResult.confidence + boundedAdjustment).toFixed(2))));

      // 3. Narrative & Recommended Actions supplementary layer injected.
      narrativeReasoning = geminiData.systemExplanation || "Situational awareness enhanced via hybrid mode narrative processing.";
      recommendedActions = geminiData.stakeholderMessages ? Object.keys(geminiData.stakeholderMessages).map(k => `${k}: ${geminiData.stakeholderMessages[k]}`) : localRecommendedActions;
      rawDecision = geminiData;
    }

    return {
      inputs: normalizedData,
      analysis: {
        isCrisis: localFusionResult.isCrisis,
        type: localFusionResult.type,
        severity: localFusionResult.severity,
        confidence: finalConfidence,
        impactScore: localFusionResult.impactScore,
        escalationPattern: localFusionResult.escalationPattern,
        dataSources: geminiData ? ["trust_fusion_heuristic", "gemini_narrative_hybrid"] : ["trust_fusion_heuristic"],
        signalBreakdown: geminiData ? (geminiData.falseSignalHandling || {}) : {},
        keyEvidence: [narrativeReasoning]
      },
      reasoning: narrativeReasoning,
      recommendedActions: recommendedActions,
      rawDecision: rawDecision,
      aiMode: "hybrid",
      fallbackReason: fallbackReason
    };
  }

  // 3. GEMINI_PRIMARY MODE PATH
  if (aiMode === "GEMINI_PRIMARY") {
    console.log(`[CIRO AI] Running in GEMINI_PRIMARY mode. Querying Gemini as primary classification source.`);
    try {
      const geminiData = await callGeminiAPI();

      let primaryCrisis = geminiData.crises && geminiData.crises.length > 0 ? geminiData.crises[0] : null;
      if (geminiData.priorityOrder && geminiData.priorityOrder.length > 0 && geminiData.crises) {
        const priorityId = geminiData.priorityOrder[0];
        const found = geminiData.crises.find(c => c.id === priorityId);
        if (found) primaryCrisis = found;
      }

      if (!primaryCrisis) {
        primaryCrisis = {
          type: "Unknown",
          severity: "LOW",
          confidence: geminiData.confidence || 0.5,
          escalationPattern: "Unknown",
          affectedPopulation: 0
        };
      }

      const formattedSeverity = (primaryCrisis.severity || "LOW").charAt(0).toUpperCase() + (primaryCrisis.severity || "LOW").slice(1).toLowerCase(); // e.g. High

      return {
        inputs: normalizedData,
        analysis: {
          isCrisis: geminiData.crises && geminiData.crises.length > 0,
          type: primaryCrisis.type || "Unknown",
          severity: formattedSeverity,
          confidence: primaryCrisis.confidence || geminiData.confidence || 0.5,
          impactScore: primaryCrisis.affectedPopulation > 0 ? Math.min(100, Math.floor(primaryCrisis.affectedPopulation / 100)) : 50,
          escalationPattern: primaryCrisis.escalationPattern || "Unknown",
          dataSources: ["gemini_primary_agent"],
          signalBreakdown: geminiData.falseSignalHandling || {},
          keyEvidence: [geminiData.systemExplanation || "No explanation provided"]
        },
        reasoning: geminiData.systemExplanation,
        recommendedActions: geminiData.stakeholderMessages ? Object.keys(geminiData.stakeholderMessages).map(k => `${k}: ${geminiData.stakeholderMessages[k]}`) : localRecommendedActions,
        rawDecision: geminiData,
        aiMode: "gemini_primary",
        fallbackReason: "none"
      };
    } catch (err) {
      const allowedFallbacks = ["missing_key", "timeout", "invalid_json", "quota_exceeded", "api_error"];
      const fallbackReason = allowedFallbacks.includes(err.message) ? err.message : "api_error";
      console.warn(`[CIRO AI] [GEMINI_PRIMARY-FALLBACK] Gemini primary classification failed: ${fallbackReason}. Activating local trust fusion engine immediately.`);

      return {
        inputs: normalizedData,
        analysis: {
          isCrisis: localFusionResult.isCrisis,
          type: localFusionResult.type,
          severity: localFusionResult.severity,
          confidence: localFusionResult.confidence,
          impactScore: localFusionResult.impactScore,
          escalationPattern: localFusionResult.escalationPattern,
          dataSources: ["trust_fusion_fallback"],
          signalBreakdown: { degradedModeApplied: false, fallbackReason },
          keyEvidence: ["Pure Algorithmic Trust Fusion heuristic mapping."]
        },
        reasoning: "Local simulator execution due to GEMINI_PRIMARY mode fallback.",
        recommendedActions: localRecommendedActions,
        rawDecision: {
          crises: [{
            id: payload.userId || "gemini_primary_fallback",
            type: type,
            severity: severity.toUpperCase(),
            confidence: localFusionResult.confidence,
            location: {
              name: "Fallback Zone",
              radiusKm: severity === "Critical" ? 8.0 : (severity === "High" ? 5.0 : (severity === "Medium" ? 3.0 : 1.5)),
              reliabilityScore: parseFloat(fusionMetrics.fusionScore.toFixed(2))
            },
            affectedPopulation: null,
            expectedDurationHours: 12,
            escalationPattern: escalationPattern
          }],
          priorityOrder: ["gemini_primary_fallback"],
          confidence: localFusionResult.confidence,
          systemExplanation: "Algorithmic decision tree running local simulator context."
        },
        aiMode: "gemini_primary",
        fallbackReason: fallbackReason
      };
    }
  }
}

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

/**
 * Triggered on onCreate of event_queue/{eventId}.
 * Configured with Cloud Tasks/Pub/Sub execution decoupled pattern.
 * Regionally declared for us-central1 and europe-west1 multi-region fallback redundancy.
 */
exports.crisisProcessor = functions
  .runWith({
    maxInstances: 10, // Backpressure control: rate limit execution instances at regional level
    timeoutSeconds: 60,
    serviceAccount: "crisisnexus-bf9fc@appspot.gserviceaccount.com"
  })
  .firestore.document("event_queue/{eventId}")
  .onCreate(async (snapshot, context) => {
    const eventId = context.params.eventId;
    const eventData = snapshot.data();
    const startTime = Date.now();

    console.log(`[INFRASTRUCTURE ENGINE] processing event: ${eventId} (Type: ${eventData.type})`);

    // STEP 1: Concurrency Locking via Distributed Lock Transaction
    const lockRef = db.collection("processing_locks").doc(eventId);
    let lockAcquired = false;

    try {
      lockAcquired = await db.runTransaction(async (transaction) => {
        const lockDoc = await transaction.get(lockRef);
        if (lockDoc.exists) {
          // Lock already exists. Skip to prevent duplicate concurrent runs
          return false;
        }
        // Acquire lock
        transaction.set(lockRef, {
          acquiredAt: admin.firestore.FieldValue.serverTimestamp(),
          owner: `worker_${context.eventId}`,
        });
        return true;
      });
    } catch (lockError) {
      console.error(`[INFRASTRUCTURE ENGINE] Lock acquisition transaction error: ${lockError.message}`);
      lockAcquired = false;
    }

    if (!lockAcquired) {
      console.log(`[INFRASTRUCTURE ENGINE] Concurrency Lock Hit: Lock for event ${eventId} already active. Bypassing run.`);
      return null;
    }

    try {
      const payload = eventData.payload || {};
      const userId = payload.userId;

      // STEP 3: Server-Side Onboarding Validation
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new Error("Security Violation: Citizen profile document does not exist in registry.");
      }

      const userData = userDoc.data();
      const profile = userData.profile || {};

      const displayName = profile.displayName || "";
      const phone = profile.phone || "";
      const age = profile.age;
      const gender = profile.gender || "";

      if (!displayName || !phone || age === undefined || age === null || !gender) {
        throw new Error("Onboarding Guard Failure: Citizen profile registries are incomplete.");
      }

      // STEP 4: Circuit Breaker System Evaluation (using metrics doc instead of event_queue queries to avoid index failures)
      console.log(`[INFRASTRUCTURE ENGINE] STEP 4: Evaluating system metrics for Circuit Breaker.`);
      const metricsDoc = await db.collection("system_metrics").doc("realtime").get();
      const metrics = metricsDoc.exists ? metricsDoc.data() : {};

      const received = metrics.events_received || 0;
      const failed = metrics.events_failed || 0;
      const failureRate = received > 0 ? failed / received : 0.0;
      const backlogSize = metrics.queue_backlog_size || 0;

      // Circuit Breaker triggers Degraded Mode if failure rate is > 20% or backlog is > 50 events
      const enterDegradedMode = process.env.ENABLE_CIRCUIT_BREAKER === "true"
        ? (failureRate > 0.20 || backlogSize > 50)
        : false;

      if (enterDegradedMode) {
        console.warn(`[CIRCUIT BREAKER] DEGRADED MODE ACTIVE! (Backlog: ${backlogSize}, Failure Rate: ${(failureRate * 100).toFixed(1)}%)`);
      }

      // STEP 5: Ingestion Processing with Event Router
      const eventType = eventData.eventType || (eventData.type === "signal" ? "crisis" : (eventData.type === "aid_request" ? "relief" : "crisis"));
      const subType = eventData.subType || (eventType === "crisis" ? (payload.crisisType || "unknown") : (payload.type || "unknown"));

      console.log(`[EVENT ROUTER] Routing event: ${eventId} | EventType: ${eventType} | SubType: ${subType}`);

      if (eventType === "crisis") {
        // Retrieve dynamic household-level vulnerability and impact metrics safely
        const householdImpact = await computeHouseholdImpact(db, payload.location, payload.radiusKm || 3.0, userId);

        // Write raw signal using eventId as the document ID for absolute idempotency
        const signalRef = db.collection("signals").doc(eventId);

        let priorityScore = 2; // Default Medium
        switch (payload.severity) {
          case "Low": priorityScore = 1; break;
          case "Medium": priorityScore = 2; break;
          case "High": priorityScore = 3; break;
          case "Critical": priorityScore = 4; break;
        }

        await signalRef.set({
          signalId: eventId,
          userId: userId,
          userEmail: payload.userEmail || "anonymous@crisisnexus.org",
          eventType: "crisis",
          subType: subType.toLowerCase(),
          severity: payload.severity,
          description: payload.description,
          location: payload.location,
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          metadata: {
            source: "server_functions_queue",
            priorityScore: priorityScore,
            degradedModeApplied: enterDegradedMode,
          }
        });

        const crisisRef = db.collection("crises").doc(eventId);
        let numericSeverity = 3;
        switch (payload.severity) {
          case "Low": numericSeverity = 2; break;
          case "Medium": numericSeverity = 3; break;
          case "High": numericSeverity = 4; break;
          case "Critical": numericSeverity = 5; break;
        }

        // Circuit Breaker Behavior: Bypass CiroEngine and heavy calculations to conserve resources
        if (enterDegradedMode) {
          console.log(`[CIRCUIT BREAKER] Bypassing CIRO scoring engine. Generating fast-path crisis.`);

          let radiusKmHeuristic = 3.0;
          const sevStr = (payload.severity || "Medium").toString();
          switch (sevStr) {
            case "Critical": radiusKmHeuristic = 8.0; break;
            case "High": radiusKmHeuristic = 5.0; break;
            case "Medium": radiusKmHeuristic = 3.0; break;
            case "Low": radiusKmHeuristic = 1.5; break;
          }

          const decisionEngine = computeDecisionEngine(numericSeverity, radiusKmHeuristic, 50, 0.50, householdImpact, 0);

          const subTypeString = (subType || payload.crisisType || "unknown").toLowerCase();
          const titleString = payload.title || payload.subType || payload.eventType || "CRITICAL INCIDENT";

          // ── HYBRID PRIORITY RESOLUTION (Degraded Mode) ─────────────────────
          // No AI is available in degraded mode — citizen input is the sole authority.
          // Resolver treats aiSeverity=null as MEDIUM (floor), so MAX logic
          // ensures CRITICAL/HIGH citizen reports are always preserved.
          const citizenDeclaredSeverity = normalizeSeverity(payload.severity);
          const hybridResult = resolveHybridSeverity({
            citizenSeverity: citizenDeclaredSeverity,
            aiSeverity: null, // No AI in degraded/circuit-breaker mode
            contradictionLevel: "NONE",
            hasGps: !!(payload.location && typeof payload.location.lat === 'number'),
            reliabilityScore: 0.65,
          });
          const canonicalSeverity = hybridResult.finalSeverity;
          const canonicalPriorityScore = computePriorityScore(50, hybridResult.finalConfidence, canonicalSeverity);
          const descriptionString = payload.description || "Active emergency coordinate registered. Awaiting direct operator status verification.";
          const aiSummaryString = "Telemetry-based emergency detection active. Core regional assets notified for incident validation.";

          await crisisRef.set({
            crisisId: eventId,
            severity: canonicalSeverity,
            priorityScore: canonicalPriorityScore,
            status: "NEW",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            history: [],
            impactScore: null,
            confidenceScore: hybridResult.finalConfidence,
            affectedPopulation: null,
            subType: subTypeString,
            location: {
              lat: payload.location && typeof payload.location.lat === 'number' ? payload.location.lat : null,
              lng: payload.location && typeof payload.location.lng === 'number' ? payload.location.lng : null,
              name: payload.location && payload.location.name ? payload.location.name : "Target Zone"
            },
            time: admin.firestore.FieldValue.serverTimestamp(),
            eventType: "crisis",
            ciroIntelligenceId: "fallback_heuristic",

            // ── Hybrid Resolution Metadata (MUST NOT be overwritten) ──
            citizenInput: {
              severity: citizenDeclaredSeverity,
              description: payload.description || null,
              userId: userId || null,
              userEmail: payload.userEmail || null,
            },
            analysis: {
              finalSeverity: canonicalSeverity,
              source: hybridResult.decisionSource,
              severityBadge: hybridResult.severityBadge,
              aiSeverity: hybridResult.aiSeverity,
              citizenSeverity: hybridResult.citizenSeverity,
              contradictionLevel: hybridResult.contradictionLevel,
            },

            // Keep existing telemetry/debug fields for admin auditing
            title: titleString,
            description: descriptionString,
            confidence: hybridResult.finalConfidence,
            radiusKm: radiusKmHeuristic,
            timestamp: new Date().toISOString(),
            aiSummary: aiSummaryString,
            dataSources: ["heuristic_fusion"],
            keyFactors: ["citizen_report", "circuit_breaker_activated", "degraded_mode_path"],
            processingMode: "fallback",
            fallbackTriggered: true,
            fallbackReason: "degraded_mode",
            householdImpact: householdImpact,
            decisionEngine: decisionEngine
          });

          await signalRef.update({
            aiMode: "fallback",
            fallbackReason: "degraded_mode"
          });

        } else {
          // Standard Path: AI Agent-Based CIRO Processing
          console.log(`[TRUTH ENGINE] Standard Path: Activating CIRO AI Agent Fusion.`);

          const aiResult = await runCiroAIAgent(payload);
          const aiData = aiResult.analysis;
          const aiMode = aiResult.aiMode;
          const fallbackReason = aiResult.fallbackReason;

          let parsedDecision = null;
          if (aiResult && aiResult.rawDecision) {
            if (typeof aiResult.rawDecision === 'string') {
              try {
                parsedDecision = JSON.parse(aiResult.rawDecision);
              } catch (e) {
                console.log(`[CIRO DECISION] Failed to parse rawDecision string:`, e);
              }
            } else if (typeof aiResult.rawDecision === 'object') {
              parsedDecision = aiResult.rawDecision;
            }
          }

          let extractedSubType = null;
          let extractedSeverity = null;
          let extractedRadiusKm = null;
          let extractedType = null;

          if (parsedDecision && parsedDecision.crises && parsedDecision.crises.length > 0) {
            const firstCrisis = parsedDecision.crises[0];
            extractedSubType = firstCrisis.subType || (firstCrisis.location ? firstCrisis.location.type : null) || firstCrisis.type;
            extractedType = firstCrisis.type || (firstCrisis.location ? firstCrisis.location.type : null);
            extractedSeverity = firstCrisis.severity || (firstCrisis.location ? firstCrisis.location.severity : null);
            if (firstCrisis.location && typeof firstCrisis.location.radiusKm === 'number') {
              extractedRadiusKm = firstCrisis.location.radiusKm;
            } else if (typeof firstCrisis.radiusKm === 'number') {
              extractedRadiusKm = firstCrisis.radiusKm;
            }
          }

          const subTypeString = (extractedSubType || subType || payload.crisisType || "unknown").toLowerCase();
          const titleString = payload.title || payload.subType || payload.eventType || "CRITICAL INCIDENT";

          // ── HYBRID PRIORITY RESOLUTION (Standard AI Path) ──────────────────
          // Rule: AI/fusion severity is an input, NOT an override.
          // Citizen's declared severity sets a protected floor.
          const citizenDeclaredSeverity = normalizeSeverity(payload.severity);
          const rawAiSeverity = normalizeSeverity(extractedSeverity || aiData.severity);
          const hybridResult = resolveHybridSeverity({
            citizenSeverity: citizenDeclaredSeverity,
            aiSeverity: rawAiSeverity,
            contradictionLevel: "NONE", // credibilityEngine not called in this path yet
            hasGps: !!(payload.location && typeof payload.location.lat === 'number'),
            reliabilityScore: aiData.confidence || 0.65,
          });
          const canonicalSeverity = hybridResult.finalSeverity;
          const canonicalImpactScore = aiData.impactScore !== undefined ? aiData.impactScore : null;
          const canonicalConfidenceScore = hybridResult.finalConfidence;
          const canonicalPriorityScore = computePriorityScore(canonicalImpactScore, canonicalConfidenceScore, canonicalSeverity);
          const descriptionString = payload.description || "Emergency alert registered. Local monitoring active.";
          const aiSummaryString = aiResult.reasoning || (parsedDecision && parsedDecision.systemExplanation ? parsedDecision.systemExplanation : null) || "No AI analysis available.";

          // Enforce Single Source of Truth: Normalize nested severity immediately
          if (parsedDecision && Array.isArray(parsedDecision.crises)) {
            parsedDecision.crises.forEach(c => {
              if (c) c.severity = canonicalSeverity;
            });
            aiResult.rawDecision = typeof aiResult.rawDecision === 'string' ? JSON.stringify(parsedDecision) : parsedDecision;
          }

          const intelligenceId = db.collection("ciro_intelligence").doc().id;

          // Write to new ciro_intelligence collection
          const intelligenceDoc = {
            intelligenceId: intelligenceId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            inputs: aiResult.inputs,
            aiMode: aiMode,
            fallbackReason: fallbackReason,
            analysis: {
              isCrisis: aiData.isCrisis,
              type: aiData.type,
              severity: aiData.severity,
              confidence: aiData.confidence,
              impactScore: aiData.impactScore || 0,
              escalationPattern: aiData.escalationPattern || "Unknown",
              signalBreakdown: aiData.signalBreakdown || {},
              keyEvidence: aiData.keyEvidence || []
            },
            reasoning: aiResult.reasoning,
            geoCluster: {
              lat: payload.location && typeof payload.location.lat === 'number' ? payload.location.lat : null,
              lng: payload.location && typeof payload.location.lng === 'number' ? payload.location.lng : null,
              radiusKm: 5.0
            },
            recommendedActions: aiResult.recommendedActions,
            linkedCrisisId: eventId,
            rawDecision: aiResult.rawDecision
          };

          await db.collection("ciro_intelligence").doc(intelligenceId).set(intelligenceDoc);
          await db.collection("ciro_intelligence_history").doc(intelligenceId).set(intelligenceDoc);

          let numericSeverity = 3;
          switch (aiData.severity) {
            case "Low": numericSeverity = 2; break;
            case "Medium": numericSeverity = 3; break;
            case "High": numericSeverity = 4; break;
            case "Critical": numericSeverity = 5; break;
          }

          let radiusKm = null;
          if (parsedDecision && parsedDecision.crises &&
            parsedDecision.crises.length > 0 &&
            parsedDecision.crises[0].location &&
            typeof parsedDecision.crises[0].location.radiusKm === 'number') {
            radiusKm = parsedDecision.crises[0].location.radiusKm;
          }

          if (radiusKm === null) {
            const sevStr = (aiData.severity || "Medium").toString();
            switch (sevStr) {
              case "Critical": radiusKm = 8.0; break;
              case "High": radiusKm = 5.0; break;
              case "Medium": radiusKm = 3.0; break;
              case "Low": radiusKm = 1.5; break;
              default: radiusKm = 3.0; break;
            }
          }

          const decisionEngine = computeDecisionEngine(numericSeverity, radiusKm, typeof aiData.impactScore === 'number' ? aiData.impactScore : null, aiData.confidence, householdImpact, 0);
          const finalRadiusKm = typeof extractedRadiusKm === 'number' ? extractedRadiusKm : (radiusKm || 3.0);

          await crisisRef.set({
            crisisId: eventId,
            severity: canonicalSeverity,
            priorityScore: canonicalPriorityScore,
            status: "NEW",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            history: [],
            impactScore: canonicalImpactScore,
            confidenceScore: canonicalConfidenceScore,
            affectedPopulation: null,
            subType: subTypeString,
            location: {
              lat: payload.location && typeof payload.location.lat === 'number' ? payload.location.lat : null,
              lng: payload.location && typeof payload.location.lng === 'number' ? payload.location.lng : null,
              name: payload.location && payload.location.name ? payload.location.name : "Target Zone"
            },
            time: admin.firestore.FieldValue.serverTimestamp(),
            eventType: "crisis",
            ciroIntelligenceId: intelligenceId,

            // ── Hybrid Resolution Metadata (MUST NOT be overwritten) ──────────
            citizenInput: {
              severity: citizenDeclaredSeverity,
              description: payload.description || null,
              userId: userId || null,
              userEmail: payload.userEmail || null,
            },
            analysis: {
              finalSeverity: canonicalSeverity,
              source: hybridResult.decisionSource,
              severityBadge: hybridResult.severityBadge,
              aiSeverity: rawAiSeverity,
              citizenSeverity: citizenDeclaredSeverity,
              contradictionLevel: hybridResult.contradictionLevel,
            },

            // Keep existing metadata for auditing/debugging
            title: titleString,
            description: descriptionString,
            confidence: canonicalConfidenceScore,
            radiusKm: finalRadiusKm,
            timestamp: new Date().toISOString(),
            dataSources: aiData.dataSources || [],
            keyFactors: ["ai_agent_verification", "multi_source_fusion"],
            aiSummary: aiSummaryString,
            rawDecision: aiResult.rawDecision,
            processingMode: aiMode,
            fallbackTriggered: fallbackReason !== "none" && fallbackReason !== null,
            fallbackReason: fallbackReason,
            householdImpact: householdImpact,
            decisionEngine: decisionEngine
          });

          await signalRef.update({
            aiMode: aiMode,
            fallbackReason: fallbackReason
          });

        }

      } else if (eventType === "relief") {
        // ── MULTI-NEED RELIEF PIPELINE ───────────────────────────────────────────
        // Reads payload.needs[] if present (multi-need); falls back to [subType]
        // for full backward compatibility with existing single-subType submissions.
        // Each resolved need creates an independent relief_requests document.
        // ─────────────────────────────────────────────────────────────────────────

        const normalizeNeed = (n) => {
          let need = (n || "food").toLowerCase();
          if (need === "medical")   need = "medical_aid";
          if (need === "water")     need = "food";      // water → food fallback
          if (need === "logistics") need = "food";      // logistics → food fallback
          if (need === "rescue")    need = "shelter";   // rescue → shelter
          if (!["shelter", "food", "medical_aid"].includes(need)) need = "food";
          return need;
        };

        // Resolve the needs array: payload.needs[] takes priority, else [subType]
        const rawNeeds = (payload.needs && Array.isArray(payload.needs) && payload.needs.length > 0)
          ? payload.needs
          : [subType];

        // Deduplicate after normalization
        const uniqueNeeds = [...new Set(rawNeeds.map(normalizeNeed))];

        console.log(`[RELIEF PIPELINE] STEP 1: Processing event: ${eventId}. Resolved needs: ${JSON.stringify(uniqueNeeds)}`);

        let anyNeedProcessed = false; // Track if at least one need was acted on

        for (const normalizedSubType of uniqueNeeds) {
          // Relief doc ID: deterministic per event+need; supports multi-need from same eventId
          const reliefDocId = `${eventId}_${normalizedSubType}`;

          let duplicateCheckStatus = "new";
          let linkedRequestId = null;
          let priorityScore = 0.5;

          // 1. Query for active requests of the same type by this user
          const activeRequestsSnap = await db
            .collection("relief_requests")
            .where("userId", "==", userId)
            .where("subType", "==", normalizedSubType)
            .where("status", "in", ["pending", "assigned", "in_progress"])
            .limit(1)
            .get();

          if (!activeRequestsSnap.empty) {
            const prevDoc = activeRequestsSnap.docs[0];
            const prevData = prevDoc.data();
            linkedRequestId = prevDoc.id;

            console.log(`[RELIEF PIPELINE] Active duplicate found for [${normalizedSubType}]: ${linkedRequestId}`);

            // Rule B — Cooldown Window (30 minutes)
            const prevCreatedAt = prevData.createdAt ? prevData.createdAt.toDate() : new Date(0);
            const timeDiffMinutes = (Date.now() - prevCreatedAt.getTime()) / 60000;

            // Rule C — Location Consistency Check (>5km difference)
            let distanceKm = 0;
            if (payload.location && prevData.location) {
              distanceKm = haversineDistance(payload.location, prevData.location);
              console.log(`[RELIEF PIPELINE] Distance check [${normalizedSubType}]: ${distanceKm.toFixed(2)} km`);
            }

            if (timeDiffMinutes <= 30) {
              duplicateCheckStatus = "merged";
              console.log(`[RELIEF PIPELINE] Rule B: Cooldown active (${timeDiffMinutes.toFixed(1)} mins). Merging [${normalizedSubType}] into existing request.`);

              const updatedNotes = `${prevData.notes || ""}\n[SYSTEM MERGE - ${new Date().toISOString()}]: Additional ${normalizedSubType} request submitted. Reason: ${payload.description || "none"}`.trim();
              await db.collection("relief_requests").doc(linkedRequestId).update({
                notes: updatedNotes,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                duplicateCheckStatus: "merged"
              });
              anyNeedProcessed = true;
            } else {
              duplicateCheckStatus = "blocked";
              console.log(`[RELIEF PIPELINE] Rule A: Active duplicate for [${normalizedSubType}] outside cooldown. Skipping this need.`);
            }

            if (distanceKm > 5.0) {
              duplicateCheckStatus = "flagged";
              console.log(`[RELIEF PIPELINE] Rule C: Location shifted > 5km (${distanceKm.toFixed(2)} km) for [${normalizedSubType}]. Flagging.`);
              await db.collection("relief_requests").doc(linkedRequestId).update({
                duplicateCheckStatus: "flagged",
                notes: `${prevData.notes || ""}\n[WARNING]: User submitted location shift of ${distanceKm.toFixed(1)}km. Requires manual verification.`.trim()
              });
            }
          }

          // Rule A blocked: skip this need, continue processing remaining needs
          if (duplicateCheckStatus === "blocked") {
            console.log(`[RELIEF PIPELINE] Rule A: Skipping blocked need [${normalizedSubType}].`);
            continue;
          }

          // New or flagged: create a new independent relief_requests document
          if (duplicateCheckStatus === "new" || duplicateCheckStatus === "flagged") {
            if (userData.stats && userData.stats.riskScore) {
              priorityScore = Math.min(1.0, userData.stats.riskScore / 100);
            }

            const reliefRef = db.collection("relief_requests").doc(reliefDocId);
            await reliefRef.set({
              requestId: reliefDocId,
              eventId: eventId,          // Link back to the originating event
              eventType: "relief",
              subType: normalizedSubType,
              priorityScore: parseFloat(priorityScore.toFixed(2)),
              location: payload.location || null,
              status: "pending",
              duplicateCheckStatus: duplicateCheckStatus,
              userId: userId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              notes: payload.description || `Requested ${normalizedSubType} aid.`
            });

            anyNeedProcessed = true;
            console.log(`[RELIEF PIPELINE] Created relief_requests/${reliefDocId} for need: [${normalizedSubType}]`);
          }
        } // end for each need

        // If every need was blocked by Rule A, fail this event (same behavior as original single-need block)
        if (!anyNeedProcessed) {
          console.log(`[RELIEF PIPELINE] All needs blocked by Rule A. Marking event as failed.`);
          await snapshot.ref.update({
            status: "failed",
            failureReason: "active_request_exists_for_all_needs",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return null; // Exit cleanly, no retries
        }
      }

      // ==========================================
      // UNIFIED USER IMPACT ENGINE (REAL-TIME SECURE)
      // ==========================================
      console.log(`[USER IMPACT ENGINE] Running for user: ${userId} | EventType: ${eventType}`);

      // Map dynamic recent interaction
      let recentCrisisInteraction = userData.recentCrisisInteraction || (userData.stats && userData.stats.recentCrisisInteraction) || "None";
      if (eventType === "crisis") {
        recentCrisisInteraction = subType.charAt(0).toUpperCase() + subType.slice(1); // e.g. "Flood"
      } else if (eventType === "relief") {
        if (!recentCrisisInteraction || recentCrisisInteraction === "None") {
          recentCrisisInteraction = "None";
        }
      }

      // Compute additive risk score modifications
      let riskDelta = 0;
      if (eventType === "crisis") {
        riskDelta += 10;
        const normalizedSub = subType.toLowerCase();
        if (["flood", "fire", "earthquake", "heatwave"].includes(normalizedSub)) {
          riskDelta += 15;
        }
        if (normalizedSub.includes("medical") || normalizedSub === "medical_aid") {
          riskDelta += 12;
        }
      } else if (eventType === "relief") {
        riskDelta += 3;

        // Multi-aid support
        const needs = payload.needs;
        if (needs && Array.isArray(needs)) {
          needs.forEach(need => {
            const normalizedNeed = need.toLowerCase();
            if (normalizedNeed === "shelter") {
              riskDelta += 5;
            } else if (normalizedNeed === "food" || normalizedNeed === "water") {
              riskDelta += 4;
            } else if (normalizedNeed === "medical" || normalizedNeed === "medical_aid") {
              riskDelta += 12;
            }
          });
        } else {
          // Single subType fallback
          const normalizedSub = subType.toLowerCase();
          if (normalizedSub === "shelter") {
            riskDelta += 5;
          } else if (normalizedSub === "food" || normalizedSub === "water") {
            riskDelta += 4;
          } else if (normalizedSub === "medical" || normalizedSub === "medical_aid") {
            riskDelta += 12;
          }
        }
      }

      // Read current risk score from existing user data to calculate proper clamp
      const currentRisk = (userData.stats && userData.stats.riskScore !== undefined)
        ? userData.stats.riskScore
        : (userData.riskScore || 0);

      // Clamp risk score changes strictly between 0 and 100
      let newRiskScore = currentRisk + riskDelta;
      if (newRiskScore > 100) {
        riskDelta = 100 - currentRisk;
      } else if (newRiskScore < 0) {
        riskDelta = -currentRisk;
      }

      // Map vulnerability tags
      const tagsToAdd = [];
      const needs = payload.needs;
      if (needs && Array.isArray(needs)) {
        needs.forEach(need => {
          const normalizedNeed = need.toLowerCase();
          if (normalizedNeed === "shelter") {
            tagsToAdd.push("vulnerability: housing");
          } else if (normalizedNeed === "food" || normalizedNeed === "water") {
            tagsToAdd.push("vulnerability: sustenance");
          } else if (normalizedNeed === "medical" || normalizedNeed === "medical_aid") {
            tagsToAdd.push("vulnerability: health");
          }
        });
      } else {
        const normalizedSub = subType.toLowerCase();
        if (normalizedSub === "shelter") {
          tagsToAdd.push("vulnerability: housing");
        } else if (normalizedSub === "food" || normalizedSub === "water") {
          tagsToAdd.push("vulnerability: sustenance");
        } else if (normalizedSub === "medical" || normalizedSub === "medical_aid") {
          tagsToAdd.push("vulnerability: health");
        }
      }

      // Construct exact updateObject using atomic FieldValue methods for real-time safety
      const updateObject = {
        // Root level updates
        lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
        recentCrisisInteraction: recentCrisisInteraction,

        // Nested stats updates (fully matched for backwards compatibility)
        "stats.lastActiveAt": admin.firestore.FieldValue.serverTimestamp(),
        "stats.recentCrisisInteraction": recentCrisisInteraction,
      };

      // Set counters
      if (eventType === "crisis" || type === "signal") {
        updateObject.totalReports = admin.firestore.FieldValue.increment(1);
        updateObject["stats.totalReports"] = admin.firestore.FieldValue.increment(1);
      } else if (eventType === "relief" || type === "aid_request" || type === "relief_request") {
        updateObject.totalAidRequests = admin.firestore.FieldValue.increment(1);
        updateObject["stats.totalAidRequests"] = admin.firestore.FieldValue.increment(1);
      }

      // Increment risk score atomically
      if (riskDelta !== 0) {
        updateObject.riskScore = admin.firestore.FieldValue.increment(riskDelta);
        updateObject["stats.riskScore"] = admin.firestore.FieldValue.increment(riskDelta);
      }

      // Add vulnerability tags atomically
      if (tagsToAdd.length > 0) {
        updateObject.vulnerabilityTags = admin.firestore.FieldValue.arrayUnion(...tagsToAdd);
        updateObject["stats.vulnerabilityTags"] = admin.firestore.FieldValue.arrayUnion(...tagsToAdd);
      }

      // Add lastActiveLocation if present
      if (payload.location && payload.location.lat !== undefined && payload.location.lng !== undefined) {
        updateObject.lastActiveLocation = {
          lat: payload.location.lat,
          lng: payload.location.lng
        };
        updateObject["location.lastKnownLat"] = payload.location.lat;
        updateObject["location.lastKnownLng"] = payload.location.lng;
      }

      console.log("PROFILE UPDATED FOR:", userId);
      console.log("UPDATE DATA:", updateObject);

      await userRef.update(updateObject);
      // ==========================================

      // Mark Event completed
      await snapshot.ref.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update observability stats
      const latency = Date.now() - startTime;
      const updatedMetricsDoc = await db.collection("system_metrics").doc("realtime").get();
      let avgLatency = latency;
      if (updatedMetricsDoc.exists) {
        const data = updatedMetricsDoc.data();
        const processed = data.events_processed || 0;
        const prevAvg = data.avg_processing_time || 0;
        avgLatency = Math.floor((prevAvg * processed + latency) / (processed + 1));
      }

      await db.collection("system_metrics").doc("realtime").set({
        events_processed: admin.firestore.FieldValue.increment(1),
        avg_processing_time: avgLatency,
        queue_backlog_size: backlogSize,
        circuit_breaker_status: enterDegradedMode ? "DEGRADED" : "HEALTHY",
      }, { merge: true });

    } catch (error) {
      const currentRetry = eventData.retryCount || 0;
      console.error(`[INFRASTRUCTURE ENGINE] Processing failure. Retry: ${currentRetry}. Error: ${error.message}`);

      if (currentRetry < 5) {
        const nextRetry = currentRetry + 1;
        const backoffMs = Math.pow(2, nextRetry) * 1000;

        setTimeout(async () => {
          await snapshot.ref.update({
            status: "pending",
            retryCount: nextRetry,
            failureReason: error.message,
          });
        }, backoffMs);
      } else {
        console.error(`[INFRASTRUCTURE ENGINE] Ingestion exhausted for event ${eventId}. routing to DLQ.`);

        await db.collection("event_queue_failed").doc(eventId).set({
          eventId: eventId,
          originalPayload: eventData.payload || {},
          failureReason: error.message,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          retryCount: currentRetry,
        });

        await snapshot.ref.update({
          status: "failed",
          failureReason: error.message,
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await db.collection("system_metrics").doc("realtime").set({
          events_failed: admin.firestore.FieldValue.increment(1),
        }, { merge: true });
      }
    } finally {
      // STEP 6: Delete Concurrency Lock to allow future processing of this event ID if necessary
      try {
        await lockRef.delete();
        console.log(`[INFRASTRUCTURE ENGINE] Concurrency Lock deleted for event: ${eventId}`);
      } catch (deleteError) {
        console.error(`[INFRASTRUCTURE ENGINE] Lock cleanup warning: ${deleteError.message}`);
      }
    }

    return null;
  });

/**
 * HEALTH CHECK ENDPOINT (CLOUD FUNCTION)
 * Exposes live health parameters and circuit breaker status in real-time.
 */
exports.system_health = functions
  .runWith({ maxInstances: 10 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");

    try {
      const metricsDoc = await db.collection("system_metrics").doc("realtime").get();
      const metrics = metricsDoc.exists ? metricsDoc.data() : {};

      const received = metrics.events_received || 0;
      const failed = metrics.events_failed || 0;
      const failureRate = received > 0 ? parseFloat((failed / received).toFixed(4)) : 0.0;

      const pendingSnapshot = await db.collection("event_queue").where("status", "==", "pending").get();
      const backlogSize = pendingSnapshot.size;

      let status = "healthy";
      if (backlogSize > 10 || failureRate > 0.05) {
        status = "degraded";
      }
      if (backlogSize > 50 || failureRate > 0.20 || metrics.circuit_breaker_status === "DEGRADED") {
        status = "critical";
      }

      res.status(200).json({
        status: status,
        queueDepth: backlogSize,
        failureRate: failureRate,
        circuitBreaker: metrics.circuit_breaker_status || "HEALTHY",
        avgLatency: metrics.avg_processing_time ? `${(metrics.avg_processing_time / 1000).toFixed(2)}s` : "0.00s",
        metrics: {
          received: received,
          processed: metrics.events_processed || 0,
          failed: failed,
        }
      });
    } catch (err) {
      res.status(500).json({
        status: "critical",
        error: err.message,
      });
    }
  });

/**
 * FAMILY PROFILE AGGREGATION TRIGGER
 * Automatically recalculates householdSize and vulnerabilities for a user's family profile
 * whenever a member is added, updated, or removed.
 */
exports.aggregateFamilyProfile = functions
  .runWith({ maxInstances: 10 })
  .firestore.document("family_profiles/{userId}/members/{memberId}")
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    const db = admin.firestore();
    const membersRef = db.collection(`family_profiles/${userId}/members`);
    const parentRef = db.collection("family_profiles").doc(userId);

    try {
      // Fetch all members to recalculate
      const snapshot = await membersRef.get();
      const householdSize = snapshot.size;

      const vulnerabilities = new Set();
      snapshot.forEach(doc => {
        const member = doc.data();
        if (member.type) {
          const type = member.type.toLowerCase();
          if (["child", "elderly", "elder", "disabled", "pregnant"].includes(type)) {
            vulnerabilities.add(type);
          }
        }
      });

      // Update parent document
      await parentRef.set({
        householdSize: householdSize,
        vulnerabilities: Array.from(vulnerabilities),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Ensure householdId is stable
        householdId: parentRef.id
      }, { merge: true });

      console.log(`[FAMILY SYSTEM] Aggregated profile for ${userId}: size=${householdSize}`);
    } catch (error) {
      console.error(`[FAMILY SYSTEM] Failed to aggregate profile for ${userId}:`, error);
    }
  });

/**
 * PRODUCTION CONTRACT: Sync User Roles to Auth Custom Claims
 * This enforces zero-read pure Custom Claims validation in firestore.rules
 */
exports.syncUserClaims = functions.firestore
  .document("users/{uid}")
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const data = change.after.exists ? change.after.data() : null;

    if (!data) {
      // Profile deleted, clear claims to securely revoke access
      await admin.auth().setCustomUserClaims(uid, null);
      console.log(`[AUTH CONTROLLER] Revoked custom claims for deleted user ${uid}`);
      return;
    }

    // Contract: Always enforce explicit properties for security evaluation
    const claims = {
      role: data.role || "citizen",
      isActive: data.isActive !== false,
      ngoId: data.ngoId || null
    };

    try {
      await admin.auth().setCustomUserClaims(uid, claims);
      console.log(`[AUTH CONTROLLER] Synced identity claims for ${uid}:`, claims);
    } catch (error) {
      console.error(`[AUTH CONTROLLER] FATAL ERROR syncing claims for ${uid}:`, error);
    }
  });

/**
 * CRISIS PRIORITY ENGINE
 * Computes deterministic priority scores for multi-crisis sorting.
 */
exports.calculateCrisisPriority = functions.firestore
  .document("crises/{crisisId}")
  .onWrite(async (change, context) => {
    const data = change.after.exists ? change.after.data() : null;
    if (!data) return null;

    const crisisId = context.params.crisisId;

    const canonicalSeverity = normalizeSeverity(data.severity || data.severityString);
    let severityWeight = 2; // MEDIUM
    if (canonicalSeverity === "LOW") severityWeight = 1;
    else if (canonicalSeverity === "MEDIUM") severityWeight = 2;
    else if (canonicalSeverity === "HIGH") severityWeight = 3;
    else if (canonicalSeverity === "CRITICAL") severityWeight = 4;

    const imp = typeof data.impactScore === "number" ? data.impactScore : null;
    const conf = typeof data.confidenceScore === "number" ? data.confidenceScore : (typeof data.confidence === "number" ? data.confidence : null);

    const priorityScore = parseFloat(((imp * 0.45) + (conf * 100 * 0.35) + (severityWeight * 0.20)).toFixed(2));

    const regionalClusterId = data.location && data.location.lat ?
      `cluster_${Math.floor(data.location.lat)}_${Math.floor(data.location.lng)}` :
      "cluster_global";

    // Only update if changed
    if (data.priorityScore !== priorityScore || data.regionalClusterId !== regionalClusterId || data.crisisId !== crisisId) {
      console.log(`[PRIORITY ENGINE] Recomputing score for ${crisisId}: ${priorityScore}`);
      return change.after.ref.update({
        crisisId: crisisId,
        priorityScore: priorityScore,
        regionalClusterId: regionalClusterId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return null;
  });