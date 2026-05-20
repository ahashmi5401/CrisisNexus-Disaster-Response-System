/**
 * credibilityEngine.js
 * Scores the credibility of normalized signals.
 * Fulfills hackathon "misinformation handling" requirement.
 */

const SOURCE_TRUST = {
    'citizen': 0.65,
    'weather': 0.95,
    'traffic': 0.90,
    'field_operator': 0.98
};

function getFreshnessScore(freshnessMs) {
    const mins = freshnessMs / 60000;
    if (mins < 5) return 1.0;
    if (mins < 15) return 0.85;
    if (mins < 30) return 0.7;
    return 0.4;
}

function getLocationScore(signal) {
    if (!signal.hasLocation) return 0.0;
    
    // Check if exact GPS was verified
    if (signal.confidenceInputs && signal.confidenceInputs.hasExactGps) {
        return 1.0;
    }
    
    // APIs usually give approximate area
    if (signal.sourceType === 'weather' || signal.sourceType === 'traffic') {
        return 0.7;
    }

    return 0.7; // default for approximate area
}

function detectContradictions(signals) {
    let hasDryWeather = false;
    let hasFloodReport = false;
    
    for (const s of signals) {
        // Detect weather dry
        if (s.sourceType === 'weather') {
            const rainfall = s.normalizedPayload?.rainfall;
            if (rainfall !== null && rainfall < 5) {
                hasDryWeather = true;
            }
        }
        // Detect citizen flood report
        if (s.sourceType === 'citizen') {
            const desc = s.normalizedPayload?.description?.toLowerCase() || "";
            if (desc.includes('flood') || desc.includes('water')) {
                hasFloodReport = true;
            }
        }
    }

    return {
        hasContradiction: hasDryWeather && hasFloodReport,
        penalty: (hasDryWeather && hasFloodReport) ? 0.25 : 0.0
    };
}

function scoreCredibility(signals) {
    if (!Array.isArray(signals)) {
        signals = [signals];
    }
    
    if (signals.length === 0) {
        return { 
            credibilityScore: null, 
            contradictionLevel: "NONE", 
            confidenceRange: [0, 0],
            scoredSignals: [] 
        };
    }

    const { hasContradiction, penalty } = detectContradictions(signals);
    let contradictionLevel = hasContradiction ? "HIGH" : "NONE";

    const scoredSignals = signals.map(signal => {
        const sourceTrust = SOURCE_TRUST[signal.sourceType] || 0.5;
        const freshnessScore = getFreshnessScore(signal.freshness);
        const locationScore = getLocationScore(signal);

        // Calculate base score using a weighted average
        // Weighting source trust the highest
        let score = (sourceTrust * 0.5) + (freshnessScore * 0.3) + (locationScore * 0.2);
        
        // Apply contradiction penalty
        score -= penalty;
        
        // Clamp between 0 and 1
        score = Math.max(0, Math.min(1, score)); 

        // Apply error margin to create a confidence range rather than a precise number
        const errorMargin = signal.sourceType === 'citizen' ? 0.15 : 0.05;
        const minScore = Math.max(0, score - errorMargin);
        const maxScore = Math.min(1, score + errorMargin);

        return {
            ...signal,
            credibilityScore: parseFloat(score.toFixed(2)),
            confidenceRange: [parseFloat(minScore.toFixed(2)), parseFloat(maxScore.toFixed(2))]
        };
    });

    // Compute overall event credibility based on signals
    const avgScore = scoredSignals.reduce((acc, s) => acc + s.credibilityScore, 0) / scoredSignals.length;
    
    // Overall range calculation
    const overallMin = Math.max(0, avgScore - 0.12);
    const overallMax = Math.min(1, avgScore + 0.08);

    return {
        credibilityScore: parseFloat(avgScore.toFixed(2)),
        contradictionLevel,
        confidenceRange: [parseFloat(overallMin.toFixed(2)), parseFloat(overallMax.toFixed(2))],
        scoredSignals
    };
}

module.exports = { scoreCredibility };
