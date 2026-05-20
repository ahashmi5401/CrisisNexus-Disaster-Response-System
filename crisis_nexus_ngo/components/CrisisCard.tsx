import React, { useState, useEffect } from "react";
import { SeverityBadge } from "./SeverityBadge";
import { useAuth } from "./AuthProvider";
import { useCrisisActions, HistoryItem } from "../hooks/useCrisisActions";
import { DataQualityLayer, calculateDataIntegrity } from "./DataQualityLayer";
import { normalizeDisplayCrisis, computeRealityBadge, getRealityBadgeStyle, normalizeWorkflowStatus, type RealityBadge } from "../lib/displayUtils";
import { normalizeNGORecord } from "../lib/normalizeNGORecord";
import { resolveCrisis as resolveCrisisRecord } from "../lib/safeCrisisResolver";
import { isSyntheticText } from "../lib/safeCrisisResolver";
import { 
  Users, Compass, Calendar, CheckCircle2, Sparkles, Send, MapPin, Brain, HeartPulse, Truck, Clock, ShieldAlert, ChevronRight, Activity, CornerDownRight, AlertTriangle, ChevronDown, Eye
} from "lucide-react";
import { db } from "../lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

export interface CrisisData {
  crisisId: string;
  ciroIntelligenceId?: string;  // canonical link to /crisis_intelligence doc
  eventType: string;
  subType: string;
  severity: number | string;
  severityString?: string;
  confidence?: number;
  confidenceScore?: number;
  confidenceRange?: [number, number] | number[];
  contradictionLevel?: string;
  supportingSignals?: any[];
  impactScore?: number;
  location?: { lat: number; lng: number; name?: string };
  affectedPopulation?: number;
  time?: any;
  updatedAt?: any;
  keyFactors?: string[];
  aiSummary?: string;
  status?: "new" | "reported" | "triaged" | "approved" | "assigned" | "in_progress" | "mitigated" | "resolved" | "PROVISIONAL" | "CONFIRMED" | "NEEDS_VERIFICATION";
  assignedTo?: string;
  assignedTeam?: string;
  assignedRoles?: string[];
  assignedRole?: string;
  medicalNotes?: string;
  suppliesDetails?: string;
  title?: string;
  description?: string;
  history?: HistoryItem[];
  radiusKm?: number;
  priorityScore?: number;
  regionalClusterId?: string;
  userId?: string;
  userEmail?: string;
  citizenInput?: {
    severity?: string;
    description?: string | null;
    userId?: string | null;
    userEmail?: string | null;
  };
  analysis?: {
    finalSeverity?: string;
    source?: string;
    severityBadge?: string;  // "CITIZEN OVERRIDE" | "HYBRID CONFIRMED" | "FUSION ONLY"
    aiSeverity?: string;
    citizenSeverity?: string;
    contradictionLevel?: string;
  };
  decisionEngine?: {
    confidence?: number;
    priorityScore?: number;
    riskLevel?: string;
  };
  recommendedAction?: string;
  dataSources?: string[];
  reasoning?: string[];
}

interface CrisisCardProps {
  crisis: CrisisData;
  onSelect: (crisis: CrisisData) => void;
}

