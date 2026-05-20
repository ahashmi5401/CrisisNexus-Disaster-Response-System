import React from "react";

interface StatsCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  trend?: string;
  trendType?: "up" | "down" | "neutral";
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  description,
  icon,
  trend,
  trendType = "neutral",
}) => {
  const getTrendColor = () => {
    if (trendType === "up") return "text-emerald-400 bg-emerald-950/30 border border-emerald-900/40";
    if (trendType === "down") return "text-red-400 bg-red-950/30 border border-red-900/40";
    return "text-zinc-400 bg-zinc-800/30 border border-zinc-700/40";
  };

  return (
    <div className="relative overflow-hidden backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700/80 transition-all duration-300">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-500/5 to-transparent rounded-bl-full pointer-events-none"></div>
      
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{title}</span>
          <div className="text-2xl font-bold text-slate-100 tracking-tight">{value}</div>
        </div>
        <div className="p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-400 shadow-inner">
          {icon}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-zinc-400 font-normal">{description}</span>
        {trend && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getTrendColor()}`}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
};
