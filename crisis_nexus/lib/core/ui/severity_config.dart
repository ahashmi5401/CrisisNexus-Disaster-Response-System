import 'package:flutter/material.dart';

class SeverityConfig {
  static const Color criticalColor = Color(0xFFFD3C5B);
  static const Color highColor = Color(0xFFFF9500);
  static const Color mediumColor = Color(0xFFFFD60A);
  static const Color lowColor = Color(0xFF34C759);
  static const Color defaultColor = Color(0xFF007AFF);

  static Color getColor(String? severity) {
    if (severity == null) return defaultColor;
    switch (severity.toLowerCase()) {
      case 'critical':
        return criticalColor;
      case 'high':
        return highColor;
      case 'medium':
        return mediumColor;
      case 'low':
        return lowColor;
      default:
        return defaultColor;
    }
  }

  static double getCircleOpacity(String? severity) {
    if (severity == null) return 0.20;
    switch (severity.toLowerCase()) {
      case 'critical':
        return 0.30;
      case 'high':
        return 0.25;
      case 'medium':
        return 0.20;
      case 'low':
        return 0.15;
      default:
        return 0.20;
    }
  }

  static double getRadiusKm(dynamic radiusVal, String? severity) {
    if (radiusVal != null) {
      if (radiusVal is num) {
        final double val = radiusVal.toDouble();
        if (val > 0) return val;
      }
    }
    // Backward compatibility: derive client-side from severity if missing/invalid
    if (severity == null) return 3.0;
    switch (severity.toLowerCase()) {
      case 'critical':
        return 8.0;
      case 'high':
        return 5.0;
      case 'medium':
        return 3.0;
      case 'low':
        return 1.5;
      default:
        return 3.0;
    }
  }

  static String parseSeverity(dynamic rawSeverity) {
    if (rawSeverity is String) {
      return rawSeverity;
    } else if (rawSeverity is num) {
      int sevInt = rawSeverity.toInt();
      if (sevInt <= 2) return 'Low';
      if (sevInt == 3) return 'Medium';
      if (sevInt == 4) return 'High';
      return 'Critical';
    }
    return 'Medium';
  }

  static String getLabel(String? severity) {
    if (severity == null) return 'UNKNOWN';
    return severity.toUpperCase();
  }
}
