/**
 * classifier.js
 * Explicit classification without hallucination.
 */

const ALLOWED_CLASSES = [
    "flood",
    "fire",
    "heatwave",
    "accident",
    "power_outage",
    "protest",
    "disease_cluster",
    "infrastructure_failure",
    "general_emergency",
    "unclassified"
];
   
function classify(fusionResult) {
    if (fusionResult.status !== "FUSED" && fusionResult.status !== "WEAK_CONFIRMATION") {
        return "unclassified";
    }

    // Try to derive classification from text/payloads
    for (const signal of fusionResult.supportingSignals) {
        const payload = signal.normalizedPayload;
        if (!payload) continue;
        
        const desc = (payload.description || "").toLowerCase();
        
        if (desc.includes('flood') || desc.includes('water') || payload.rainfall > 50) return "flood";
        if (desc.includes('fire') || desc.includes('smoke')) return "fire";
        if (desc.includes('heat') || payload.temperature > 40) return "heatwave";
        if (desc.includes('accident') || desc.includes('crash')) return "accident";
        if (desc.includes('power') || desc.includes('outage')) return "power_outage";
        if (desc.includes('protest') || desc.includes('riot')) return "protest";
        if (desc.includes('emergency') || desc.includes('injury') || desc.includes('disaster')) return "general_emergency";
    }

    // Rule: Never guess
    return "unclassified";
}
   
module.exports = { classify };
