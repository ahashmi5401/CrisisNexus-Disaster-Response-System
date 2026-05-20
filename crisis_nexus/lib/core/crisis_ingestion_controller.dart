import 'package:flutter/foundation.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:geolocator/geolocator.dart';
import '../services/location_service.dart';
import 'crisis_event_queue.dart';

class CrisisIngestionController {
  static final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Pure controller interface to submit an emergency signal to the event queue.
  /// Zero direct Firestore queries or writes.
  static Future<void> submitEmergencySignal({
    required String type,
    required String severityString,
    required String description,
  }) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw Exception('Security Error: User not authenticated.');
    }

    final sanitizedDescription = _sanitizeInput(description);
    if (sanitizedDescription.isEmpty) {
      throw Exception('Validation Error: Description cannot be empty.');
    }

    debugPrint('[INGESTION CONTROLLER] Generating event wrapper for Emergency Signal.');

    final locationData = await _resolveLocation(user.uid);

    // Safely generate a unique eventId
    final String eventId = FirebaseFirestore.instance.collection('event_logs').doc().id;

    final event = CrisisEvent(
      eventId: eventId,
      type: 'signal',
      timestamp: DateTime.now(),
      payload: {
        'userId': user.uid,
        'userEmail': user.email ?? 'anonymous@crisisnexus.org',
        'crisisType': type,
        'severity': severityString,
        'description': sanitizedDescription,
        'location': locationData,
      },
    );

    // Push directly to the Emergency Distributed Queue
    await CrisisEventQueue.addEvent(event);
  }

  /// Pure controller interface to submit a relief aid request to the event queue.
  /// Zero direct Firestore queries or writes.
  ///
  /// [aidType]  — Primary aid type (always required; used as subType fallback).
  /// [needs]    — Optional list for multi-need submissions. When provided with
  ///              more than one item the full list is sent as payload.needs[].
  ///              Single-need submissions omit this field for full backward
  ///              compatibility with existing crisisProcessor.js single-path logic.
  static Future<void> submitAidRequest({
    required String aidType,
    List<String>? needs,
  }) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw Exception('Security Error: User not authenticated.');
    }

    debugPrint('[INGESTION CONTROLLER] Generating event wrapper for Relief Aid Request.'
        '${needs != null && needs.length > 1 ? " Multi-need: $needs" : ""}');

    final locationData = await _resolveLocation(user.uid);

    // Safely generate a unique eventId
    final String eventId = FirebaseFirestore.instance.collection('event_logs').doc().id;

    // Build payload — include needs[] only when multiple needs are selected.
    // Single-need path remains identical to original for full backward compat.
    final Map<String, dynamic> payload = {
      'userId': user.uid,
      'userEmail': user.email ?? 'anonymous@crisisnexus.org',
      'type': aidType,
      'location': locationData,
    };
    if (needs != null && needs.length > 1) {
      payload['needs'] = needs;
    }

    final event = CrisisEvent(
      eventId: eventId,
      type: 'aid_request',
      timestamp: DateTime.now(),
      payload: payload,
    );

    // Push directly to the Emergency Distributed Queue
    await CrisisEventQueue.addEvent(event);
  }

  static String _sanitizeInput(String input) {
    if (input.isEmpty) return "";
    String clean = input;
    if (clean.length > 500) {
      clean = clean.substring(0, 500);
    }
    // Remove unsafe characters for AI prompt injection protection
    clean = clean
        .replaceAll('{', ' ')
        .replaceAll('}', ' ')
        .replaceAll('[', ' ')
        .replaceAll(']', ' ')
        .replaceAll('"', ' ')
        .replaceAll("'", ' ')
        .replaceAll('\\', ' ');
    return clean.trim();
  }

  static Future<Map<String, dynamic>> _resolveLocation(String uid) async {
    final resolved = await LocationService.resolveIngestionLocation(uid);
    
    String confidence = 'UNKNOWN';
    bool manualDispatch = false;
    double reliabilityScore = 0.0;

    if (resolved.source == 'GPS') {
      confidence = 'HIGH';
      reliabilityScore = 0.9;
    } else if (resolved.source == 'Network') {
      confidence = 'MEDIUM';
      reliabilityScore = 0.7;
    } else if (resolved.source == 'Last Known Fallback') {
      confidence = 'LOW';
      reliabilityScore = 0.4;
    } else if (resolved.source == 'Home Fallback') {
      confidence = 'LOW';
      reliabilityScore = 0.2;
    } else {
      manualDispatch = true;
    }
    
    return {
      'lat': resolved.latitude,
      'lng': resolved.longitude,
      'accuracy': resolved.accuracy ?? 0.0,
      'source': resolved.source,
      'confidence': confidence,
      'reliabilityScore': reliabilityScore,
      'requiresManualDispatch': manualDispatch,
      'timestamp': DateTime.now().toIso8601String(),
    };
  }
}
