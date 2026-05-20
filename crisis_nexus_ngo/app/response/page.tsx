"use client";

import React, { useEffect, useState } from "react";
import { AuthGuard } from "../../components/AuthGuard";
import { useAuth } from "../../components/AuthProvider";
import { useCrisisActions } from "../../hooks/useCrisisActions";
import { db } from "../../lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { CrisisData } from "../../components/CrisisCard";
import { SeverityBadge } from "../../components/SeverityBadge";
import { normalizeCrisis } from "../../lib/normalizeCrisis";
import { normalizeNGORecord } from "../../lib/normalizeNGORecord";
import { 
  Loader2, 
  Activity, 
  ShieldAlert, 
  CheckCircle2, 
  Send,
  AlertTriangle,
  Info,
  Clock,
  Compass,
  ArrowRight,
  Sparkles,
  TrendingUp,
  X,
  CheckCircle,
  Shield,
  Users,
  Building,
  HeartPulse,
  Truck,
  Eye,
  FileText
} from "lucide-react";

import { CoordinatorAlertPanel } from "../../components/CoordinatorAlertPanel";

export default function ResponsePage() {
  const { user, operatorProfile, authState } = useAuth();
  const { 
    approveCrisis,
    assignCrisis,
    escalateCrisis,
    resolveCrisis,
    logMedicalTriage,
    logLogisticsSupplies,
    logRescueDispatch
  } = useCrisisActions();

  const [crises, setCrises] = useState<CrisisData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"critical" | "high_impact" | "all">("critical");
  
  // Custom action inputs
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  // Input states per crisis
  const [medicalNotesMap, setMedicalNotesMap] = useState<Record<string, string>>({});
  const [suppliesDetailsMap, setSuppliesDetailsMap] = useState<Record<string, string>>({});
  const [rescueTeamMap, setRescueTeamMap] = useState<Record<string, string>>({});
  const [assignRoleMap, setAssignRoleMap] = useState<Record<string, string[]>>({});

  const userRole = operatorProfile?.role || "observer";

  useEffect(() => {
    if (authState !== "authenticated") return;

    const crisesRef = collection(db, "crises");
    const q = query(crisesRef, orderBy("time", "desc"));
    
    // Subscribe real-time
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeCrises: CrisisData[] = [];
      snapshot.forEach((doc) => {
        const normalized = normalizeCrisis({ crisisId: doc.id, ...doc.data() });
        activeCrises.push(normalized as CrisisData);
      });
      setCrises(activeCrises);
      setLoading(false);
    }, (error) => {
      console.error("Response Firestore sync error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [authState]);

  const getFilteredList = () => {
    if (activeTab === "critical") {
      return crises.filter((c) => {
        const sev = c.severityString?.toLowerCase() || (
          c.severity === 5 ? "critical" : (c.severity === 4 ? "high" : "")
        );
        return (sev === "critical" || sev === "high") && c.status !== "resolved";
      });
    } else if (activeTab === "high_impact") {
      return crises.filter((c) => (typeof c.impactScore === 'number' ? c.impactScore : 0) >= 70 && c.status !== "resolved");
    } else {
      return crises; // Show all including resolved
    }
  };

  const filteredCrises = getFilteredList();

  const getStatusStepIndex = (currentStatus?: string): number => {
    switch (currentStatus || "reported") {
      case "resolved": return 3;
      case "in_progress":
      case "mitigated": return 2;
      case "approved":
      case "triaged":
      case "assigned": return 1;
      case "reported":
      case "new":
      default: return 0;
    }
  };

  const formatLogTime = (timeInput?: any) => {
    if (!timeInput) return "Active Now";
    try {
      const date = timeInput.seconds 
        ? new Date(timeInput.seconds * 1000) 
        : new Date(timeInput);
      return date.toLocaleString();
    } catch {
      return "Active Now";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "coordinator": return "Disaster Response Coordinator";
      case "medical_team": return "Medical Dispatch Commander";
      case "logistics": return "Emergency Logistics Director";
      case "rescue": return "Rescue Squad Commander";
      case "observer": return "Regional Observer";
      default: return "Observer Profile";
    }
  };

  // State mutation actions wrappers
  const handleApprove = async (crisisId: string) => {
    try {
      setErrorMsg("");
      setSuccessMsg("");
      setIsSubmitting(true);
      await approveCrisis(crisisId, operatorProfile);
      setSuccessMsg("Incident successfully approved & moved to approved state.");
    } catch (err: any) {
      setErrorMsg(err.message || "Approval action rejected.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEscalate = async (crisisId: string, currentSeverity: number) => {
    try {
      setErrorMsg("");
      setSuccessMsg("");
      setIsSubmitting(true);
      await escalateCrisis(crisisId, currentSeverity, operatorProfile);
      setSuccessMsg("Incident threat severity successfully escalated.");
    } catch (err: any) {
      setErrorMsg(err.message || "Escalation action rejected.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async (crisisId: string) => {
    try {
      setErrorMsg("");
      setSuccessMsg("");
      setIsSubmitting(true);
      await resolveCrisis(crisisId, operatorProfile);
      setSuccessMsg("Incident successfully resolved & contained.");
    } catch (err: any) {
      setErrorMsg(err.message || "Resolution action rejected.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignRole = async (crisisId: string, currentCrisis: CrisisData) => {
    const rolesToAssign = assignRoleMap[crisisId];
    if (!rolesToAssign) {
      setErrorMsg("Please modify department assignments before submitting.");
      return;
    }
    try {
      setErrorMsg("");
      setSuccessMsg("");
      setIsSubmitting(true);
      await assignCrisis(
        crisisId, 
        rolesToAssign.join(","), // UID role identifier representation
        rolesToAssign.map(getRoleLabel).join(", "), // Display label
        rolesToAssign, // Array of Role identifiers
        operatorProfile
      );
      setSuccessMsg(`Incident ownership updated for departments.`);
    } catch (err: any) {
      setErrorMsg(err.message || "Role assignment rejected.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogMedical = async (crisisId: string) => {
    const notes = medicalNotesMap[crisisId];
    if (!notes || !notes.trim()) {
      setErrorMsg("Triage notes are mandatory before registering medical dispatch.");
      return;
    }
    try {
      setErrorMsg("");
      setSuccessMsg("");
      setIsSubmitting(true);
      await logMedicalTriage(crisisId, notes, operatorProfile);
      setSuccessMsg("Medical triage metrics recorded. Workflow progressed to in-progress.");
      setMedicalNotesMap(prev => ({ ...prev, [crisisId]: "" }));
    } catch (err: any) {
      setErrorMsg(err.message || "Medical dispatch entry rejected.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogLogistics = async (crisisId: string) => {
    const details = suppliesDetailsMap[crisisId];
    if (!details || !details.trim()) {
      setErrorMsg("Supply specifications are required to track relief packages.");
      return;
    }
    try {
      setErrorMsg("");
      setSuccessMsg("");
      setIsSubmitting(true);
      await logLogisticsSupplies(crisisId, details, operatorProfile);
      setSuccessMsg("Emergency supplies allocation registered successfully.");
      setSuppliesDetailsMap(prev => ({ ...prev, [crisisId]: "" }));
    } catch (err: any) {
      setErrorMsg(err.message || "Supply entry rejected.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogRescue = async (crisisId: string) => {
    const team = rescueTeamMap[crisisId];
    if (!team || !team.trim()) {
      setErrorMsg("Tactical deployment requires assigning a squad team name.");
      return;
    }
    try {
      setErrorMsg("");
      setSuccessMsg("");
      setIsSubmitting(true);
      await logRescueDispatch(crisisId, team, operatorProfile);
      setSuccessMsg("Rescue squad dispatched. Workflow progressed to in-progress.");
      setRescueTeamMap(prev => ({ ...prev, [crisisId]: "" }));
    } catch (err: any) {
      setErrorMsg(err.message || "Rescue team dispatch rejected.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthGuard>
      <div className="space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-zinc-900 space-y-3 md:space-y-0">
          <div>
            <h1 className="text-2xl font-black text-slate-100 uppercase tracking-wider">NGO Response Dispatch Control Center</h1>
            <p className="text-xs text-zinc-500 font-semibold tracking-wider uppercase mt-1">Real-time state machine workflow & role audit logs</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Active Account:</span>
            <span className={`text-[10px] px-2.5 py-1 rounded-full border font-black uppercase tracking-wider ${
              userRole === "logistics" ? "bg-cyan-950/40 text-cyan-400 border-cyan-900/60" :
              userRole === "medical_team" ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/60" :
              userRole === "rescue" ? "bg-blue-950/40 text-blue-400 border-blue-900/60" :
              userRole === "coordinator" ? "bg-red-950/40 text-red-400 border-red-900/60" :
              "bg-zinc-900 text-zinc-400 border-zinc-800"
            }`}>
              {getRoleLabel(userRole)} — [NGO: {operatorProfile?.ngoId || "GLOBAL"}]
            </span>
          </div>
        </div>

        {/* Global Alert Broadcast System */}
        <CoordinatorAlertPanel />

        {/* Success/Error Alerts */}
        {errorMsg && (
          <div className="p-4 bg-red-950/20 border border-red-900 text-red-400 text-xs rounded-xl flex items-start space-x-2.5 animate-pulse">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div className="space-y-1">
              <span className="font-black block uppercase tracking-wider text-[10px]">TRANSACTION TRANSITION REJECTED</span>
              <p className="font-medium text-zinc-400">{errorMsg}</p>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-950/20 border border-emerald-900 text-emerald-400 text-xs rounded-xl flex items-start space-x-2.5">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <div className="space-y-1">
              <span className="font-black block uppercase tracking-wider text-[10px]">TRANSACTION COMPLETED SUCCESSFULLY</span>
              <p className="font-medium text-zinc-400">{successMsg}</p>
            </div>
          </div>
        )}

        {/* Filters Tabs Panel */}
        <div className="flex space-x-3 border-b border-zinc-900 pb-3">
          <button
            onClick={() => setActiveTab("critical")}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border rounded-xl transition-all cursor-pointer ${
              activeTab === "critical"
                ? "bg-red-950/20 border-red-900/60 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.08)]"
                : "border-transparent text-zinc-500 hover:text-zinc-350"
            }`}
          >
            Emergency Priority Queue
          </button>
          <button
            onClick={() => setActiveTab("high_impact")}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border rounded-xl transition-all cursor-pointer ${
              activeTab === "high_impact"
                ? "bg-purple-950/20 border-purple-900/60 text-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.08)]"
                : "border-transparent text-zinc-500 hover:text-zinc-350"
            }`}
          >
            High Impact Queue (Impact &ge; 70)
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border rounded-xl transition-all cursor-pointer ${
              activeTab === "all"
                ? "bg-zinc-900/30 border-zinc-700/60 text-zinc-200 shadow-[0_0_20px_rgba(255,255,255,0.02)]"
                : "border-transparent text-zinc-500 hover:text-zinc-350"
            }`}
          >
            All Logs Registry (Including Resolved)
          </button>
        </div>

        {/* Dispatch Grid List */}
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Compiling Operational Dispatch Queue...</span>
          </div>
        ) : filteredCrises.length === 0 ? (
          <div className="backdrop-blur-md bg-zinc-900/10 border border-zinc-900 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-zinc-900/60 border border-emerald-900 rounded-full text-emerald-500">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-300">Operational Sectors Standby</h3>
              <p className="text-xs text-zinc-550 max-w-sm mx-auto"></p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {filteredCrises.map((crisis) => {
              const status = crisis.status || "reported";
              const rawSev = crisis.severity;
              const sevStr = typeof rawSev === "string" ? rawSev : (crisis.severityString || (rawSev === 5 ? "Critical" : (rawSev === 4 ? "High" : "Medium")));
              const pop = typeof crisis.affectedPopulation === 'number' ? crisis.affectedPopulation : null;
              const currentStep = getStatusStepIndex(status);

              const isReported = status === "reported" || status === "new";
              const isApproved = status === "approved" || status === "triaged" || status === "assigned";
              const isInProgress = status === "in_progress" || status === "mitigated";
              const isResolved = status === "resolved";

              const showLogs = !!expandedLogs[crisis.crisisId];

              // Check permissions
              const isAssignedToMe = crisis.assignedRole === userRole;

              return (
                <div 
                  key={crisis.crisisId}
                  className={`backdrop-blur-md bg-zinc-950 border rounded-2xl p-6 space-y-5 transition-all duration-300 ${
                    isResolved 
                      ? "border-emerald-950 bg-emerald-950/5 opacity-70" 
                      : (isInProgress ? "border-blue-900/40 shadow-[0_0_20px_rgba(59,130,246,0.03)]" : "border-zinc-900 hover:border-zinc-800")
                  }`}
                >
                  {/* Title & Stats Ribbon */}
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-zinc-900/80 pb-4">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          isResolved ? "bg-emerald-500" :
                          isInProgress ? "bg-blue-500 animate-pulse" :
                          isApproved ? "bg-cyan-400" : "bg-red-500 animate-ping"
                        }`} />
                        <h3 className="text-sm font-black text-slate-100 uppercase tracking-wide">
                          {crisis.title || crisis.subType || crisis.eventType}
                        </h3>
                        <SeverityBadge severity={sevStr} />
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                          isResolved ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/50" :
                          isInProgress ? "bg-blue-950/40 text-blue-400 border-blue-900/50" :
                          isApproved ? "bg-cyan-950/40 text-cyan-400 border-cyan-900/50" :
                          "bg-red-950/40 text-red-400 border-red-900/50"
                        }`}>
                          {status}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-550 font-mono">
                        Incident Operational Reference Code: {crisis.crisisId}
                      </p>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="flex items-center space-x-6 text-xs text-zinc-400 font-semibold">
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        {typeof crisis.radiusKm === 'number' ? <span>Radius: <strong className="text-zinc-200">{`${crisis.radiusKm.toFixed(1)} km`}</strong></span> : <span />}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <Compass className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Coords: <strong className="text-zinc-200">{crisis.location?.lat?.toFixed(4)}, {crisis.location?.lng?.toFixed(4)}</strong></span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <Users className="w-3.5 h-3.5 text-zinc-500" />
                        {pop !== null ? <span>Scale: <strong className="text-zinc-200">{`${pop.toLocaleString()} citizens`}</strong></span> : <span />}
                      </div>
                    </div>
                  </div>

                  {/* Progressive Horizontal Step-Progress Tracker */}
                  <div className="bg-zinc-900/10 border border-zinc-900 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between relative px-2 py-1">
                      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-zinc-800 z-0"></div>
                      
                      {["reported", "approved", "in_progress", "resolved"].map((step, idx) => {
                        const isCompleted = idx < currentStep;
                        const isCurrent = idx === currentStep;
                        return (
                          <div key={step} className="flex flex-col items-center relative z-10">
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all duration-300 ${
                              isCompleted ? "bg-blue-500 border-blue-400" :
                              isCurrent ? "bg-amber-500 border-amber-400 ring-4 ring-amber-950/40 animate-pulse" :
                              "bg-zinc-950 border-zinc-850"
                            }`}>
                              {isCompleted && <CheckCircle className="w-2.5 h-2.5 text-zinc-950 font-bold" />}
                            </div>
                            <span className={`text-[8px] font-bold mt-1 tracking-tight capitalize ${
                              isCurrent ? "text-amber-400" : isCompleted ? "text-blue-400" : "text-zinc-550"
                            }`}>{step}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Body Content Context */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    <div className="lg:col-span-7 space-y-4">
                      {/* AI Orchestrator summary */}
                      <div className="p-4 bg-zinc-900/10 border border-zinc-900 rounded-xl text-xs text-zinc-400 leading-relaxed font-medium">
                        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block mb-1">AI Orchestrator context summary</span>
                        {(() => {
                          const normalized = normalizeNGORecord(crisis as any, "crisis");
                          if (normalized.isSynthetic && !normalized.hasCitizenSignals) return "";
                          return normalized.displayDescription || normalized.description || "";
                        })()}
                        
                        {(crisis.assignedRole || (crisis.assignedRoles && crisis.assignedRoles.length > 0)) && (
                          <div className="mt-3 pt-3 border-t border-zinc-900/80 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                            <span className="text-zinc-550 font-bold">Assigned Department Focus:</span>
                            <span className="text-purple-400 font-black uppercase tracking-wider text-right">
                              {crisis.assignedRoles && crisis.assignedRoles.length > 0
                                ? crisis.assignedRoles.map((r: string) => getRoleLabel(r)).join(", ")
                                : getRoleLabel(crisis.assignedRole || "")}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Allocated parameters logs */}
                      {(crisis.medicalNotes || crisis.suppliesDetails || crisis.assignedTeam) && (
                        <div className="p-4 bg-zinc-900/20 border border-zinc-900 rounded-xl text-xs space-y-3">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Operational Parameters Allocated</span>
                          {crisis.medicalNotes && (
                            <div>
                              <span className="text-[9px] text-zinc-500 font-bold uppercase block">Medical Triage:</span>
                              <p className="text-slate-300 italic font-semibold">{crisis.medicalNotes}</p>
                            </div>
                          )}
                          {crisis.suppliesDetails && (
                            <div>
                              <span className="text-[9px] text-zinc-500 font-bold uppercase block">Supplies Dispatched:</span>
                              <p className="text-slate-300 italic font-semibold">{crisis.suppliesDetails}</p>
                            </div>
                          )}
                          {crisis.assignedTeam && (
                            <div>
                              <span className="text-[9px] text-zinc-500 font-bold uppercase block">Rescue Squad Team:</span>
                              <p className="text-slate-300 italic font-semibold">{crisis.assignedTeam}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Operational Context Actions (State Machine Boundaries enforced here!) */}
                    <div className="lg:col-span-5 p-4 bg-zinc-900/10 border border-zinc-900 rounded-xl space-y-4">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Command Execution Portal</span>
                      </span>
                      
                      {/* Coordinator Actions */}
                      {userRole === "coordinator" && (
                        <div className="space-y-3">
                          {isReported && (
                            <button
                              disabled={isSubmitting}
                              onClick={() => handleApprove(crisis.crisisId)}
                              className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>Approve Incident Coordinates</span>
                            </button>
                          )}

                          {/* Assign to Department Form */}
                          {(isApproved || isInProgress) && (
                            <div className="space-y-2 pt-1">
                              <span className="text-[9px] text-zinc-550 font-bold uppercase block">Assign Department Dispatch</span>
                              <div className="flex flex-col gap-2 p-3 bg-zinc-950 border border-zinc-850 rounded-lg">
                                {["medical_team", "logistics", "rescue"].map((roleOption) => {
                                  // Determine current selected state based on local map, fallback to crisis data
                                  const currentRoles = assignRoleMap[crisis.crisisId] !== undefined 
                                    ? assignRoleMap[crisis.crisisId] 
                                    : (crisis.assignedRoles || (crisis.assignedRole ? [crisis.assignedRole] : []));
                                  const isSelected = currentRoles.includes(roleOption);
                                  
                                  return (
                                    <label key={roleOption} className="flex items-center space-x-2 cursor-pointer group">
                                      <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${isSelected ? 'bg-purple-600 border-purple-500' : 'bg-zinc-900 border-zinc-700 group-hover:border-zinc-500'}`}>
                                        {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                                      </div>
                                      <input 
                                        type="checkbox" 
                                        className="hidden"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          setAssignRoleMap(prev => {
                                            const mapRoles = prev[crisis.crisisId] !== undefined ? prev[crisis.crisisId] : (crisis.assignedRoles || (crisis.assignedRole ? [crisis.assignedRole] : []));
                                            if (checked) {
                                              return { ...prev, [crisis.crisisId]: [...mapRoles, roleOption] };
                                            } else {
                                              return { ...prev, [crisis.crisisId]: mapRoles.filter((r: string) => r !== roleOption) };
                                            }
                                          });
                                        }}
                                      />
                                      <span className="text-xs font-semibold text-slate-300 group-hover:text-slate-100 transition-colors">
                                        {roleOption === "medical_team" ? "Medical Team Dispatch" : roleOption === "logistics" ? "Logistics Supplies" : "Rescue Squad Fleet"}
                                      </span>
                                    </label>
                                  );
                                })}
                                
                                <button
                                  disabled={isSubmitting || assignRoleMap[crisis.crisisId] === undefined}
                                  onClick={() => handleAssignRole(crisis.crisisId, crisis)}
                                  className="mt-2 w-full py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-slate-100 rounded text-xs font-bold uppercase transition-colors"
                                >
                                  Update Assignment
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Escalation Button */}
                          {!isResolved && (
                            <button
                              disabled={isSubmitting}
                              onClick={() => handleEscalate(crisis.crisisId, typeof crisis.severity === 'number' ? crisis.severity : 2)}
                              className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 hover:border-red-900 text-red-400 disabled:opacity-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                            >
                              <AlertTriangle className="w-4 h-4 animate-pulse" />
                              <span>Escalate Incident Severity</span>
                            </button>
                          )}

                          {/* Resolution Button */}
                          {isInProgress && (
                            <button
                              disabled={isSubmitting}
                              onClick={() => handleResolve(crisis.crisisId)}
                              className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Authorize Resolution Certificate</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Medical Team Actions */}
                      {userRole === "medical_team" && (
                        <div className="space-y-3">
                          {isResolved ? (
                            <div className="text-zinc-550 text-center text-xs py-2">Standard Operations Resolved.</div>
                          ) : (
                            <div className="space-y-2">
                              <span className="text-[9px] text-zinc-500 font-bold uppercase block">Register Medical Triage Details</span>
                              <textarea
                                placeholder="Type casualty statistics, emergency first-aid deployed, clinic capacity updates..."
                                value={medicalNotesMap[crisis.crisisId] || ""}
                                onChange={(e) => setMedicalNotesMap(prev => ({ ...prev, [crisis.crisisId]: e.target.value }))}
                                rows={2}
                                className="w-full p-2 bg-zinc-950 border border-zinc-850 rounded-lg text-xs font-medium text-slate-200 focus:outline-none placeholder-zinc-650"
                              />
                              <button
                                disabled={isSubmitting || !medicalNotesMap[crisis.crisisId]?.trim()}
                                onClick={() => handleLogMedical(crisis.crisisId)}
                                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-slate-100 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
                              >
                                <HeartPulse className="w-3.5 h-3.5" />
                                <span>Record Medical Triage</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Logistics Actions */}
                      {userRole === "logistics" && (
                        <div className="space-y-3">
                          {isResolved ? (
                            <div className="text-zinc-550 text-center text-xs py-2">Logistics Provisioning Complete.</div>
                          ) : (
                            <div className="space-y-2">
                              <span className="text-[9px] text-zinc-500 font-bold uppercase block">Allocate Emergency Supplies</span>
                              <textarea
                                placeholder="Type food packages count, blankets distributed, clean water containers..."
                                value={suppliesDetailsMap[crisis.crisisId] || ""}
                                onChange={(e) => setSuppliesDetailsMap(prev => ({ ...prev, [crisis.crisisId]: e.target.value }))}
                                rows={2}
                                className="w-full p-2 bg-zinc-950 border border-zinc-850 rounded-lg text-xs font-medium text-slate-200 focus:outline-none placeholder-zinc-650"
                              />
                              <button
                                disabled={isSubmitting || !suppliesDetailsMap[crisis.crisisId]?.trim()}
                                onClick={() => handleLogLogistics(crisis.crisisId)}
                                className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 text-slate-100 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>Dispatch Logistics Supplies</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Rescue Actions */}
                      {userRole === "rescue" && (
                        <div className="space-y-3">
                          {isResolved ? (
                            <div className="text-zinc-550 text-center text-xs py-2">Rescue Operations Terminated.</div>
                          ) : (
                            <div className="space-y-2">
                              <span className="text-[9px] text-zinc-500 font-bold uppercase block">Deploy Rescue Squadron</span>
                              <input
                                type="text"
                                placeholder="Rescue 1122 Squad A, Edhi Ambulance Squad 5..."
                                value={rescueTeamMap[crisis.crisisId] || ""}
                                onChange={(e) => setRescueTeamMap(prev => ({ ...prev, [crisis.crisisId]: e.target.value }))}
                                className="w-full p-2 bg-zinc-950 border border-zinc-850 rounded-lg text-xs font-medium text-slate-200 focus:outline-none placeholder-zinc-650"
                              />
                              <button
                                disabled={isSubmitting || !rescueTeamMap[crisis.crisisId]?.trim()}
                                onClick={() => handleLogRescue(crisis.crisisId)}
                                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-slate-100 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Confirm Rescue Mission</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Observer View */}
                      {userRole === "observer" && (
                        <div className="text-center py-2.5 text-zinc-550 text-xs font-medium">
                          <Eye className="w-4 h-4 mx-auto text-zinc-600 mb-1" />
                          <span>Regional Observer Mode Activated.<br />Read-Only Registry access.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Audit Log Expansion Toggle */}
                  {crisis.history && crisis.history.length > 0 && (
                    <div className="border-t border-zinc-900/60 pt-4">
                      <button
                        onClick={() => setExpandedLogs(prev => ({ ...prev, [crisis.crisisId]: !prev[crisis.crisisId] }))}
                        className="text-[9px] font-black text-zinc-500 hover:text-zinc-350 uppercase tracking-widest flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Activity className="w-3.5 h-3.5 text-blue-500" />
                        <span>{showLogs ? "Hide Dispatch Registry Trace" : `View Dispatch Registry Trace (${crisis.history.length})`}</span>
                      </button>

                      {showLogs && (
                        <div className="mt-4 p-4 bg-zinc-950 border border-zinc-900 rounded-xl space-y-4 max-h-48 overflow-y-auto animate-slideDown">
                          {crisis.history.slice().reverse().map((log, lIdx) => (
                            <div key={lIdx} className="flex items-start space-x-3 border-l-2 border-zinc-800 pl-3 py-0.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-500/20 border border-blue-400/40 -ml-[18px] mt-1 z-10 flex-shrink-0 flex items-center justify-center">
                                <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-black text-slate-200">{log.byName}</span>
                                  <span className="text-[10px] text-zinc-550 font-mono">{formatLogTime(log.timestamp)}</span>
                                </div>
                                <span className="text-[9px] text-blue-400/80 font-black tracking-wider uppercase block mt-0.5">{log.action}</span>
                                <p className="text-xs text-zinc-400 mt-1 leading-normal font-medium">{log.notes}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

      </div>
    </AuthGuard>
  );
}
