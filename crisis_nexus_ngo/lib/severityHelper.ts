/**
 * Normalizes mixed severity inputs (strings, numbers, mixed case) into standard NATO threat levels:
 * LOW | MEDIUM | HIGH | CRITICAL
 */
export const normalizeSeverity = (val: unknown): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "NEEDS_VERIFICATION" => {
  if (val === null || val === undefined) return "LOW";
  
  const str = String(val).toUpperCase().trim();
  
  if (str === "UNKNOWN" || str === "NEEDS_VERIFICATION") {
    return "NEEDS_VERIFICATION";
  }
  if (str === "5" || str === "CRITICAL" || str === "SEVERE" || str === "FATAL") {
    return "CRITICAL";
  }
  if (str === "4" || str === "HIGH" || str === "MAJOR" || str === "URGENT") {
    return "HIGH";
  }
  if (str === "3" || str === "MEDIUM" || str === "MODERATE" || str === "2") {
    return "MEDIUM";
  }
  return "LOW";
};

export const getSeverityColor = (sev: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "NEEDS_VERIFICATION"): string => {
  switch (sev) {
    case "CRITICAL": return "#f43f5e"; // Rose / Red
    case "HIGH": return "#f97316"; // Orange
    case "MEDIUM": return "#eab308"; // Amber / Yellow
    case "LOW": return "#3b82f6"; // Blue
    case "NEEDS_VERIFICATION": return "#71717a"; // Zinc / Gray
  }
};
