import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./AuthProvider";
import { ShieldAlert, Package, Truck, CheckCircle2, Clock, Filter, AlertTriangle, Users, Phone, User, HeartPulse, Sparkles, X, ChevronDown, Layers } from "lucide-react";
import { normalizeSeverity, getSeverityColor } from "../lib/severityHelper";
import { DataQualityLayer, calculateDataIntegrity } from "./DataQualityLayer";
import { groupReliefByEvent, resolveCitizenIdentity, resolveLocationLabel, type ReliefCase } from "../lib/displayUtils";
import { normalizeNGORecord } from "../lib/normalizeNGORecord";

export interface ReliefRequest {
  [key: string]: any;
  id: string;
  requestId?: string;
  userId: string;
  type?: string;
  subType?: string;
  description?: string;
  notes?: string;
  urgency?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  priorityScore?: number;
  status: "PENDING" | "VERIFIED" | "APPROVED" | "DISPATCHED" | "DELIVERED" | "CLOSED";
  location?: { lat: number; lng: number; name?: string };
  createdAt: string;
  updatedAt: string;
}

const getName = (r: any) =>
  r?.profile?.displayName ||
  r?.profile?.name ||
  r?.profile?.profile?.displayName ||
  r?.profile?.profile?.name ||
  r?.citizenName ||
  r?.userEmail ||
  r?.userId ||
  "";

