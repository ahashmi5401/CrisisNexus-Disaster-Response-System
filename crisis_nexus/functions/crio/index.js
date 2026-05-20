/**
 * index.js
 * CRIO v2 Core Module Exports
 */

const { normalizeSignal, normalizeSignals } = require('./signalNormalizer');
const { scoreCredibility } = require('./credibilityEngine');
const { fuseSignals } = require('./fusionEngine');
const { classify } = require('./classifier');
const { computeSeverity } = require('./severityEngine');
const { planResources } = require('./resourcePlanner');
const { checkDegradedMode } = require('./degradedMode');
const { resolveHybridSeverity } = require('./hybridSeverityResolver');

module.exports = {
    normalizeSignal,
    normalizeSignals,
    scoreCredibility,
    fuseSignals,
    classify,
    computeSeverity,
    planResources,
    checkDegradedMode,
    resolveHybridSeverity,
};
