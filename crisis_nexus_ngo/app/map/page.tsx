"use client";

import React from "react";
import { AuthGuard } from "../../components/AuthGuard";
import { MapOpsLayer } from "../../components/MapOpsLayer";
import { Map } from "lucide-react";

export default function MapPage() {
  return (
    <AuthGuard>
      <div className="space-y-4">
        <div className="pb-4 border-b border-zinc-900">
          <h1 className="text-2xl font-black text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <Map className="w-6 h-6 text-blue-400" />
            Crisis Operations Map
          </h1>
          <p className="text-xs text-zinc-500 font-semibold tracking-wider uppercase mt-1">
            Live Firestore crises, relief_requests, and pending event_queue
          </p>
        </div>
        <div className="h-[calc(100vh-14rem)] min-h-[500px] w-full">
          <MapOpsLayer />
        </div>
      </div>
    </AuthGuard>
  );
}