export const ReliefQueue: React.FC = () => {
  const { operatorProfile, authState } = useAuth();
  const [requests, setRequests] = useState<ReliefRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  
  // Family Intelligence Panel State
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [citizenInfo, setCitizenInfo] = useState<any>(null);
  const [dependents, setDependents] = useState<any[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  // Task 2: per-case expanded needs state (key = eventId)
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set());
  const [userProfiles, setUserProfiles] = useState<Record<string, any>>({});

  useEffect(() => {
    if (requests.length === 0) return;
    const uniqueUserIds = Array.from(new Set(requests.map(r => r.userId).filter(Boolean)));
    const missingUserIds = uniqueUserIds.filter(uid => !userProfiles[uid]);
    if (missingUserIds.length === 0) return;

    missingUserIds.forEach(async (uid) => {
      try {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          setUserProfiles(prev => ({ ...prev, [uid]: data }));
        }
      } catch (err) {
        console.warn(`Failed to pre-fetch profile for ${uid}:`, err);
      }
    });
  }, [requests, userProfiles]);

  useEffect(() => {
    if (authState !== "authenticated") return;

    const requestsRef = collection(db, "relief_requests");
    const q = query(requestsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeRequests: ReliefRequest[] = [];
      snapshot.forEach((doc) => {
        activeRequests.push({ id: doc.id, requestId: doc.id, ...doc.data() } as ReliefRequest);
      });
      setRequests(activeRequests);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [authState]);

  const updateStatus = async (requestId: string, newStatus: ReliefRequest["status"], e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, "relief_requests", requestId), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      if (selectedRequest?.id === requestId) {
        setSelectedRequest({ ...selectedRequest, status: newStatus });
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const handleOpenPanel = async (req: ReliefRequest) => {
    setSelectedRequest(req);
    setPanelLoading(true);
    setCitizenInfo(null);
    setDependents([]);

    try {
      if (req.userId) {
        // Fetch User Info
        const userSnap = await getDoc(doc(db, "users", req.userId));
        if (userSnap.exists()) {
          setCitizenInfo(userSnap.data());
        } else {
          setCitizenInfo({ 
            name: "", 
            phone: null, 
            riskScore: null,
            address: req.location?.name ?? null,
            identityState: "UNVERIFIED"
          });
        }

        // Fetch Dependents from subcollection
        const membersSnap = await getDocs(collection(db, "family_profiles", req.userId, "members"));
        const memList: any[] = [];
        membersSnap.forEach(mDoc => { memList.push({ id: mDoc.id, ...mDoc.data() }); });
        setDependents(memList);
      }
    } catch (err) {
      console.error("Failed to fetch family intelligence:", err);
    } finally {
      setPanelLoading(false);
    }
  };

  const filteredRequests = requests.filter(r => filterStatus === "ALL" || (r.status?.toUpperCase() || "PENDING") === filterStatus);

  // Task 2: group filtered requests into ReliefCase objects (UI-only, no backend change)
  const reliefCases: ReliefCase[] = groupReliefByEvent(filteredRequests);

  const toggleCase = (eventId: string) => {
    setExpandedCases(prev => {
      const next = new Set(prev);
      next.has(eventId) ? next.delete(eventId) : next.add(eventId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const norm = status?.toUpperCase() || "PENDING";
    switch (norm) {
      case "PENDING": return <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-500"><Clock className="h-3 w-3" /> Pending</span>;
      case "VERIFIED": return <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-500"><ShieldAlert className="h-3 w-3" /> Verified</span>;
      case "APPROVED": return <span className="flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-500"><CheckCircle2 className="h-3 w-3" /> Approved</span>;
      case "DISPATCHED": return <span className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-500"><Truck className="h-3 w-3" /> Dispatched</span>;
      case "DELIVERED": return <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500"><Package className="h-3 w-3" /> Delivered</span>;
      case "CLOSED": return <span className="flex items-center gap-1 rounded-full bg-zinc-500/10 px-2.5 py-0.5 text-xs font-medium text-zinc-500">Closed</span>;
      default: return <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{status}</span>;
    }
  };

  const getUrgencyBadge = (urg: any) => {
    const norm = normalizeSeverity(urg);
    return <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider" style={{ backgroundColor: `${getSeverityColor(norm)}20`, color: getSeverityColor(norm) }}>{norm}</span>;
  };

  const renderActionButtons = (request: ReliefRequest) => {
    const normStatus = request.status?.toUpperCase() || "PENDING";
    if (operatorProfile?.role === "coordinator") {
      if (normStatus === "PENDING" || normStatus === "VERIFIED") {
        return <button onClick={(e) => updateStatus(request.id, "APPROVED", e)} className="rounded bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-500/30 transition-colors">Approve</button>;
      }
    }
    if (operatorProfile?.role === "medical_team" && normStatus === "PENDING") {
      return <button onClick={(e) => updateStatus(request.id, "VERIFIED", e)} className="rounded bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/30 transition-colors">Verify Medical</button>;
    }
    if (operatorProfile?.role === "logistics" && normStatus === "APPROVED") {
      return <button onClick={(e) => updateStatus(request.id, "DISPATCHED", e)} className="rounded bg-orange-500/20 px-3 py-1 text-xs font-medium text-orange-400 hover:bg-orange-500/30 transition-colors">Dispatch Team</button>;
    }
    if (operatorProfile?.role === "logistics" && normStatus === "DISPATCHED") {
      return <button onClick={(e) => updateStatus(request.id, "DELIVERED", e)} className="rounded bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/30 transition-colors">Mark Delivered</button>;
    }
    if (operatorProfile?.role === "coordinator" && normStatus === "DELIVERED") {
      return <button onClick={(e) => updateStatus(request.id, "CLOSED", e)} className="rounded bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-600 transition-colors">Close Request</button>;
    }
    return null;
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    try {
      if (typeof timestamp === "object" && timestamp.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "";
    }
  };

  const hasPriorityBoost = dependents.some(d => d.type?.toLowerCase() === "child" || d.type?.toLowerCase() === "elderly" || Number(d.age) > 65 || Number(d.age) < 12);

  const d = selectedRequest
    ? normalizeNGORecord(selectedRequest, 'relief', citizenInfo)
    : null;

  const panelIdentityRecord = d ? {
    ...selectedRequest,
    ...citizenInfo,
    ...d,
    identityState: d.identityState
  } : null;

  return (
    <div className="flex h-full flex-col lg:flex-row gap-6">
      <div className="flex-1 flex flex-col min-w-[50%]">
        <div className="mb-6 flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-white">Relief Command Panel</h2>
              <span className="bg-blue-500/10 border border-blue-500/30 text-blue-400 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">
                Role: {operatorProfile?.role || "observer"}
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1">Manage and route approved structured relief pipeline</p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-400" />
            <select 
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 focus:border-blue-500 focus:outline-none"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Verification</option>
              <option value="VERIFIED">Verified</option>
              <option value="APPROVED">Approved for Dispatch</option>
              <option value="DISPATCHED">Currently Dispatched</option>
              <option value="DELIVERED">Delivered</option>
            </select>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-2 max-h-[700px]">
          {reliefCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 border-dashed py-12">
              <Package className="mb-3 h-8 w-8 text-zinc-600" />
              <p className="text-sm text-zinc-400">No relief requests found matching criteria.</p>
            </div>
          ) : (
            reliefCases.map((reliefCase) => {
              const primaryNeed = reliefCase.needs[0];
              const panelReq = requests.find(r => r.id === primaryNeed.id) ?? { ...primaryNeed, id: primaryNeed.id };
              const userProfile = userProfiles[reliefCase.userId];
              const normalizedCase = normalizeNGORecord(
                { userId: reliefCase.userId },
                'relief',
                userProfile
              );
              const caseIdentity = getName({
                profile: userProfile,
                citizenName: normalizedCase.citizenName,
                userEmail: normalizedCase.citizenEmail,
                userId: reliefCase.userId
              });
              const caseLocation = resolveLocationLabel(reliefCase.location);

              return (
                <div
                  key={reliefCase.eventId}
                  className={`group relative rounded-xl border transition-all ${
                    selectedRequest?.id === primaryNeed.id
                      ? "bg-zinc-800/80 border-blue-500/50 shadow-lg"
                      : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {/* Case Header — always visible */}
                  <div
                    className="flex items-start justify-between p-4 cursor-pointer"
                    onClick={() => handleOpenPanel(panelReq as any)}
                  >
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-2 flex-wrap">
                        {getUrgencyBadge(primaryNeed.urgency || primaryNeed.priorityScore)}
                        {reliefCase.isMultiNeed && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-blue-400">
                            <Layers className="h-2.5 w-2.5" />
                            {reliefCase.needs.length} Needs
                          </span>
                        )}
                        {getStatusBadge(reliefCase.dominantStatus)}
                        {primaryNeed.duplicateCheckStatus && primaryNeed.duplicateCheckStatus !== "new" && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                            {primaryNeed.duplicateCheckStatus}
                          </span>
                        )}
                      </div>
                      <p className="mb-1 text-xs text-zinc-400 font-mono truncate" title={reliefCase.eventId}>
                        Event: {reliefCase.eventId}
                      </p>
                      <p className="mb-2 text-xs text-zinc-400">
                        <User className="inline h-3 w-3 mr-1" />
                        {caseIdentity}
                      </p>
                      <p className="mb-3 text-sm text-zinc-300">
                        {d?.displayDescription || d?.description || ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(reliefCase.createdAt)}
                        </span>
                        <span className="truncate max-w-[220px]">📍 {caseLocation}</span>
                      </div>
                    </div>
                    <div className="ml-4 flex flex-col items-end gap-2">
                      {!reliefCase.isMultiNeed && renderActionButtons(panelReq as any)}
                    </div>
                  </div>

                  <div className="border-t border-zinc-800/60 px-4 py-3 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-1">
                      Relief needs ({reliefCase.needs.length})
                    </span>
                    <div className="space-y-2">
                          {reliefCase.needs.map((need) => {
                            const fullNeed = requests.find(r => r.id === need.id) ?? (need as any);
                            return (
                            <div
                              key={need.id}
                              className="flex items-center justify-between rounded-lg bg-zinc-900/60 border border-zinc-800/60 px-3 py-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-zinc-300 uppercase">
                                  {need.subType.replace("_", " ")}
                                </span>
                                {need.duplicateCheckStatus && need.duplicateCheckStatus !== "new" && (
                                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                                    {need.duplicateCheckStatus}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {getStatusBadge(need.status)}
                                {renderActionButtons(fullNeed as any)}
                              </div>
                            </div>
                          )})}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Side: Family Intelligence Panel */}
      {selectedRequest && (
        <div className="w-full lg:w-96 bg-zinc-950/90 backdrop-blur-md border border-zinc-800 rounded-xl p-6 flex flex-col shadow-2xl ring-1 ring-white/10 max-h-[700px] overflow-y-auto">
          <div className="flex justify-between items-start mb-6 pb-4 border-b border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <h3 className="font-black uppercase tracking-wider text-sm text-slate-100">Family Intelligence Panel</h3>
              </div>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">Enrichment for Req ID: {selectedRequest.id}</p>
            </div>
            <button onClick={() => setSelectedRequest(null)} className="text-zinc-400 hover:text-white p-1 bg-zinc-900 rounded-lg">✕</button>
          </div>

          {panelLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3 py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Fetching Citizen Registry...</span>
            </div>
          ) : (
            <div className="space-y-6 text-xs text-zinc-300">
              {/* Data Quality Layer */}
              <DataQualityLayer
                metadata={calculateDataIntegrity(
                  panelIdentityRecord ? { ...selectedRequest, ...panelIdentityRecord } : selectedRequest,
                  'relief'
                )}
                itemType="Relief Request"
              />

              {/* Priority Boost Escalation Alert */}
              {hasPriorityBoost && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3 animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-rose-400 uppercase tracking-wider block text-xs">Priority Escalation Active</span>
                    <p className="text-rose-300/90 mt-0.5 leading-relaxed">Vulnerable dependents (elderly or children) detected in household. Immediate relief dispatch strongly recommended.</p>
                  </div>
                </div>
              )}

              {/* Citizen Details */}
              <div className="space-y-3">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Citizen Primary Identity</span>
                {panelIdentityRecord && (
                  <DataQualityLayer metadata={calculateDataIntegrity(panelIdentityRecord, 'user')} itemType="Citizen Profile" />
                )}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-zinc-800 rounded-lg text-zinc-300"><User className="w-4 h-4" /></div>
                    <div>
                      <span className="font-bold text-white block text-sm">
                        {panelIdentityRecord ? getName({
                          profile: citizenInfo,
                          citizenName: panelIdentityRecord.citizenName,
                          userEmail: panelIdentityRecord.citizenEmail,
                          userId: selectedRequest.userId
                        }) : ""}
                      </span>
                      <span className="text-zinc-500 font-mono text-[10px]">UID: {selectedRequest.userId}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-zinc-800/60 flex justify-between items-center text-zinc-400 font-mono">
                    {(citizenInfo?.profile?.phone || citizenInfo?.phone) ? <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-zinc-500" /> {citizenInfo?.profile?.phone || citizenInfo?.phone}</span> : <span className="flex items-center gap-1.5" />}
                    {(citizenInfo?.stats?.riskScore ?? citizenInfo?.riskScore ?? selectedRequest.priorityScore) != null ? <span className="font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">Risk Score: {citizenInfo?.stats?.riskScore ?? citizenInfo?.riskScore ?? selectedRequest.priorityScore}</span> : <span className="font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20" />}
                  </div>
                </div>
              </div>

              {/* Dependents Roster */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Dependents Registry ({dependents.length})</span>
                  <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-bold">Subcollection</span>
                </div>
                {dependents.length === 0 ? (
                  <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-xl p-6 text-center text-zinc-500 italic">
                    No dependents logged in family profile subcollection.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dependents.map((dep) => (
                      <div key={dep.id} className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-3 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white block">{dep.name || ""}</span>
                          <span className="text-zinc-500 text-[10px] uppercase">{dep.relation || ""}{dep.relation && dep.age != null ? " • " : ""}{dep.age != null ? `Age ${dep.age}` : ""}</span>
                        </div>
                        {dep.type && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            dep.type.toLowerCase() === "child" || dep.type.toLowerCase() === "elderly" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "bg-zinc-800 text-zinc-400"
                          }`}>
                            {dep.type}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Exact Request Notes */}
              <div className="space-y-3">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Exact Request Notes & Specs</span>
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-zinc-300 leading-relaxed font-mono text-xs">
                  {selectedRequest.notes || selectedRequest.description || ""}
                </div>
              </div>

              {/* Status Actions */}
              <div className="space-y-3 pt-2">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Operator Action</span>
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 flex flex-wrap gap-2 items-center justify-between">
                  <span className="text-zinc-400 font-semibold">Current: {getStatusBadge(selectedRequest.status)}</span>
                  <div>{renderActionButtons(selectedRequest)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
