import React, { useEffect, useState } from "react";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { X, AlertTriangle, Cpu, Compass, Calendar, CheckCircle2, Activity, Brain } from "lucide-react";

import { CrisisData } from "./CrisisCard";
import { SeverityBadge } from "./SeverityBadge";
import { HistoryItem } from "../hooks/useCrisisActions";
import { db } from "../lib/firebase";
import { DataQualityLayer, calculateDataIntegrity } from "./DataQualityLayer";
import { normalizeWorkflowStatus } from "../lib/displayUtils";
import { normalizeNGORecord } from "../lib/normalizeNGORecord";

interface CrisisDetailDrawerProps {
  crisis: CrisisData | null;
  onClose: () => void;
  operatorProfile: any;
}

export const CrisisDetailDrawer: React.FC<CrisisDetailDrawerProps> = ({ crisis, onClose }) => {
  const [intelData, setIntelData] = useState<any>(null);
  const [intelHistory, setIntelHistory] = useState<any[]>([]);
  const [loadingIntel, setLoadingIntel] = useState(false);
  const [citizenInfo, setCitizenInfo] = useState<any>(null);

  useEffect(() => {
    if (!crisis) return;

    let isMounted = true;

    const fetchLinkedData = async () => {
      setLoadingIntel(true);
      setIntelData(null);
      setIntelHistory([]);
      setCitizenInfo(null);

      try {
        const intelId = crisis.ciroIntelligenceId || crisis.crisisId;

        if (intelId) {
          const intelSnap = await getDoc(doc(db, "ciro_intelligence", intelId));
          if (isMounted && intelSnap.exists()) {
            const data = intelSnap.data();
            setIntelData(data);

            const historySnap = await getDoc(doc(db, "ciro_intelligence_history", intelId));
            if (historySnap.exists()) {
              const historyData = historySnap.data();
              const historyList = historyData.history || historyData.entries || historyData.logs || [historyData];
              if (isMounted) setIntelHistory(Array.isArray(historyList) ? historyList : [historyList]);
            } else {
              const historyQuerySnap = await getDocs(collection(db, "ciro_intelligence_history"));
              const matches: any[] = [];
              historyQuerySnap.forEach((d) => {
                const row = d.data();
                if (row.linkedCrisisId === crisis.crisisId || d.id === intelId) {
                  matches.push({ id: d.id, ...row });
                }
              });
              if (isMounted) setIntelHistory(matches);
            }
          }
        }

        const citizenSignal = crisis.supportingSignals?.find((signal: any) => signal.userId || signal.source === "citizen");
        const targetUserId = crisis.userId || citizenSignal?.userId;
        if (targetUserId) {
          const userSnap = await getDoc(doc(db, "users", targetUserId));
          if (isMounted && userSnap.exists()) {
            setCitizenInfo(userSnap.data());
          }
        }
      } catch (error) {
        console.error("Failed to fetch drawer data:", error);
      } finally {
        if (isMounted) setLoadingIntel(false);
      }
    };

    fetchLinkedData();
    return () => {
      isMounted = false;
    };
  }, [crisis]);

  if (!crisis) return null;

  const normalizedCrisis = normalizeNGORecord(crisis as any, "crisis", citizenInfo);
  if (normalizedCrisis.isSynthetic && !normalizedCrisis.hasCitizenSignals) return null;

  const hasRenderableCrisisContent = Boolean(
    normalizedCrisis.displayDescription ||
      normalizedCrisis.description ||
      normalizedCrisis.aiSummary ||
      normalizedCrisis.citizenName ||
      normalizedCrisis.citizenEmail ||
      normalizedCrisis.locationLabel ||
      normalizedCrisis.lat !== null ||
      normalizedCrisis.lng !== null ||
      normalizedCrisis.severity ||
      normalizedCrisis.priorityScore ||
      crisis.history?.length ||
      intelData ||
      intelHistory.length ||
      citizenInfo
  );

  const normalizedStatus = normalizeWorkflowStatus(crisis.status);
  const STATUS_STEPS = ["new", "triaged", "assigned", "in_progress", "mitigated", "resolved"];
  const currentStep = STATUS_STEPS.indexOf(normalizedStatus);

  const formatTime = (timeInput?: any) => {
    if (!timeInput) return "Active Now";
    try {
      const date = timeInput.seconds ? new Date(timeInput.seconds * 1000) : new Date(timeInput);
      return date.toLocaleString();
    } catch {
      return "Active Now";
    }
  };

  const emptyState = !hasRenderableCrisisContent;

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 border-l border-zinc-800 shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">
      <div className="px-6 py-5 border-b border-zinc-800/60 bg-zinc-900/40 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl flex-shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0 pr-4">
            <h2 className="text-base font-bold text-slate-100 uppercase tracking-tight truncate">
              {(crisis.title || crisis.subType || crisis.eventType || "Disaster Event").toUpperCase()}
            </h2>
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mt-0.5 truncate">
              ID: {crisis.crisisId}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors cursor-pointer flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {emptyState ? (
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-5 text-sm text-zinc-400">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
              <div className="space-y-1">
                <p className="font-semibold text-zinc-200">No displayable crisis data</p>
                <p className="text-xs leading-relaxed text-zinc-500">
                  This record does not contain citizen, location, or linked intelligence fields that can be rendered truthfully.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <DataQualityLayer metadata={calculateDataIntegrity(citizenInfo || crisis, "crisis")} itemType="Crisis Object" />

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-900/30 border border-zinc-800/60 rounded-xl space-y-1">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Citizen Severity</span>
                <SeverityBadge severity={crisis.severity} severityString={crisis.severityString} />
              </div>
              <div className="p-3 bg-zinc-900/30 border border-zinc-800/60 rounded-xl space-y-1">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">AI Confidence</span>
                <span className="text-lg font-bold text-slate-200">
                  {intelData?.analysis?.confidence != null
                    ? `${Math.round(Number(intelData.analysis.confidence) * 100)}%`
                    : crisis.confidence != null
                      ? `${Math.round(Number(crisis.confidence) * 100)}%`
                      : ""}
                </span>
              </div>
              <div className="p-3 bg-zinc-900/30 border border-zinc-800/60 rounded-xl space-y-1">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Population</span>
                <span className="text-lg font-bold text-slate-200">
                  {crisis.affectedPopulation != null && crisis.affectedPopulation > 0 ? crisis.affectedPopulation : ""}
                </span>
              </div>
              <div className="p-3 bg-zinc-900/30 border border-zinc-800/60 rounded-xl space-y-1">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Impact Radius</span>
                <span className="text-lg font-bold text-slate-200">
                  {intelData?.geoCluster?.radiusKm != null
                    ? `${intelData.geoCluster.radiusKm} km`
                    : (crisis as any).geoCluster?.radiusKm != null
                      ? `${(crisis as any).geoCluster.radiusKm} km`
                      : ""}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span>Operational Summary</span>
              </h3>
              <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl text-sm text-zinc-300 leading-relaxed font-mono text-xs">
                {normalizedCrisis.displayDescription || normalizedCrisis.description || ""}
              </div>
            </div>

            <div className="space-y-4">
              {loadingIntel ? (
                <div className="flex items-center justify-center py-4 text-xs text-zinc-500 animate-pulse font-mono">
                  Fetching Linked AI Intelligence & History...
                </div>
              ) : intelData ? (
                <div className="space-y-3">
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-blue-400" /> AI Crisis Intelligence Drawer
                  </span>
                  <DataQualityLayer metadata={calculateDataIntegrity(intelData, "intelligence")} itemType="AI Intelligence" />
                  <div className="bg-zinc-900/80 border border-blue-500/30 rounded-xl p-4 space-y-3 shadow-lg">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-800 font-mono text-xs">
                      <span className="text-zinc-400">Fusion Score: <strong className="text-white">{intelData.fusionScore ?? ""}</strong></span>
                      <span className="text-zinc-400">Cluster: <strong className="text-blue-400">{intelData.geoCluster ? `${intelData.geoCluster.lat?.toFixed(4)}, ${intelData.geoCluster.lng?.toFixed(4)} (r${intelData.geoCluster.radiusKm}km)` : ""}</strong></span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px] uppercase mb-1">AI Explanation & Key Evidence</span>
                      <p className="text-zinc-300 leading-relaxed font-mono bg-zinc-950/50 p-2.5 rounded border border-zinc-800/80 text-xs">
                        {Array.isArray(intelData.analysis?.keyEvidence)
                          ? intelData.analysis.keyEvidence.join(" · ")
                          : typeof intelData.analysis?.keyEvidence === "string"
                            ? intelData.analysis.keyEvidence
                            : (normalizedCrisis.aiSummary || "")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-4 text-center text-zinc-500 italic text-xs font-mono">
                  No linked AI intelligence doc (`ciroIntelligenceId`) found for this crisis.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <Compass className="w-4 h-4 text-emerald-400" />
                    <span>Telemetry</span>
                  </h3>
                  <div className="p-3.5 bg-zinc-900/30 border border-zinc-800/60 rounded-xl text-xs space-y-2 font-mono">
                    <div className="flex justify-between items-center text-zinc-500"><span>Lat:</span><span className="text-zinc-300">{crisis.location?.lat ?? ""}</span></div>
                    <div className="flex justify-between items-center text-zinc-500"><span>Lng:</span><span className="text-zinc-300">{crisis.location?.lng ?? ""}</span></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <Calendar className="w-4 h-4 text-purple-400" />
                    <span>Timeline</span>
                  </h3>
                  <div className="p-3.5 bg-zinc-900/30 border border-zinc-800/60 rounded-xl text-xs space-y-2 font-mono">
                    <div className="flex justify-between items-center text-zinc-500"><span>Created:</span><span className="text-zinc-300">{formatTime(crisis.time)}</span></div>
                    <div className="flex justify-between items-center text-zinc-500"><span>Last Updated:</span><span className="text-zinc-300">Active</span></div>
                  </div>
                </div>
              </div>

              {crisis.history && crisis.history.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Operation Logs</h3>
                  <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-xl p-4 space-y-4">
                    {crisis.history.slice().reverse().map((log: HistoryItem, i: number) => (
                      <div key={i} className="flex gap-3 relative">
                        {i !== crisis.history!.length - 1 && <div className="absolute top-6 left-2.5 w-px h-full bg-zinc-800" />}
                        <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 z-10 mt-0.5">
                          <Activity className="w-2.5 h-2.5 text-zinc-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200">{log.action}</span>
                            <span className="text-[10px] text-zinc-500">{new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <p className="text-xs text-blue-400 mt-0.5">{log.byName}</p>
                          {log.notes && (
                            <div className="mt-1.5 p-2 bg-zinc-950 border border-zinc-800/60 rounded text-xs text-zinc-400 leading-relaxed font-mono">
                              {log.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
