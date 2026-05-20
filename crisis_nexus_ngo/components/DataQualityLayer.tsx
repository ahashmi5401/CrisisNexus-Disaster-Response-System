import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShieldCheck, HelpCircle, FileWarning, Wifi, WifiOff, RefreshCw, Cpu, Activity } from 'lucide-react';
import { isCitizenIdentityVerified } from '../lib/displayUtils';

export interface DataIntegrityMetadata {
  operationalState: "READY" | "DEGRADED" | "INCOMPLETE" | "BLOCKED" | "OFFLINE_SOURCE";
  dataQuality: "COMPLETE" | "PARTIAL" | "MISSING_FIELDS";
  sourceReliability: "HIGH" | "MEDIUM" | "LOW";
  lastSyncStatus: "LIVE_SYNC" | "SYNCING_DELAYED" | "OFFLINE_STALE";
  sourceMode: "DIRECT_FIRESTORE" | "MOBILE_DEGRADED" | "DELAYED_QUEUE" | "UNKNOWN";
  identityState: "VERIFIED" | "UNVERIFIED" | "N/A";
  missingFields: string[];
  timestampValidity: "VALID" | "INVALID" | "MISSING";
}

type DataRecord = Record<string, unknown> & {
  location?: { lat?: unknown; lng?: unknown };
  payload?: { location?: { lat?: unknown; lng?: unknown }; lat?: unknown; lng?: unknown };
  profile?: { displayName?: string; name?: string; phone?: string };
  profileData?: { displayName?: string; name?: string; phone?: string };
  citizenInput?: { name?: string | null };
};

