/**
 * signalNormalizer.js
 * Normalizes incoming signals from various sources into a standard format.
 * Never synthesizes missing data (returns null).
 */

function normalizeSignal(signal) {
    if (!signal) return null;

    const sourceType = signal.source || null;
    const timestamp = signal.timestamp || Date.now();
    const freshness = Date.now() - timestamp;
    
    // Check if location exists
    let hasLocation = false;
    if (signal.location && signal.location.lat !== undefined && signal.location.lng !== undefined) {
        hasLocation = true;
    }

    // Prepare normalized payload based on original signal without synthesizing
    let normalizedPayload = null;
    let confidenceInputs = null;

    if (sourceType === 'citizen') {
        normalizedPayload = {
            description: signal.description || null,
            category: signal.category || null,
            // FIX: Flutter sends 'severity', not 'urgency' — map both so engine reads correctly
            urgency: signal.urgency || signal.severity || null,
            // FIX: Preserve Flutter crisisType (e.g. "Flood", "Medical Emergency") for classifier
            crisisType: signal.crisisType || null,
        };
        confidenceInputs = {
            hasPhoto: signal.photo !== undefined || signal.photoUrl !== undefined,
            hasExactGps: hasLocation
        };
    } else if (sourceType === 'weather') {
        normalizedPayload = {
            rainfall: signal.rainfall !== undefined ? signal.rainfall : null
        };
        confidenceInputs = { apiVerified: true };
    } else if (sourceType === 'traffic') {
        normalizedPayload = {
            congestion: signal.congestion !== undefined ? signal.congestion : null
        };
        confidenceInputs = { apiVerified: true };
    } else {
        // Fallback for unclassified sources
        normalizedPayload = { ...signal };
        delete normalizedPayload.source;
        delete normalizedPayload.timestamp;
        delete normalizedPayload.location;
        confidenceInputs = { unknownSource: true };
    }

    return {
        sourceType,
        normalizedPayload,
        timestamp,
        freshness,
        hasLocation,
        location: signal.location || null,
        confidenceInputs,
        // FIX: Preserve reporter identity so writeCrisis can store userId/userEmail on the crisis doc
        userId: signal.userId || null,
        userEmail: signal.userEmail || null
    };
}

function normalizeSignals(signals) {
    if (!Array.isArray(signals)) {
        return [normalizeSignal(signals)].filter(s => s !== null);
    }
    return signals.map(normalizeSignal).filter(s => s !== null);
}

module.exports = { normalizeSignal, normalizeSignals };
