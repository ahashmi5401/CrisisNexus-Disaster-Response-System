/**
 * severityEngine.js
 * Computes severity based ONLY on existing evidence.
 */

function computeSeverity(fusionResult) {
    // Compute only if evidence exists
    if (fusionResult.status !== "FUSED" && fusionResult.status !== "WEAK_CONFIRMATION") {
        return {
            severity: "UNKNOWN",
            uncertainty: "HIGH",
            radiusEstimate: null
        };
    }

    const signals = fusionResult.supportingSignals;
    const signalVolume = signals.length;
    
    let severity = "MEDIUM";
    let uncertainty = "LOW";
    let radiusEstimate = 1.5;

    if (fusionResult.status === "WEAK_CONFIRMATION") {
        uncertainty = "MEDIUM";
        // Check citizen signals for higher urgency levels or description keywords
        let maxUrgency = "MEDIUM";
        for (const s of signals) {
            const desc = (s.normalizedPayload?.description || "").toLowerCase();
            const urg = (s.normalizedPayload?.urgency || "").toUpperCase();
            if (urg === "CRITICAL" || desc.includes("critical") || desc.includes("severe")) {
                maxUrgency = "CRITICAL";
            } else if (urg === "HIGH" || desc.includes("high") || desc.includes("major")) {
                if (maxUrgency !== "CRITICAL") maxUrgency = "HIGH";
            }
        }
        severity = maxUrgency;
    } else {
        // simplistic calculation based on volume for demonstration
        if (signalVolume >= 5) {
            severity = "CRITICAL";
            radiusEstimate = 5.0;
        } else if (signalVolume >= 3) {
            severity = "HIGH";
            radiusEstimate = 2.5;
        }
    }

    return {
        severity,
        uncertainty,
        radiusEstimate
    };
}

module.exports = { computeSeverity };
