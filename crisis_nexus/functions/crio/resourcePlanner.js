/**
 * resourcePlanner.js
 * Allocates resources based on severity, bypassing if none available.
 */

const admin = require('firebase-admin');

async function planResources(severityResult) {
    if (severityResult.severity === "UNKNOWN") {
        return [];
    }

    try {
        const db = admin.firestore();
        const resourcesRef = db.collection('resources');
        const snapshot = await resourcesRef.get();

        if (snapshot.empty) {
            // Never fabricate available units
            return [];
        }

        const allocation = [];
        snapshot.forEach(doc => {
            const resource = doc.data();
            // Basic allocation logic
            if (severityResult.severity === 'HIGH' || severityResult.severity === 'CRITICAL') {
                allocation.push({
                    resource: doc.id,
                    assignedTo: "pending_crisis_id", // to be replaced with real ID
                    eta: 9 // simplistic ETA
                });
            }
        });

        return allocation;
    } catch (error) {
        console.error("Resource planning error:", error);
        return [];
    }
}

module.exports = { planResources };
