import React from "react";

interface SeverityBadgeProps {
  severity?: number | string;
  severityString?: string;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, severityString }) => {
  const getSeverityString = (): string => {
    if (severityString) return severityString.toLowerCase();
    if (typeof severity === "string") return severity.toLowerCase();
    if (typeof severity === "number") {
      switch (severity) {
        case 5: return "critical";
        case 4: return "high";
        case 3: return "medium";
        case 2: return "low";
        case 1: return "low";
        default: return "medium";
      }
    }
    return "medium";
  };

  const normalizedSeverity = getSeverityString();

  const getStyles = () => {
    switch (normalizedSeverity) {
      case "critical":
        return "bg-rose-950/40 text-rose-400 border-rose-900/60 shadow-[0_0_10px_rgba(244,63,94,0.1)]";
      case "high":
        return "bg-orange-950/40 text-orange-400 border-orange-900/60 shadow-[0_0_10px_rgba(249,115,22,0.05)]";
      case "medium":
        return "bg-amber-950/40 text-amber-400 border-amber-900/60";
      case "low":
        return "bg-emerald-950/40 text-emerald-400 border-emerald-900/60";
      default:
        return "bg-zinc-800/40 text-zinc-400 border-zinc-700/60";
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStyles()} uppercase tracking-wider`}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current animate-pulse"></span>
      {normalizedSeverity}
    </span>
  );
};
