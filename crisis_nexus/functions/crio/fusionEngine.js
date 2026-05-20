/**
 * fusionEngine.js
 * CRIO's core brain.
 * Determines if evidence aligns, contradicts, or is insufficient.
 */

function fuseSignals(signals, credibilityResult) {
    let supportingSignals = [];
    let conflictingSignals = [];
    
    // If contradictionLevel is HIGH, we assume there are conflicting signals
    if (credibilityResult && credibilityResult.contradictionLevel === "HIGH") {
        // Group signals roughly
        signals.forEach(s => {
            if (s.sourceType === 'weather') conflictingSignals.push(s);
            else if (s.sourceType === 'citizen') conflictingSignals.push(s);
            else supportingSignals.push(s);
        });
        
        return {
            status: "CONFLICTING",
            fusionStatus: "CONFLICTING",
            supportingSignals,
            conflictingSignals
        };
    }

    // No major contradiction, align all signals
    supportingSignals = [...signals];
    
    if (supportingSignals.length >= 3) {
        return {
            status: "FUSED",
            fusionStatus: "CONFIRMED",
            supportingSignals,
            conflictingSignals: []
        };
    }

    // If there is any citizen emergency signal, do not block crisis creation
    const hasCitizenSignal = supportingSignals.some(s => s.sourceType === 'citizen');
    if (hasCitizenSignal) {
        return {
            status: "WEAK_CONFIRMATION",
            fusionStatus: "WEAK_CONFIRMATION",
            supportingSignals,
            conflictingSignals: []
        };
    }

    // Default to needing verification if < 3 aligned signals and no citizen signal
    return {
        status: "NEEDS_VERIFICATION",
        fusionStatus: "NEEDS_VERIFICATION",
        supportingSignals,
        conflictingSignals: []
    };
}

module.exports = { fuseSignals };
