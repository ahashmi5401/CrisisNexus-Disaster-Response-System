"use client";

import React, { useEffect, useState } from "react";
import { AuthGuard } from "../components/AuthGuard";
import { StatsCard } from "../components/StatsCard";
import { CrisisCard, CrisisData } from "../components/CrisisCard";
import { CrisisDetailDrawer } from "../components/CrisisDetailDrawer";
import { ReliefQueue } from "../components/ReliefQueue";
import { MapOpsLayer } from "../components/MapOpsLayer";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { 
  ShieldAlert, Activity, Users, Globe, Loader2, CheckCircle, Building, AlertTriangle, Package
} from "lucide-react";
import { useAuth } from "../components/AuthProvider";
import { normalizeCrisis } from "../lib/normalizeCrisis";

export default function DashboardHome() {
  const { operatorProfile, authState } = useAuth();
  const userRole = operatorProfile?.role || "observer";
  const [crises, setCrises] = useState<CrisisData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrisis, setSelectedCrisis] = useState<CrisisData | null>(null);
  
  // Dashboard Tabs: "crisis_feed", "relief_center", "map_ops"
  const [activeTab, setActiveTab] = useState<"crisis_feed" | "relief_center" | "map_ops">("crisis_feed");
  const [filterMode, setFilterMode] = useState<"all" | "my_ngo">("all");

  useEffect(() => {
    if (authState !== "authenticated") return;

    const crisesRef = collection(db, "crises");
    const q = query(
      crisesRef,
      orderBy("priorityScore", "desc"),
      orderBy("updatedAt", "desc"),
      orderBy("crisisId", "asc")
    );

    let fallbackUnsub: (() => void) | null = null;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeCrises: CrisisData[] = [];
      snapshot.forEach((doc) => {
        const normalized = normalizeCrisis({ crisisId: doc.id, ...doc.data() });
        activeCrises.push(normalized as CrisisData);
      });

      setCrises(activeCrises);
      setLoading(false);
    }, (error) => {
      console.warn("Firestore sync error on priority query, falling back to orderBy time:", error);
      const fallbackQ = query(crisesRef, orderBy("time", "desc"));
      fallbackUnsub = onSnapshot(fallbackQ, (fallbackSnap) => {
        const activeCrises: CrisisData[] = [];
        fallbackSnap.forEach((doc) => {
          const normalized = normalizeCrisis({ crisisId: doc.id, ...doc.data() });
          activeCrises.push(normalized as CrisisData);
        });
        setCrises(activeCrises);
        setLoading(false);
      }, (fallbackErr) => {
        console.error("Fallback query also failed:", fallbackErr);
        setLoading(false);
      });
    });

    return () => {
      unsubscribe();
      if (fallbackUnsub) fallbackUnsub();
    };
  }, [authState]);

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

  const getStats = () => {
    const activeCrises = crises.filter(c => c.status !== "resolved");
    const total = activeCrises.length;
    const critical = activeCrises.filter(c => c.severity === 5 || c.severityString?.toLowerCase() === "critical").length;
    const totalPopulation = activeCrises.reduce((sum, c) => sum + (c.affectedPopulation ?? 0), 0);
    const avgConfidence = total > 0 
      ? (() => {
          const withConf = activeCrises.filter(c => c.confidence != null || c.confidenceScore != null);
          if (withConf.length === 0) return null;
          return Math.round((withConf.reduce((sum, c) => sum + (c.confidence ?? c.confidenceScore ?? 0), 0) / withConf.length) * 100);
        })()
      : null;

    const logisticsCrises = crises.filter(c => c.assignedRole === "logistics" || c.assignedRoles?.includes("logistics") || c.subType === "shelter" || c.subType === "food");
    const logisticsResolved = logisticsCrises.filter(c => c.status === "resolved").length;
    const logisticsPercentage = logisticsCrises.length > 0 ? `${Math.round((logisticsResolved / logisticsCrises.length) * 100)}%` : "100%";

    const rescueCrises = crises.filter(c => c.assignedRole === "rescue" || c.assignedRoles?.includes("rescue") || c.subType === "flood" || c.subType === "fire" || c.subType === "earthquake");
    const rescueResolved = rescueCrises.filter(c => c.status === "resolved").length;
    const rescuePercentage = rescueCrises.length > 0 ? `${Math.round((rescueResolved / rescueCrises.length) * 100)}%` : "100%";

    return { total, critical, totalPopulation, avgConfidence, logisticsPercentage, rescuePercentage };
  };

  const stats = getStats();

  const filteredCrises = crises.filter(c => {
    if (c.status === "resolved") return false;
    if (filterMode === "all") return true;
    const matchesAssignedRole = c.assignedRole === userRole || c.assignedRoles?.includes(userRole);
    const matchesHistoryAction = c.history?.some(h => h.by === operatorProfile?.uid) || false;
    return matchesAssignedRole || matchesHistoryAction;
  });

  // Split layout handling
  const isDrawerOpen = selectedCrisis !== null;

  return (
    <AuthGuard>
      <div className="flex h-[calc(100vh-2rem)] overflow-hidden gap-6">
        {/* Main Panel */}
        <div className={`flex-1 flex flex-col space-y-6 overflow-y-auto custom-scrollbar transition-all duration-300 ${isDrawerOpen ? 'mr-0' : ''}`}>
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-zinc-800/60 shrink-0">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight">EOC Command Dashboard</h1>
              <p className="text-sm text-zinc-400 font-medium mt-1">Real-Time NGO Emergency Operations Monitor</p>
            </div>
            
            <div className="flex items-center gap-3 mt-4 md:mt-0">


              <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/60">
                <button
                  onClick={() => setActiveTab("crisis_feed")}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
                    activeTab === "crisis_feed" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                  Crisis Feed
                </button>
                <button
                  onClick={() => setActiveTab("relief_center")}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
                    activeTab === "relief_center" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Package className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                  Relief Command
                </button>
                <button
                  onClick={() => setActiveTab("map_ops")}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
                    activeTab === "map_ops" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                  Map Ops
                </button>
              </div>
            </div>
          </div>

          {activeTab === "crisis_feed" && (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                <StatsCard title="Total Operations" value={stats.total} description="Active crisis zones tracked" icon={<Activity className="w-4 h-4 text-blue-400" />} trend={`${stats.total} Active`} trendType="neutral" />
                <StatsCard title="Critical Threats" value={stats.critical} description="High-severity escalations" icon={<ShieldAlert className="w-4 h-4 text-rose-400" />} trend={`${stats.critical} Priority`} trendType={stats.critical > 0 ? "down" : "up"} />
                <StatsCard title="Affected Registry" value={stats.totalPopulation.toLocaleString()} description="Total citizens in radius" icon={<Users className="w-4 h-4 text-purple-400" />} trend="Active Impact" trendType="neutral" />
                <StatsCard title={userRole === "logistics" ? "Logistics Status" : userRole === "medical_team" ? "Medical Dispatch" : userRole === "rescue" ? "Rescue Fleet" : "Average Confidence"} value={userRole === "logistics" ? stats.logisticsPercentage : userRole === "medical_team" ? "Active" : userRole === "rescue" ? stats.rescuePercentage : stats.avgConfidence != null ? `${stats.avgConfidence}%` : "—"} description="Department performance metric" icon={<Globe className="w-4 h-4 text-emerald-400" />} trend="High Reliability" trendType="up" />
              </div>

              {/* Protocol Banner */}
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 shrink-0 flex items-start gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg shrink-0">
                  <Building className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200">Active Dispatch Protocol — {getRoleLabel(userRole)}</h4>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    {userRole === "coordinator" ? "Supervise disaster zones, triage incidents, assign field teams, and oversee the resolution pipeline." :
                     userRole === "medical_team" ? "Review medical urgencies, log casualty estimates, and verify medical relief requests." :
                     userRole === "logistics" ? "Secure supply chains, allocate field resources, and dispatch verified relief requested directly to zones." :
                     "Monitor telemetry and coordinate field intelligence operations."}
                  </p>
                </div>
              </div>

              {/* Feed Filters */}
              <div className="flex items-center justify-between shrink-0">
                <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/60 text-xs">
                  <button onClick={() => setFilterMode("all")} className={`px-3 py-1.5 rounded-md font-bold uppercase tracking-wider transition ${filterMode === "all" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>Global ({crises.filter(c => c.status !== "resolved").length})</button>
                  <button onClick={() => setFilterMode("my_ngo")} className={`px-3 py-1.5 rounded-md font-bold uppercase tracking-wider transition ${filterMode === "my_ngo" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>My Dept ({crises.filter(c => c.status !== "resolved" && (c.assignedRole === userRole || c.assignedRoles?.includes(userRole) || c.history?.some(h => h.by === operatorProfile?.uid))).length})</button>
                </div>
              </div>

              {/* Grid Feed */}
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Syncing Telemetry...</span>
                </div>
              ) : filteredCrises.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-zinc-900/20 border border-zinc-800/60 rounded-xl border-dashed">
                  <CheckCircle className="w-8 h-8 text-zinc-600 mb-3" />
                  <h3 className="text-sm font-bold text-zinc-300">All Sectors Stable</h3>
                  <p className="text-xs text-zinc-500 mt-1">No matching incidents found in registry.</p>
                </div>
              ) : filteredCrises.length >= 3 ? (
                <div className="flex-1 flex flex-col space-y-4 pb-8">
                  {filteredCrises.filter(c => c.severity === 5 || c.severityString?.toUpperCase() === "CRITICAL").length > 1 && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-center justify-center text-rose-400 text-xs font-bold tracking-widest uppercase animate-pulse">
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Multiple Critical Incidents Detected — GLOBAL INCIDENT MODE
                    </div>
                  )}
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Priority 1 (Expanded)</h3>
                  <div className="w-full md:w-1/2 lg:w-1/3">
                    <CrisisCard crisis={filteredCrises[0]} onSelect={setSelectedCrisis} />
                  </div>
                  
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-4">Priority 2 & 3 (Monitoring)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full md:w-2/3">
                    {filteredCrises.slice(1, 3).map((crisis) => (
                      <div key={crisis.crisisId} onClick={() => setSelectedCrisis(crisis)} className="cursor-pointer bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-3 flex items-center justify-between hover:bg-zinc-800 transition-colors">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-200">{crisis.title || crisis.subType || "Unknown Event"}</span>
                          <span className="text-[10px] text-zinc-500 uppercase">{crisis.status || "NEW"} • {crisis.location?.name || "Target Zone"}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                          (crisis.severity === 5 || crisis.severityString?.toUpperCase() === "CRITICAL") ? "bg-rose-500/20 text-rose-400" :
                          (crisis.severity === 4 || crisis.severityString?.toUpperCase() === "HIGH") ? "bg-orange-500/20 text-orange-400" :
                          "bg-amber-500/20 text-amber-400"
                        }`}>{crisis.severityString || crisis.severity}</span>
                      </div>
                    ))}
                  </div>

                  {filteredCrises.length > 3 && (
                    <>
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-4">Active Queue ({filteredCrises.length - 3})</h3>
                      <div className="flex flex-wrap gap-2">
                        {filteredCrises.slice(3).map((crisis) => (
                          <div key={crisis.crisisId} onClick={() => setSelectedCrisis(crisis)} className="cursor-pointer bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 flex items-center space-x-2 hover:border-zinc-700">
                            <Activity className="w-3 h-3 text-zinc-500" />
                            <span className="text-xs text-zinc-300 font-medium">{crisis.title || crisis.subType || "Event"}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-max pb-8">
                  {filteredCrises.map((crisis) => (
                    <CrisisCard key={crisis.crisisId} crisis={crisis} onSelect={setSelectedCrisis} />
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === "relief_center" && (
            <div className="flex-1 flex flex-col bg-zinc-900/20 border border-zinc-800/60 rounded-xl p-6">
              <ReliefQueue />
            </div>
          )}

          {activeTab === "map_ops" && (
            <div className="flex-1 flex flex-col rounded-xl overflow-hidden min-h-[500px]">
              <MapOpsLayer />
            </div>
          )}
        </div>

        {/* Right Panel: Crisis Inspector Drawer */}
        {isDrawerOpen && (
          <div className="w-[400px] shrink-0 h-full hidden lg:block rounded-xl overflow-hidden shadow-2xl ring-1 ring-zinc-800">
            <CrisisDetailDrawer 
              crisis={selectedCrisis} 
              onClose={() => setSelectedCrisis(null)} 
              operatorProfile={operatorProfile} 
            />
          </div>
        )}
        
        {/* Mobile overlay version of the drawer */}
        {isDrawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
            <div className="w-full max-w-sm h-full bg-zinc-950 border-l border-zinc-800">
              <CrisisDetailDrawer 
                crisis={selectedCrisis} 
                onClose={() => setSelectedCrisis(null)} 
                operatorProfile={operatorProfile} 
              />
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