export const CrisisCard: React.FC<CrisisCardProps> = ({ crisis, onSelect }) => {
  const [mounted, setMounted] = useState(false);
  const { operatorProfile } = useAuth();
  const { approveCrisis, assignCrisis, escalateCrisis, resolveCrisis } = useCrisisActions();

  const [errorMsg, setErrorMsg] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  // Task 1: Truth Panel toggle
  const [truthPanelOpen, setTruthPanelOpen] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [intelData, setIntelData] = useState<any>(null);

  useEffect(() => {
    const uid = crisis.userId || crisis.citizenInput?.userId;
    if (!uid) return;
    getDoc(doc(db, "users", uid))
      .then(snap => {
        if (snap.exists()) {
          setProfileData(snap.data());
        }
      })
      .catch(err => console.warn("Failed to fetch profile in CrisisCard:", err));
  }, [crisis.userId, crisis.citizenInput?.userId]);

  useEffect(() => {
    const crisisId = crisis.crisisId;
    const intelId = crisis.ciroIntelligenceId;
    if (!crisisId && !intelId) return;

    const fetchIntel = async () => {
      try {
        // 1. Try direct doc lookup by ciroIntelligenceId first
        if (intelId) {
          const snap = await getDoc(doc(db, "ciro_intelligence", intelId));
          if (snap.exists()) { setIntelData(snap.data()); return; }
        }
        // 2. Fallback: query by linkedCrisisId field
        if (crisisId) {
          const q = query(collection(db, "ciro_intelligence"), where("linkedCrisisId", "==", crisisId));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) { setIntelData(qSnap.docs[0].data()); return; }
        }
      } catch (err) {
        console.warn("Failed to fetch ciro_intelligence in CrisisCard:", err);
      }
    };
    fetchIntel();
  }, [crisis.ciroIntelligenceId, crisis.crisisId]);

  // Selective intel merge: only pull nested fields that enrich without overwriting citizen truth
  const mergedCrisis = {
    ...crisis,
    // Pull inputs (citizenSignals), geoCluster, analysis, reasoning, recommendedActions from intel
    ...(intelData ? {
      inputs: intelData.inputs ?? (crisis as any).inputs,
      geoCluster: intelData.geoCluster ?? (crisis as any).geoCluster,
      analysis: intelData.analysis ?? (crisis as any).analysis,
      reasoning: intelData.reasoning ?? (crisis as any).reasoning,
      recommendedActions: intelData.recommendedActions ?? (crisis as any).recommendedActions,
      fusionScore: intelData.fusionScore ?? (crisis as any).fusionScore,
      // Map CRIO-generated narrative (reasoning) → aiSummary so the card renders real Gemini text
      aiSummary: crisis.aiSummary || (typeof intelData.reasoning === 'string' ? intelData.reasoning : undefined),
      // Extract Gemini's affectedPopulation estimate from nested rawDecision path
      affectedPopulation: crisis.affectedPopulation
        ?? intelData.rawDecision?.crises?.[0]?.affectedPopulation
        ?? intelData.analysis?.affectedPopulation
        ?? null,
      // Only use intel confidence/priorityScore if not already on crisis
      confidenceScore: crisis.confidenceScore ?? intelData.confidenceScore ?? intelData.analysis?.confidence,
    } : {}),
  };
  const data = resolveCrisisRecord(mergedCrisis);
  const d = normalizeNGORecord(mergedCrisis as any, 'crisis', profileData as any);
  const normalizedDisplay = normalizeDisplayCrisis(mergedCrisis as any, profileData) as any;
  const displayCrisis = {
    ...mergedCrisis,
    ...d,
    ...data,
    profile: profileData,
    _display: {
      ...normalizedDisplay._display,
      citizenName: d.citizenName
    }
  };

  const resolvedReasoning: string[] = Array.isArray(displayCrisis.reasoning)
    ? displayCrisis.reasoning
    : typeof displayCrisis.reasoning === "string" && displayCrisis.reasoning.trim()
      ? [displayCrisis.reasoning]
      : [];

  const resolvedRecommendedActions: string[] = Array.isArray(displayCrisis.recommendedActions)
    ? displayCrisis.recommendedActions
    : typeof displayCrisis.recommendedAction === "string" && displayCrisis.recommendedAction.trim()
      ? [displayCrisis.recommendedAction]
      : typeof displayCrisis.recommendedActions === "string" && (displayCrisis.recommendedActions as string).trim()
        ? [displayCrisis.recommendedActions]
        : [];

  const visibleRecommendedActions = resolvedRecommendedActions.filter((action) => {
    if (typeof action !== "string") return false;
    const trimmedAction = action.trim();
    return trimmedAction.length > 0 && !isSyntheticText(trimmedAction);
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasCitizenSignals = Array.isArray(displayCrisis.inputs?.citizenSignals) && displayCrisis.inputs.citizenSignals.length > 0;
  const isHiddenSynthetic = Boolean(d.isSynthetic) && !hasCitizenSignals;

  // Task 3: Reality accuracy badge
  const realityBadge: RealityBadge = computeRealityBadge(displayCrisis as any);
  const realityStyle = getRealityBadgeStyle(realityBadge);

  const eventName = (displayCrisis.title || "CRITICAL INCIDENT").toUpperCase();
  const normalizedStatus = normalizeWorkflowStatus(crisis.status);

  const STATUS_STEPS = ["new", "triaged", "assigned", "in_progress", "mitigated", "resolved"];
  const currentStep = STATUS_STEPS.indexOf(normalizedStatus);

  const formatTime = (timeInput?: any) => {
    if (!mounted || !timeInput) return "Active Now";
    try {
      const date = timeInput.seconds ? new Date(timeInput.seconds * 1000) : new Date(timeInput);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "Active Now";
    }
  };

  const executeAction = async (actionFn: () => Promise<void>) => {
    setActionLoading(true);
    setErrorMsg("");
    try {
      await actionFn();
    } catch (e: any) {
      setErrorMsg(e.message || "Action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const renderStepper = () => (
    <div className="mt-4 mb-2 flex items-center justify-between px-1">
      {STATUS_STEPS.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isActive = idx === currentStep;
        
        return (
          <div key={step} className="flex flex-col items-center relative group">
            {/* Connecting Line */}
            {idx !== 0 && (
               <div className={`absolute top-2.5 right-[50%] w-full h-[2px] -z-10 ${
                isCompleted || isActive ? 'bg-blue-500' : 'bg-zinc-800'
              }`} />
            )}
            
            <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
              isCompleted ? 'bg-blue-500 border-blue-500 text-white' :
              isActive ? 'bg-zinc-900 border-blue-400 text-blue-400 ring-4 ring-blue-500/20' :
              'bg-zinc-900 border-zinc-700 text-zinc-600'
            }`}>
              {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : idx + 1}
            </div>
            
            <span className={`mt-2 text-[8px] font-bold tracking-tight uppercase leading-none text-center w-12 max-w-12 truncate break-words ${
              isActive ? 'text-blue-400' : isCompleted ? 'text-zinc-400' : 'text-zinc-600'
            }`}>
              {step.replace('_', ' ')}
            </span>
          </div>
        );
      })}
    </div>
  );

  if (isHiddenSynthetic) return null;

  return (
    <div className="group flex flex-col rounded-xl border border-zinc-800/60 bg-[#0a0a0c] overflow-hidden transition-all hover:border-zinc-700 shadow-sm">
      {/* Top Banner Area */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/40 px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {(() => {
            const citizenSev = d.citizenSeverity || (displayCrisis.inputs?.citizenSignals && displayCrisis.inputs.citizenSignals[0]?.severity);
            return citizenSev
              ? <span className="rounded bg-orange-500/20 px-2 py-1 text-[10px] font-bold text-orange-400 uppercase tracking-wider border border-orange-500/30">{citizenSev}</span>
              : <SeverityBadge severity={crisis.severity} severityString={crisis.severityString} />;
          })()}
          {/* Hybrid Source Badge */}
          {crisis.analysis?.severityBadge && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${
              crisis.analysis.severityBadge === "CITIZEN OVERRIDE"
                ? "bg-orange-950/60 border-orange-700/60 text-orange-300"
                : crisis.analysis.severityBadge === "HYBRID CONFIRMED"
                ? "bg-emerald-950/60 border-emerald-700/60 text-emerald-300"
                : "bg-blue-950/60 border-blue-700/60 text-blue-300"
            }`}>
              <Brain className="h-2.5 w-2.5" />
              {crisis.analysis.severityBadge}
            </span>
          )}
          {/* Task 3: Reality Accuracy Badge */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${realityStyle}`}>
            <Activity className="h-2.5 w-2.5" />
            {realityBadge}
          </span>
          <h3 className="font-semibold text-zinc-100 tracking-tight text-sm flex items-center gap-2">
            {eventName}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500 font-medium">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatTime(crisis.time)}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 flex-1 flex flex-col space-y-4">
        {/* Main Reporter Info */}
        <div className="flex items-center gap-2 text-xs border-b border-zinc-800/50 pb-2">
          <div className="h-6 w-6 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold">
            {d.citizenName.charAt(0)}
          </div>
          <span className="text-zinc-200 font-medium truncate max-w-[240px]" title={d.citizenName}>
            {d.citizenName}
          </span>
          <span className={`ml-auto text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${d.identityState === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
            {d.identityState}
          </span>
        </div>

        {/* Description — always visible */}
        <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 px-3 py-2.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Citizen Report</span>
          <p className="text-sm text-zinc-200 leading-relaxed">
            {d.displayDescription || d.description || ""}
          </p>
          {/* Only show AI Summary when there are no citizen signals and it is not synthetic text */}
          {displayCrisis.aiSummary &&
           !isSyntheticText(displayCrisis.aiSummary) &&
           !hasCitizenSignals &&
           !d.isSynthetic &&
           !d.description &&
           !d.displayDescription &&
           displayCrisis.aiSummary !== d.displayDescription && (
            <p className="mt-2 text-[11px] text-zinc-500 leading-relaxed border-l-2 border-zinc-700 pl-2">
              <span className="font-bold uppercase text-[9px] text-zinc-600 block mb-0.5">AI Summary</span>
              {displayCrisis.aiSummary}
            </p>
          )}
        </div>

        {/* CRIO Recommended Actions — AI-generated by Gemini per stakeholder group */}
        {visibleRecommendedActions.length > 0 && (
          <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Brain className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-violet-400">
                CRIO · AI Recommendations
              </span>
            </div>
            <ul className="space-y-1.5">
              {visibleRecommendedActions.map((action, idx) => {
                // Parse "group: message" format from Gemini stakeholderMessages
                const colonIdx = action.indexOf(':');
                const hasGroup = colonIdx > 0 && colonIdx < 15;
                const group = hasGroup ? action.slice(0, colonIdx).trim().toLowerCase() : null;
                const message = hasGroup ? action.slice(colonIdx + 1).trim() : action;

                const groupConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
                  public:    { icon: Users,       color: 'text-blue-400',   label: 'Public' },
                  hospitals: { icon: HeartPulse,  color: 'text-rose-400',   label: 'Hospitals' },
                  police:    { icon: ShieldAlert, color: 'text-amber-400',  label: 'Police' },
                  utilities: { icon: Activity,    color: 'text-emerald-400',label: 'Utilities' },
                };
                const fallbackIcons = [Truck, Compass, Clock, CornerDownRight];
                const cfg = group && groupConfig[group] ? groupConfig[group] : null;
                const IconComp = cfg ? cfg.icon : fallbackIcons[idx % fallbackIcons.length];
                const iconColor = cfg ? cfg.color : 'text-violet-400';

                return (
                  <li
                    key={idx}
                    className="flex items-start gap-2 rounded-md bg-violet-500/5 border border-violet-500/10 px-2.5 py-1.5 group/action transition-all hover:bg-violet-500/10 hover:border-violet-500/20"
                  >
                    <IconComp className={`h-3 w-3 ${iconColor} mt-0.5 flex-shrink-0 transition-transform group-hover/action:scale-110`} />
                    <div className="min-w-0">
                      {cfg && (
                        <span className={`text-[8px] font-bold uppercase tracking-wider ${iconColor} block mb-0.5`}>
                          {cfg.label}
                        </span>
                      )}
                      <span className="text-[11px] text-zinc-300 leading-snug">{message}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Vital Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4 mt-auto">
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2">
            <Users className="h-4 w-4 text-blue-400" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Impact</p>
              <p className="text-sm font-medium text-zinc-200">
                {displayCrisis.affectedPopulation != null ? `~${displayCrisis.affectedPopulation} ppl` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2">
            <MapPin className="h-4 w-4 text-emerald-400" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Location</p>
              <p className="text-sm font-medium text-zinc-200 truncate" title={d.lat !== null ? `${d.lat}, ${d.lng}` : undefined}>
                {d.locationLabel || ""}
              </p>
            </div>
          </div>
        </div>

        {/* Stepper Component */}
        <div className="mt-2 mb-4 bg-zinc-900/20 rounded-lg py-2">
          {renderStepper()}
        </div>

        {/* Error Messaging */}
        {errorMsg && (
          <div className="mb-3 flex items-start gap-2 rounded-md bg-rose-500/10 p-2 text-xs text-rose-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Action Footers */}
        <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-3">
          <button 
            onClick={() => onSelect(crisis)}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            Open Inspector <ChevronRight className="h-3 w-3" />
          </button>
          
          <div className="flex gap-2">
            {operatorProfile?.role === "coordinator" && currentStep === 0 && (
              <button
                disabled={actionLoading}
                onClick={() => executeAction(() => approveCrisis(crisis.crisisId, operatorProfile))}
                className="rounded bg-blue-500/20 px-3 py-1.5 text-xs font-semibold text-blue-400 hover:bg-blue-500/30 transition-all disabled:opacity-50"
              >
                Triage Incident
              </button>
            )}
            
            {operatorProfile?.role === "coordinator" && currentStep === 1 && (
              <button
                disabled={actionLoading}
                onClick={() => executeAction(() => assignCrisis(crisis.crisisId, "medical_team_1", "Medical Team Alpha", "medical_team", operatorProfile))}
                className="rounded bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/30 transition-all disabled:opacity-50 flex items-center gap-1"
              >
                <HeartPulse className="h-3 w-3" /> Assign
              </button>
            )}

            {currentStep >= 4 && currentStep < 5 && (
              <button
                disabled={actionLoading}
                onClick={() => executeAction(() => resolveCrisis(crisis.crisisId, operatorProfile))}
                className="rounded bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-all disabled:opacity-50 flex items-center gap-1"
              >
                <CheckCircle2 className="h-3 w-3" /> Resolve
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