export const calculateDataIntegrity = (item: DataRecord | null | undefined, type: 'crisis' | 'relief' | 'event' | 'user' | 'intelligence'): DataIntegrityMetadata => {
  if (!item) {
    return {
      operationalState: "BLOCKED",
      dataQuality: "MISSING_FIELDS",
      sourceReliability: "LOW",
      lastSyncStatus: "OFFLINE_STALE",
      sourceMode: "UNKNOWN",
      identityState: "UNVERIFIED",
      missingFields: ["ENTIRE_RECORD_MISSING"],
      timestampValidity: "MISSING"
    };
  }

  const i = item as any;
  const missing: string[] = [];
  
  const loc = i.location || {};
  const payload = i.payload || {};
  const payloadLoc = payload.location || {};
  
  const rawLat = i?.lat !== undefined && i?.lat !== null ? i.lat 
    : loc?.lat !== undefined && loc?.lat !== null ? loc.lat 
    : (payloadLoc?.lat !== undefined && payloadLoc?.lat !== null ? payloadLoc.lat : payload?.lat);
    
  const rawLng = i?.lng !== undefined && i?.lng !== null ? i.lng 
    : loc?.lng !== undefined && loc?.lng !== null ? loc.lng 
    : (payloadLoc?.lng !== undefined && payloadLoc?.lng !== null ? payloadLoc.lng : payload?.lng);

  const hasLat = rawLat !== undefined && rawLat !== null;
  const hasLng = rawLng !== undefined && rawLng !== null;

  const name =
    i.profile?.displayName ||
    i.profile?.name ||
    i.profileData?.displayName ||
    i.profileData?.name ||
    i.citizenInput?.name ||
    (typeof i.name === 'string' ? i.name : undefined) ||
    "Unknown";

  if (type === 'crisis') {
    if (!i.title && !i.subType && !i.eventType) missing.push("title");
    if (!i.severity && !i.severityString) missing.push("severity");
    if (!hasLat || !hasLng) missing.push("location(lat/lng)");
    if (i.affectedPopulation === undefined || i.affectedPopulation === null) missing.push("affectedPopulation");
    if (!i.time && !i.timestamp && !i.createdAt) missing.push("timestamp");
  } else if (type === 'relief') {
    if (!i.userId) missing.push("userId");
    if (!i.status) missing.push("status");
    if (!i.description && !i.notes) missing.push("description/notes");
    if (!i.createdAt && !i.updatedAt && !i.timestamp) missing.push("timestamp");
  } else if (type === 'event') {
    if (!i.type && !i.eventType) missing.push("eventType");
    if (!i.status) missing.push("status");
    if (!i.payload && !i.data) missing.push("payload");
    if (!i.timestamp && !i.time && !i.createdAt) missing.push("timestamp");
  } else if (type === 'user') {
    // User docs may store identity nested under `profile` (Firebase Auth enriched)
    // or flat at root. Check both paths to avoid false-positive missing warnings.
    const hasName = i.citizenName || name !== "Unknown" || i.displayName || i.profile?.displayName || i.profile?.name || i.profileData?.displayName || i.profileData?.name;
    const hasPhone = i.phone || i.profile?.phone || i.profileData?.phone;
    if (!hasName) missing.push("name");
    if (!hasPhone) missing.push("phone");
    if (i.riskScore === undefined || i.riskScore === null) missing.push("riskScore");
    if (!i.role) missing.push("role");
  } else if (type === 'intelligence') {
    if (i.fusionScore === undefined || i.fusionScore === null) missing.push("fusionScore");
    if (!i.geoCluster) missing.push("geoCluster");
    if (!i.analysis && !i.keyEvidence) missing.push("analysis/keyEvidence");
  }

  // Data Quality
  let dataQuality: "COMPLETE" | "PARTIAL" | "MISSING_FIELDS" = "COMPLETE";
  if (missing.length > 0) {
    dataQuality = missing.length >= 3 ? "MISSING_FIELDS" : "PARTIAL";
  }

  // Timestamp Validity
  let timestampValidity: "VALID" | "INVALID" | "MISSING" = "VALID";
  const t = i.time || i.timestamp || i.createdAt || i.updatedAt || i.lastActiveAt;
  if (!t) {
    timestampValidity = "MISSING";
  } else {
    const date = t.seconds ? new Date(t.seconds * 1000) : new Date(t);
    if (isNaN(date.getTime())) {
      timestampValidity = "INVALID";
    }
  }

  // Source Mode & Mobile Failure Mode
  let sourceMode: "DIRECT_FIRESTORE" | "MOBILE_DEGRADED" | "DELAYED_QUEUE" | "UNKNOWN" = "DIRECT_FIRESTORE";
  const isMobileSource = i.client === 'mobile' || i.source === 'mobile' || i.isMobileDegraded;
  const isMissingLocation = !hasLat && type !== 'user' && type !== 'intelligence';
  const isStaleLocation = i.stale;
  
  if (isMobileSource && (isMissingLocation || isStaleLocation)) {
    sourceMode = "MOBILE_DEGRADED";
  } else if (i.fromQueue || i.delayed || i.isOfflineSource || type === 'event') {
    sourceMode = "DELAYED_QUEUE";
  }

  // Last Sync Status & Offline/Latency Mode
  let lastSyncStatus: "LIVE_SYNC" | "SYNCING_DELAYED" | "OFFLINE_STALE" = "LIVE_SYNC";
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    lastSyncStatus = "OFFLINE_STALE";
  } else if (timestampValidity === "MISSING" || i.latency > 2000 || i.isDelayedSync) {
    lastSyncStatus = "SYNCING_DELAYED";
  }

  // Operational State
  let operationalState: "READY" | "DEGRADED" | "INCOMPLETE" | "BLOCKED" | "OFFLINE_SOURCE" = "READY";
  if (sourceMode === "DELAYED_QUEUE" || i.isOfflineSource) {
    operationalState = "OFFLINE_SOURCE";
  } else if (dataQuality === "MISSING_FIELDS" || (type === 'crisis' && (!i.title || !i.severity))) {
    operationalState = "BLOCKED";
  } else if ((type === 'crisis' || type === 'relief') && (!hasLat || !hasLng)) {
    operationalState = "INCOMPLETE";
  } else if (dataQuality === "PARTIAL" || sourceMode === "MOBILE_DEGRADED" || lastSyncStatus === "SYNCING_DELAYED") {
    operationalState = "DEGRADED";
  }

  // Source Reliability
  let sourceReliability: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
  if (operationalState === "BLOCKED" || timestampValidity === "INVALID" || lastSyncStatus === "OFFLINE_STALE") {
    sourceReliability = "LOW";
  } else if (operationalState === "DEGRADED" || operationalState === "INCOMPLETE" || sourceMode === "MOBILE_DEGRADED" || lastSyncStatus === "SYNCING_DELAYED") {
    sourceReliability = "MEDIUM";
  }

  // Identity State — citizenInput > profile > name (shared with CrisisCard / ReliefQueue)
  let identityState: "VERIFIED" | "UNVERIFIED" | "N/A" = "N/A";
  if (type === 'user' || type === 'relief' || type === 'crisis') {
    const profileObj = i.profile || i.profileData || i;
    identityState = i.identityState || (isCitizenIdentityVerified(item, profileObj) ? "VERIFIED" : "UNVERIFIED");
  }

  return {
    operationalState,
    dataQuality,
    sourceReliability,
    lastSyncStatus,
    sourceMode,
    identityState,
    missingFields: missing,
    timestampValidity
  };
};

