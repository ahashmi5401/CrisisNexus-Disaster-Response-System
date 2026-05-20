"use client";

import React, { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./AuthProvider";
import { Send, AlertCircle, XCircle } from "lucide-react";

interface AlertRecord {
  id: string;
  message?: string;
  targetRole?: string;
  createdBy?: string;
  createdAt?: unknown;
  isActive?: boolean;
}

export function CoordinatorAlertPanel() {
  const { authState, operatorProfile } = useAuth();
  const [message, setMessage] = useState("");
  const [targetRole, setTargetRole] = useState("ALL");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<AlertRecord[]>([]);

  useEffect(() => {
    if (authState !== "authenticated" || operatorProfile?.role !== "coordinator") return;

    const q = query(collection(db, "alerts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alerts: AlertRecord[] = [];
      snapshot.forEach(doc => {
        alerts.push({ id: doc.id, ...(doc.data() as Omit<AlertRecord, "id">) });
      });
      setActiveAlerts(alerts.filter(a => a.isActive));
    });

    return () => unsubscribe();
  }, [authState, operatorProfile]);

  if (operatorProfile?.role !== "coordinator") return null;

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      setIsSubmitting(true);
      await addDoc(collection(db, "alerts"), {
        message: message.trim(),
        targetRole,
        createdBy: operatorProfile?.email || "Coordinator",
        createdAt: serverTimestamp(),
        isActive: true,
      });
      setMessage("");
    } catch (err) {
      console.error("Failed to broadcast alert:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await updateDoc(doc(db, "alerts", id), {
        isActive: false
      });
    } catch (err) {
      console.error("Failed to deactivate alert:", err);
    }
  };

  const handleDeactivateAll = async () => {
    try {
      const batchPromises = activeAlerts.map(alert => 
        updateDoc(doc(db, "alerts", alert.id), { isActive: false })
      );
      await Promise.all(batchPromises);
    } catch (err) {
      console.error("Failed to deactivate all alerts:", err);
    }
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-xl">
      <div className="flex items-center space-x-2 border-b border-zinc-900 pb-3">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider">Global Communications Broadcast</h2>
      </div>

      <form onSubmit={handleBroadcast} className="flex flex-col md:flex-row gap-3">
        <input 
          type="text" 
          placeholder="ENTER BROADCAST MESSAGE..." 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-red-500/50 focus:outline-none transition-colors font-medium"
        />
        <select
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:border-red-500/50 focus:outline-none transition-colors font-bold uppercase tracking-wider"
        >
          <option value="ALL">ALL DEPARTMENTS</option>
          <option value="medical_team">MEDICAL TEAM</option>
          <option value="rescue">RESCUE SQUAD</option>
          <option value="logistics">LOGISTICS CORE</option>
          <option value="citizens">CITIZENS / PUBLIC</option>
        </select>
        <button 
          type="submit"
          disabled={isSubmitting || !message.trim()}
          className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-xl font-bold uppercase tracking-wider text-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>Broadcast</span>
          <Send className="w-4 h-4" />
        </button>
      </form>

      {activeAlerts.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between items-center border-b border-zinc-900 pb-2 mb-2">
            <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Active Broadcasts</h3>
            <button 
              type="button"
              onClick={handleDeactivateAll}
              className="text-[10px] font-black text-red-500 hover:text-red-400 uppercase tracking-wider transition-colors flex items-center space-x-1"
            >
              <span>Deactivate All ({activeAlerts.length})</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeAlerts.map(alert => (
              <div key={alert.id} className="bg-red-950/20 border border-red-900/40 rounded-xl p-3 flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">
                    TARGET: {alert.targetRole?.replace("_", " ") || "ALL"}
                  </span>
                  <p className="text-xs text-zinc-300 font-medium">{alert.message}</p>
                </div>
                <button 
                  type="button"
                  onClick={() => handleDeactivate(alert.id)}
                  title="Deactivate Broadcast"
                  className="text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
