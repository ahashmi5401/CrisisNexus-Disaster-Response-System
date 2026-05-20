const path = require('path');
const assert = require('assert');

// 1. Mock firebase-admin BEFORE importing resourcePlanner or other crio modules
const mockResources = [];
const mockAdmin = {
    firestore: () => ({
        collection: (name) => {
            if (name === 'resources') {
                return {
                    get: async () => {
                        return {
                            empty: mockResources.length === 0,
                            forEach: (cb) => {
                                mockResources.forEach(cb);
                            }
                        };
                    }
                };
            }
            throw new Error(`Unmocked collection: ${name}`);
        }
    })
};

// Require cache injection for firebase-admin
require.cache[require.resolve('firebase-admin')] = {
    id: 'firebase-admin',
    filename: 'firebase-admin',
    loaded: true,
    exports: mockAdmin
};

const crio = require('./crio');

async function testScenarioA() {
    console.log('\n--- Running Scenario A: Flood Fusion ---');
    console.log('Ingesting citizen signal with high rainfall and traffic creates a fused flood event.');
    
    // We need 3 aligned signals to trigger FUSED status in fusionEngine.
    const signal1 = crio.normalizeSignal({
        source: 'citizen',
        description: 'Heavy flood on main street, water rising',
        timestamp: Date.now() - 1000,
        location: { lat: 24.86, lng: 67.00 }
    });
    
    const signal2 = crio.normalizeSignal({
        source: 'weather',
        rainfall: 60, // > 50 triggers flood
        timestamp: Date.now() - 2000,
        location: { lat: 24.86, lng: 67.00 }
    });

    const signal3 = crio.normalizeSignal({
        source: 'traffic',
        congestion: 80,
        timestamp: Date.now() - 3000,
        location: { lat: 24.86, lng: 67.00 }
    });

    const signals = [signal1, signal2, signal3];
    console.log('Signals normalized:', signals.length);

    const credibilityResult = crio.scoreCredibility(signals);
    console.log('Credibility Result:', JSON.stringify(credibilityResult, null, 2));

    const fusionResult = crio.fuseSignals(signals, credibilityResult);
    console.log('Fusion Result Status:', fusionResult.status);
    assert.strictEqual(fusionResult.status, 'FUSED', 'Expected status to be FUSED with 3 aligned signals');

    const classification = crio.classify(fusionResult);
    console.log('Classification:', classification);
    assert.strictEqual(classification, 'flood', 'Expected classification to be flood');

    const severityResult = crio.computeSeverity(fusionResult);
    console.log('Severity Result:', JSON.stringify(severityResult, null, 2));
    assert.strictEqual(severityResult.severity, 'HIGH', 'Expected severity to be HIGH for 3 signals');

    const degradedResult = crio.checkDegradedMode(fusionResult, credibilityResult);
    console.log('Degraded Mode Check:', degradedResult);
    assert.strictEqual(degradedResult, null, 'Expected degraded mode to be null for aligned signals');
}

async function testScenarioB() {
    console.log('\n--- Running Scenario B: Conflicting Signals (Degraded Mode) ---');
    console.log('Ingesting conflicting signals triggers degraded mode.');

    const signal1 = crio.normalizeSignal({
        source: 'citizen',
        description: 'Major flooding here',
        timestamp: Date.now() - 1000,
        location: { lat: 24.86, lng: 67.00 }
    });

    const signal2 = crio.normalizeSignal({
        source: 'weather',
        rainfall: 2, // Dry weather (< 5) + Citizen flood = CONTRADICTION
        timestamp: Date.now() - 2000,
        location: { lat: 24.86, lng: 67.00 }
    });

    const signals = [signal1, signal2];
    const credibilityResult = crio.scoreCredibility(signals);
    console.log('Credibility Result (Contradiction Level):', credibilityResult.contradictionLevel);
    assert.strictEqual(credibilityResult.contradictionLevel, 'HIGH', 'Expected high contradiction');

    const fusionResult = crio.fuseSignals(signals, credibilityResult);
    console.log('Fusion Result Status:', fusionResult.status);
    assert.strictEqual(fusionResult.status, 'CONFLICTING', 'Expected conflicting status');

    const degradedResult = crio.checkDegradedMode(fusionResult, credibilityResult);
    console.log('Degraded Mode Result:', JSON.stringify(degradedResult, null, 2));
    assert.ok(degradedResult && degradedResult.mode === 'DEGRADED', 'Expected degraded mode to be active');
    assert.strictEqual(degradedResult.escalation, 'MANUAL_REVIEW', 'Expected escalation to be MANUAL_REVIEW');
}

async function testScenarioC() {
    console.log('\n--- Running Scenario C: Resource Allocation ---');
    console.log('Resource planning assigns available units based on severity without fabrication.');

    // Sub-case 1: No resources available
    mockResources.length = 0; // Empty resources list
    let planned = await crio.planResources({ severity: 'HIGH' });
    console.log('Planned resources when none available:', planned);
    assert.deepStrictEqual(planned, [], 'Expected empty list when no resources are available in the DB');

    // Sub-case 2: Resources exist
    mockResources.push(
        { id: 'ambulance_01', data: () => ({ type: 'medical', available: true }) },
        { id: 'rescue_boat_01', data: () => ({ type: 'rescue', available: true }) }
    );
    planned = await crio.planResources({ severity: 'HIGH' });
    console.log('Planned resources with active assets:', planned);
    assert.strictEqual(planned.length, 2, 'Expected 2 resource allocations');
    assert.strictEqual(planned[0].resource, 'ambulance_01');
    assert.strictEqual(planned[1].resource, 'rescue_boat_01');
}

async function testScenarioD() {
    console.log('\n--- Running Scenario D: Provisional Crisis (Single Citizen Signal) ---');
    console.log('Ingesting a single citizen flood report triggers a provisional crisis with WEAK_CONFIRMATION.');

    const signal1 = crio.normalizeSignal({
        source: 'citizen',
        description: 'Large flood on road outside',
        timestamp: Date.now() - 1000,
        location: { lat: 24.86, lng: 67.00 }
    });

    const signals = [signal1];
    const credibilityResult = crio.scoreCredibility(signals);
    const fusionResult = crio.fuseSignals(signals, credibilityResult);
    console.log('Fusion Result Status:', fusionResult.status);
    console.log('Fusion Status Field:', fusionResult.fusionStatus);
    assert.strictEqual(fusionResult.status, 'WEAK_CONFIRMATION', 'Expected status to be WEAK_CONFIRMATION');
    assert.strictEqual(fusionResult.fusionStatus, 'WEAK_CONFIRMATION', 'Expected fusionStatus to be WEAK_CONFIRMATION');

    const classification = crio.classify(fusionResult);
    console.log('Classification:', classification);
    assert.strictEqual(classification, 'flood', 'Expected classification to be flood');

    const severityResult = crio.computeSeverity(fusionResult);
    console.log('Severity Result:', JSON.stringify(severityResult, null, 2));
    assert.strictEqual(severityResult.severity, 'MEDIUM', 'Expected severity to be at least MEDIUM');
}

async function main() {
    try {
        await testScenarioA();
        await testScenarioB();
        await testScenarioC();
        await testScenarioD();
        console.log('\n=========================================');
        console.log('✅ ALL SCENARIO VALIDATION TESTS PASSED SUCCESSFULLY!');
        console.log('=========================================');
    } catch (e) {
        console.error('❌ VALIDATION TEST FAILED:', e);
        process.exit(1);
    }
}

main();
