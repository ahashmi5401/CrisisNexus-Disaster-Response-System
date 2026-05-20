import { db, auth } from "../lib/firebase";
import { doc, runTransaction, arrayUnion } from "firebase/firestore";

export interface HistoryItem {
  action: string;
  by: string;
  byName: string;
  timestamp: string;
  notes: string;
}

type OperatorProfileLike = {
  role?: "coordinator" | "medical_team" | "logistics" | "rescue" | "observer";
  displayName?: string;
} | null | undefined;

export const useCrisisActions = () => {

  const normalizeSeverity = (s: string): string => {
    const upper = (s || "MEDIUM").toString().toUpperCase().trim();
    if (upper === "UNKNOWN" || upper === "NEEDS_VERIFICATION") return "NEEDS_VERIFICATION";
    return ["LOW", "MEDIUM", "HIGH", "CRITICAL", "NEEDS_VERIFICATION"].includes(upper) ? upper : "LOW";
  };

  const verifySession = () => {
    if (!auth.currentUser) {
      throw new Error("Authentication Perimeter Violated: Logged session required.");
    }
    return auth.currentUser;
  };

  const logHistoryAction = async (
    crisisId: string,
    actionType: string,
    nextStatus: "new" | "triaged" | "assigned" | "in_progress" | "mitigated" | "resolved" | "reported" | "approved" | null,
    operatorProfile: OperatorProfileLike,
    additionalFields: Record<string, unknown> = {},
    notes: string = ""
  ) => {
    const user = verifySession();
    const crisisRef = doc(db, "crises", crisisId);

    const historyItem: HistoryItem = {
      action: actionType,
      by: user.uid,
      byName: operatorProfile?.displayName || "NGO Operator",
      timestamp: new Date().toISOString(),
      notes: notes
    };

    const updatePayload: Record<string, unknown> = {
      history: arrayUnion(historyItem),
      ...additionalFields
    };

    if (nextStatus) {
      updatePayload.status = nextStatus;
    }

    // CrisisNexus Truth Rule: No synthetic, estimated, or fallback data is allowed.
    await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(crisisRef);
      if (!sfDoc.exists()) throw new Error("Document does not exist!");
      
      const currentData = sfDoc.data();
      if (nextStatus && currentData.status && nextStatus !== currentData.status && currentData.status === "resolved") {
        throw new Error("State transition invalid: Crisis was already resolved by another operator.");
      }

      transaction.update(crisisRef, updatePayload);
    });
  };

  // 1. Coordinator: Approve/Triage crisis
  const approveCrisis = async (crisisId: string, operatorProfile: OperatorProfileLike) => {
    if (operatorProfile?.role !== "coordinator") {
      throw new Error("Access Blocked: Coordinator privileges required.");
    }
    await logHistoryAction(
      crisisId,
      "TRIAGED",
      "triaged",
      operatorProfile,
      {},
      "Incident status successfully triaged by Regional Coordinator."
    );
  };

  // 2. Coordinator: Assign operator (any user)
  const assignCrisis = async (
    crisisId: string,
    assignedToUid: string,
    assignedToName: string,
    assignedToRoles: string | string[],
    operatorProfile: OperatorProfileLike
  ) => {
    if (operatorProfile?.role !== "coordinator") {
      throw new Error("Access Blocked: Coordinator privileges required.");
    }
    
    const rolesArray = Array.isArray(assignedToRoles) ? assignedToRoles : [assignedToRoles];
    const primaryRole = rolesArray.length > 0 ? rolesArray[0] : "";

    await logHistoryAction(
      crisisId,
      "ASSIGNED",
      "assigned",
      operatorProfile,
      {
        assignedTo: assignedToUid,
        assignedRole: primaryRole,
        assignedRoles: rolesArray
      },
      `Incident field ownership updated to departments: ${rolesArray.join(", ")}.`
    );
  };

  // 3. Coordinator: Escalate crisis severity
  const escalateCrisis = async (crisisId: string, currentSeverity: number, operatorProfile: OperatorProfileLike) => {
    if (operatorProfile?.role !== "coordinator") {
      throw new Error("Access Blocked: Coordinator privileges required.");
    }
    const nextSeverity = Math.min(5, currentSeverity + 1);

    let severityString = "CRITICAL";
    if (nextSeverity === 4) severityString = "HIGH";
    if (nextSeverity === 3) severityString = "MEDIUM";
    if (nextSeverity === 2) severityString = "LOW";

    await logHistoryAction(
      crisisId,
      "ESCALATED",
      null,
      operatorProfile,
      {
        severity: normalizeSeverity(severityString),
        severityString: normalizeSeverity(severityString)
      },
      `Severity level escalated to ${severityString} under Coordinator authority.`
    );
  };

  // 4. Coordinator: Resolve crisis
  const resolveCrisis = async (crisisId: string, operatorProfile: OperatorProfileLike) => {
    if (operatorProfile?.role !== "coordinator") {
      throw new Error("Access Blocked: Coordinator privileges required.");
    }
    await logHistoryAction(
      crisisId,
      "RESOLVED",
      "resolved",
      operatorProfile,
      {},
      "Incident coordinates contained. Resolution certificate authorized by Coordinator."
    );
  };

  // 5. Medical Team: Mark medical response & log triage notes
  const logMedicalTriage = async (crisisId: string, medicalNotes: string, operatorProfile: OperatorProfileLike) => {
    if (operatorProfile?.role !== "medical_team") {
      throw new Error("Access Blocked: Medical Team credentials required.");
    }
    if (!medicalNotes.trim()) {
      throw new Error("Input Required: Medical triage details cannot be empty.");
    }
    await logHistoryAction(
      crisisId,
      "MEDICAL_TRIAGED",
      "in_progress",
      operatorProfile,
      {
        medicalNotes: medicalNotes.trim()
      },
      `Medical Triage registered: ${medicalNotes.trim()}`
    );
  };

  // 6. Logistics: Assign supplies
  const logLogisticsSupplies = async (crisisId: string, suppliesDetails: string, operatorProfile: OperatorProfileLike) => {
    if (operatorProfile?.role !== "logistics") {
      throw new Error("Access Blocked: Logistics Department credentials required.");
    }
    if (!suppliesDetails.trim()) {
      throw new Error("Input Required: Supply allocation specifications cannot be empty.");
    }
    await logHistoryAction(
      crisisId,
      "SUPPLIES_ALLOCATED",
      null,
      operatorProfile,
      {
        suppliesDetails: suppliesDetails.trim()
      },
      `Emergency relief packages dispatched: ${suppliesDetails.trim()}`
    );
  };

  // 7. Rescue: Dispatch response & assign team
  const logRescueDispatch = async (crisisId: string, assignedTeam: string, operatorProfile: OperatorProfileLike) => {
    if (operatorProfile?.role !== "rescue") {
      throw new Error("Access Blocked: Rescue Squad privileges required.");
    }
    if (!assignedTeam.trim()) {
      throw new Error("Input Required: Tactical deployment requires an assigned team name.");
    }
    await logHistoryAction(
      crisisId,
      "DISPATCHED",
      "in_progress",
      operatorProfile,
      {
        assignedTeam: assignedTeam.trim()
      },
      `Rescue team deployed: [${assignedTeam.trim()}] dispatched to incident coordinates.`
    );
  };

  return {
    approveCrisis,
    assignCrisis,
    escalateCrisis,
    resolveCrisis,
    logMedicalTriage,
    logLogisticsSupplies,
    logRescueDispatch
  };
};
