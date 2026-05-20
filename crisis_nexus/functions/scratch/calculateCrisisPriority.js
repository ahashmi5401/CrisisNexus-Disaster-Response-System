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

    // Severity weights: CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1
    let severityWeight = 1;
    const severityStr = (data.severityString || "").toUpperCase();
    const severityNum = data.severity;
    
    if (severityStr === "CRITICAL" || severityNum === 5) severityWeight = 4;
    else if (severityStr === "HIGH" || severityNum === 4) severityWeight = 3;
    else if (severityStr === "MEDIUM" || severityNum === 3) severityWeight = 2;
    else if (severityStr === "LOW" || severityNum <= 2) severityWeight = 1;

    // Radius
    const radiusKm = data.radiusKm || 3;

    // Recency weight: Newer crises get a small bump (e.g., decay over time or just timestamp base)
    // To make it deterministic and favor recent:
    const timestamp = data.time ? (data.time.seconds || data.time._seconds || Date.now() / 1000) : Date.now() / 1000;
    // Base time: let's just use timestamp as a fractional addition or use a recency formula
    const recencyWeight = (timestamp / 10000000000); // Small fractional value so it acts as tie-breaker

    // Priority formula
    const priorityScore = (severityWeight * 1000) + (radiusKm * 25) + recencyWeight;

    const regionalClusterId = data.location && data.location.lat ? 
      `cluster_${Math.floor(data.location.lat)}_${Math.floor(data.location.lng)}` : 
      "cluster_global";

    // Only update if changed to avoid infinite loops
    if (data.priorityScore !== priorityScore || data.regionalClusterId !== regionalClusterId) {
      console.log(`[PRIORITY ENGINE] Recomputing score for ${crisisId}: ${priorityScore}`);
      return change.after.ref.update({
        priorityScore: priorityScore,
        regionalClusterId: regionalClusterId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return null;
  });
