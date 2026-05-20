/**
 * degradedMode.js
 * Ensures explicit fallback handling for unreliable inputs.
 */

function checkDegradedMode(fusionResult, credibilityResult) {
    // Triggers: API timeout, conflicting signals, missing coordinates, rate limit
    
    if (fusionResult.status === "CONFLICTING" || fusionResult.status === "NEEDS_VERIFICATION") {
        return {
            mode: "DEGRADED",
            escalation: "MANUAL_REVIEW",
            reason: "Insufficient or Conflicting Data"
        };
    }
    
    let hasLocation = false;
    if (fusionResult.supportingSignals) {
        hasLocation = fusionResult.supportingSignals.some(s => s.hasLocation);
    }
    
    if (!hasLocation && fusionResult.supportingSignals.length > 0) {
        return {
            mode: "DEGRADED",
            escalation: "MANUAL_REVIEW",
            reason: "Missing coordinates"
        };
    }

    return null; // Normal operation mode
}

module.exports = { checkDegradedMode };
