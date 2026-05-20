"use client";

import React, { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import { AlertTriangle, Info, Bell, X } from "lucide-react";
import { useAuth } from "./AuthProvider";

interface AlertData {
  id: string;
  message: string;
  targetRole: string;
  createdBy: string;
  createdAt: { seconds?: number } | string | number | null;
  isActive: boolean;
  severity?: "info" | "warning" | "critical";
}

export function GlobalAlertBanner() {
  const { authState, operatorProfile } = useAuth();
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (authState !== "authenticated") return;

    const alertsRef = collection(db, "alerts");
    const q = query(
      alertsRef,
      where("isActive", "==", true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeAlerts: AlertData[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        
        // Filter by role: show if ALL, or if matches operator profile role
        const target = data.targetRole || "ALL";
        const userRole = operatorProfile?.role || "observer";

        if (target === "ALL" || target === userRole) {
          activeAlerts.push({
            id: doc.id,
            message: data.message || "",
            targetRole: data.targetRole || "ALL",
            createdBy: data.createdBy || "",
            createdAt: data.createdAt,
            isActive: data.isActive ?? true,
            severity: data.severity,
          });
        }
      });
      
      // Sort in memory since we didn't index isActive + createdAt
      activeAlerts.sort((a, b) => {
        const timeA = (a.createdAt as any)?.seconds || (typeof a.createdAt === 'number' ? a.createdAt : 0);
        const timeB = (b.createdAt as any)?.seconds || (typeof b.createdAt === 'number' ? b.createdAt : 0);
        return timeB - timeA;
      });

      setAlerts(activeAlerts);
    });

    return () => unsubscribe();
  }, [authState, operatorProfile?.role]);

  const handleDismiss = (id: string) => {
    setDismissedAlerts((prev) => new Set(prev).add(id));
  };

  const visibleAlerts = alerts.filter(a => !dismissedAlerts.has(a.id));

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="w-full flex flex-col z-50 sticky top-0">
      {visibleAlerts.map((alert) => (
        <div 
          key={alert.id} 
          className="w-full bg-red-500/90 backdrop-blur-md text-white px-4 py-3 flex items-center justify-between border-b border-red-600/50 shadow-lg"
        >
          <div className="flex items-center gap-3 max-w-7xl mx-auto w-full">
            <div className="flex items-center justify-center bg-white/20 p-2 rounded-full">
              <Bell className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-wide uppercase text-white/90">
                {alert.targetRole === "ALL" ? "SYSTEM BROADCAST" : `${alert.targetRole.replace("_", " ")} ALERT`}
              </span>
              <p className="text-white font-medium">
                {alert.message}
              </p>
            </div>
            <button 
              onClick={() => handleDismiss(alert.id)}
              className="ml-auto p-1 hover:bg-white/20 rounded-full transition-colors text-white/80 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