export const DataQualityLayer: React.FC<{ metadata: DataIntegrityMetadata; itemType: string }> = ({ metadata, itemType }) => {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' ? !navigator.onLine : false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  const effectiveSyncStatus = isOffline ? "OFFLINE_STALE" : metadata.lastSyncStatus;
  return (
    <div className="bg-zinc-950/95 border border-zinc-800 rounded-xl p-4 font-mono text-xs space-y-3 shadow-xl my-3 ring-1 ring-white/5">
      {/* Header Bar */}
      <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-zinc-800/80">
        <span className="text-zinc-400 uppercase font-bold tracking-wider flex items-center gap-1.5 text-xs">
          <Activity className="w-4 h-4 text-indigo-400" /> Operational Safety Layer ({itemType})
        </span>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Operational State Badge */}
          <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] border flex items-center gap-1 ${
            metadata.operationalState === 'READY' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
            metadata.operationalState === 'DEGRADED' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse' :
            metadata.operationalState === 'INCOMPLETE' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
            metadata.operationalState === 'OFFLINE_SOURCE' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
            'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-bounce'
          }`}>
            <AlertTriangle className="w-3 h-3" /> STATE: {metadata.operationalState}
          </span>

          {/* Sync Status Badge */}
          <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] border flex items-center gap-1 ${
            effectiveSyncStatus === 'LIVE_SYNC' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
            effectiveSyncStatus === 'SYNCING_DELAYED' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-spin' :
            'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse'
          }`}>
            {effectiveSyncStatus === 'OFFLINE_STALE' ? <WifiOff className="w-3 h-3 text-rose-400" /> : <Wifi className="w-3 h-3 text-emerald-400" />}
            {effectiveSyncStatus}
          </span>
        </div>
      </div>

      {/* Offline / Low Connectivity Alert */}
      {effectiveSyncStatus === 'OFFLINE_STALE' && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5 text-[11px] text-rose-300 flex items-center gap-2 animate-pulse">
          <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
          <div>
            <span className="font-bold uppercase block">OFFLINE OPERATION MODE ACTIVE</span>
            <span className="text-[10px] text-rose-400 block">Rendering last known Firestore snapshot. Real-time updates disabled.</span>
          </div>
        </div>
      )}

      {/* Firestore Latency / Syncing Alert */}
      {effectiveSyncStatus === 'SYNCING_DELAYED' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-[11px] text-amber-300 flex items-center gap-2 animate-pulse">
          <RefreshCw className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
          <div>
            <span className="font-bold uppercase block">FIRESTORE LATENCY MODE (SYNCING STATE)</span>
            <span className="text-[10px] text-amber-400 block">Snapshot data delayed. Affected operational modules marked DEGRADED.</span>
          </div>
        </div>
      )}

      {/* Mobile Failure Mode Alert */}
      {metadata.sourceMode === 'MOBILE_DEGRADED' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-[11px] text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <span className="font-bold uppercase block">MOBILE FAILURE MODE DETECTED</span>
            <span className="text-[10px] text-amber-400 block">Source marked MOBILE_DEGRADED. GPS updates missing/stale. Location unverified.</span>
          </div>
        </div>
      )}

      {/* Grid Telemetry */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
        <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800/80">
          <span className="text-zinc-500 block uppercase text-[9px] mb-0.5">Data Quality</span>
          <span className={`font-bold ${metadata.dataQuality === 'COMPLETE' ? 'text-emerald-400' : metadata.dataQuality === 'PARTIAL' ? 'text-amber-400' : 'text-rose-400'}`}>
            {metadata.dataQuality}
          </span>
        </div>
        <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800/80">
          <span className="text-zinc-500 block uppercase text-[9px] mb-0.5">Source Reliability</span>
          <span className={`font-bold ${metadata.sourceReliability === 'HIGH' ? 'text-indigo-400' : metadata.sourceReliability === 'MEDIUM' ? 'text-amber-400' : 'text-rose-400'}`}>
            {metadata.sourceReliability}
          </span>
        </div>
        <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800/80">
          <span className="text-zinc-500 block uppercase text-[9px] mb-0.5">Identity State</span>
          <span className={`font-bold ${metadata.identityState === 'VERIFIED' ? 'text-emerald-400' : metadata.identityState === 'UNVERIFIED' ? 'text-rose-400' : 'text-zinc-500'}`}>
            {metadata.identityState}
          </span>
        </div>
      </div>

      {/* Missing Fields Warning */}
      {metadata.missingFields.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded p-2 text-[10px] text-amber-300 flex items-start gap-2">
          <FileWarning className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase block mb-0.5">Missing Firestore Fields Detected:</span>
            <span>{metadata.missingFields.join(", ")}</span>
          </div>
        </div>
      )}
    </div>
  );
};
