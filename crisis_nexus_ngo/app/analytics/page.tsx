"use client";

import React, { useEffect, useState } from "react";
import { AuthGuard } from "../../components/AuthGuard";
import { useAuth } from "../../components/AuthProvider";
import { db } from "../../lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { CrisisData } from "../../components/CrisisCard";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line,
  CartesianGrid,
  Legend
} from "recharts";
import { 
  Loader2, 
  BarChart3, 
  TrendingUp, 
  PieChart as PieIcon, 
  Info,
  AlertOctagon
} from "lucide-react";

import { normalizeCrisis } from "../../lib/normalizeCrisis";

export default function AnalyticsPage() {
  const { authState } = useAuth();
  const [crises, setCrises] = useState<CrisisData[]>([]);
  const [loading, setLoading] = useState(true);

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

    // Listen in real-time
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeCrises: CrisisData[] = [];
      snapshot.forEach((doc) => {
        const normalized = normalizeCrisis({ crisisId: doc.id, ...doc.data() });
        activeCrises.push(normalized as unknown as CrisisData);
      });
      setCrises(activeCrises);
      setLoading(false);
    }, (error) => {
      console.warn("Analytics Firestore sync error on priority query, falling back to orderBy time:", error);
      const fallbackQ = query(crisesRef, orderBy("time", "desc"));
      fallbackUnsub = onSnapshot(fallbackQ, (fallbackSnap) => {
        const activeCrises: CrisisData[] = [];
        fallbackSnap.forEach((doc) => {
          const normalized = normalizeCrisis({ crisisId: doc.id, ...doc.data() });
          activeCrises.push(normalized as unknown as CrisisData);
        });
        setCrises(activeCrises);
        setLoading(false);
      }, (fallbackErr) => {
        console.error("Analytics Fallback query also failed:", fallbackErr);
        setLoading(false);
      });
    });

    return () => {
      unsubscribe();
      if (fallbackUnsub) fallbackUnsub();
    };
  }, [authState]);

  // Process data for charts
  const getSeverityData = () => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    crises.forEach((c) => {
      const sev = c.severityString?.toLowerCase() || (
        c.severity === 5 ? "critical" : (c.severity === 4 ? "high" : (c.severity === 3 ? "medium" : "low"))
      );
      if (sev === "critical") counts.Critical++;
      else if (sev === "high") counts.High++;
      else if (sev === "medium") counts.Medium++;
      else counts.Low++;
    });

    return [
      { name: "Critical", value: counts.Critical, color: "#ef4444" },
      { name: "High", value: counts.High, color: "#f97316" },
      { name: "Medium", value: counts.Medium, color: "#f59e0b" },
      { name: "Low", value: counts.Low, color: "#10b981" },
    ].filter(item => item.value > 0);
  };

  const getImpactHistogramData = () => {
    // Group impact scores in brackets: 0-20, 21-40, 41-60, 61-80, 81-100
    const brackets = [
      { range: "0-20", count: 0 },
      { range: "21-40", count: 0 },
      { range: "41-60", count: 0 },
      { range: "61-80", count: 0 },
      { range: "81-100", count: 0 },
    ];

    crises.forEach((c) => {
      if (typeof c.impactScore !== 'number') return;
      const score = c.impactScore;
      if (score <= 20) brackets[0].count++;
      else if (score <= 40) brackets[1].count++;
      else if (score <= 60) brackets[2].count++;
      else if (score <= 80) brackets[3].count++;
      else brackets[4].count++;
    });

    return brackets;
  };

  const getTimelineData = () => {
    // Sort crises chronologically
    const sorted = [...crises].sort((a, b) => {
      const timeA = a.time?.seconds ? a.time.seconds * 1000 : new Date(a.time).getTime();
      const timeB = b.time?.seconds ? b.time.seconds * 1000 : new Date(b.time).getTime();
      return timeA - timeB;
    });

    // Group active crises accumulated chronologically
    let countAccum = 0;
    const timeline = sorted.map((c) => {
      countAccum++;
      const date = c.time?.seconds 
        ? new Date(c.time.seconds * 1000) 
        : new Date(c.time || Date.now());
      
      const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        time: timeLabel,
        activeIncidents: countAccum,
        impactScore: c.impactScore ?? null
      };
    });

    // If empty, return empty array — no synthetic baseline
    if (timeline.length === 0) {
      return [];
    }

    return timeline;
  };

  const getSignalReliabilityData = () => {
    const counts = { High: 0, Medium: 0, Low: 0 };
    crises.forEach((c) => {
      const conf = c.confidence ?? (c.confidenceScore != null ? c.confidenceScore * 100 : 80);
      const val = conf > 1 ? conf / 100 : conf;
      if (val >= 0.8) counts.High++;
      else if (val >= 0.5) counts.Medium++;
      else counts.Low++;
    });

    return [
      { name: "High [>=80%]", value: counts.High, color: "#10b981" },
      { name: "Medium [50-79%]", value: counts.Medium, color: "#f59e0b" },
      { name: "Low [<50%]", value: counts.Low, color: "#ef4444" },
    ].filter(item => item.value > 0);
  };

  const severityChartData = getSeverityData();
  const histogramData = getImpactHistogramData();
  const timelineData = getTimelineData();
  const reliabilityData = getSignalReliabilityData();

  // Custom tooltips
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="backdrop-blur-md bg-zinc-950/90 border border-zinc-800 p-2.5 rounded-lg text-xs space-y-1 shadow-md font-medium">
          <p className="text-zinc-400 uppercase tracking-wider text-[10px] font-bold">{payload[0].name}</p>
          <p className="text-slate-100 font-bold">Count: <span className="text-blue-400">{payload[0].value}</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <AuthGuard>
      <div className="space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-zinc-900 space-y-3 md:space-y-0">
          <div>
            <h1 className="text-2xl font-black text-slate-100 uppercase tracking-wider">Telemetry Analytics</h1>
            <p className="text-xs text-zinc-500 font-semibold tracking-wider uppercase mt-1">Quantitative Metrics and Threat Distribution</p>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Aggregating Signal Analytics...</span>
          </div>
        ) : crises.length === 0 ? (
          <div className="backdrop-blur-md bg-zinc-900/10 border border-zinc-900 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-full text-zinc-600">
              <AlertOctagon className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-300">No Analytics Available</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">Please ingest active crisis signals to visualize metric distributions.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Chart 1: Severity Distribution Pie */}
            <div className="backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700/80 transition-all duration-300 flex flex-col justify-between h-[380px]">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-900">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-400">
                    <PieIcon className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-black text-slate-200 uppercase tracking-wider">Severity Distribution</h3>
                </div>
                <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Pie distribution</span>
              </div>

              <div className="flex-1 flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-8">
                <div className="w-[180px] h-[180px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                    <PieChart>
                      <Pie
                        data={severityChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {severityChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={customTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend list */}
                <div className="space-y-2 text-xs font-semibold w-full sm:w-auto">
                  {severityChartData.map((entry) => {
                    const pct = Math.round((entry.value / crises.length) * 100);
                    return (
                      <div key={entry.name} className="flex items-center justify-between sm:justify-start sm:space-x-4">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
                          <span className="text-zinc-400">{entry.name}</span>
                        </div>
                        <span className="text-slate-200 font-bold">{entry.value} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Chart 2: Crisis Timeline trends */}
            <div className="backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700/80 transition-all duration-300 flex flex-col justify-between h-[380px]">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-900">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-400">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-black text-slate-200 uppercase tracking-wider">Chronological Active Feed</h3>
                </div>
                <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Accumulation trends</span>
              </div>

              <div className="flex-1 w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                    <XAxis dataKey="time" stroke="#52525b" fontSize={9} tickLine={false} />
                    <YAxis stroke="#52525b" fontSize={9} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a" }}
                      labelStyle={{ color: "#a1a1aa", fontWeight: "bold", fontSize: "10px" }}
                      itemStyle={{ color: "#ef4444", fontSize: "11px", fontWeight: "bold" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                    <Line
                      name="Active Incidents"
                      type="monotone"
                      dataKey="activeIncidents"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 3: Impact Histogram */}
            <div className="backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700/80 transition-all duration-300 flex flex-col justify-between h-[380px]">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-900">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-400">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-black text-slate-220 uppercase tracking-wider">Impact Score Density Histogram</h3>
                </div>
                <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Score density brackets</span>
              </div>

              <div className="flex-1 w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histogramData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                    <XAxis dataKey="range" stroke="#52525b" fontSize={9} tickLine={false} />
                    <YAxis stroke="#52525b" fontSize={9} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a" }}
                      labelStyle={{ color: "#a1a1aa", fontWeight: "bold", fontSize: "10px" }}
                      itemStyle={{ color: "#8b5cf6", fontSize: "11px", fontWeight: "bold" }}
                    />
                    <Bar name="Count in Bracket" dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                      {histogramData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 4: Signal Reliability Distribution */}
            <div className="backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700/80 transition-all duration-300 flex flex-col justify-between h-[380px]">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-900">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-400">
                    <PieIcon className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-black text-slate-200 uppercase tracking-wider">Signal Reliability Distribution</h3>
                </div>
                <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Confidence levels</span>
              </div>

              <div className="flex-1 flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-8">
                <div className="w-[180px] h-[180px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                    <PieChart>
                      <Pie
                        data={reliabilityData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {reliabilityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={customTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend list */}
                <div className="space-y-2 text-xs font-semibold w-full sm:w-auto">
                  {reliabilityData.map((entry) => {
                    const pct = Math.round((entry.value / crises.length) * 100);
                    return (
                      <div key={entry.name} className="flex items-center justify-between sm:justify-start sm:space-x-4">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
                          <span className="text-zinc-400">{entry.name}</span>
                        </div>
                        <span className="text-slate-200 font-bold">{entry.value} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Informative notice */}
        <div className="flex items-start space-x-3 p-4 bg-zinc-900/30 border border-zinc-900 rounded-xl leading-normal text-xs text-zinc-400">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-zinc-300 block">Dynamic telemetry notice</span>
            <span>Analytics aggregate and refresh dynamically in real-time as local emergency vectors populate in your Firestore crises database cluster.</span>
          </div>
        </div>

      </div>
    </AuthGuard>
  );
}
