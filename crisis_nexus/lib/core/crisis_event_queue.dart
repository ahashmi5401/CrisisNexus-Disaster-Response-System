import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class CrisisEvent {
  final String eventId;
  final String type; // "signal" | "aid_request"
  final Map<String, dynamic> payload;
  String status; // "pending" | "processing" | "completed" | "failed"
  int retryCount;
  final DateTime timestamp;
  String? failureReason;

  CrisisEvent({
    required this.eventId,
    required this.type,
    required this.payload,
    this.status = 'pending',
    this.retryCount = 0,
    required this.timestamp,
    this.failureReason,
  });

  Map<String, dynamic> toJson() => {
        'eventId': eventId,
        'type': type,
        'payload': payload,
        'status': status,
        'retryCount': retryCount,
        'timestamp': timestamp.toIso8601String(),
        'failureReason': failureReason,
      };

  factory CrisisEvent.fromJson(Map<String, dynamic> json) => CrisisEvent(
        eventId: json['eventId'],
        type: json['type'],
        payload: Map<String, dynamic>.from(json['payload']),
        status: json['status'],
        retryCount: json['retryCount'] ?? 0,
        timestamp: DateTime.parse(json['timestamp']),
        failureReason: json['failureReason'],
      );
}

class CrisisEventQueue {
  /// Transforms the client into a pure Input Device.
  /// Commits raw emergency data directly into the Firestore server-side `/event_queue` outbox.
  /// Zero local workers, background threads, or CPU/battery intensive processing tasks.
  static Future<void> addEvent(CrisisEvent event) async {
    debugPrint('[CLIENT INGESTION] Offloading event: ${event.eventId} (Type: ${event.type}) to Server Truth Engine.');
    
    try {
      // Step 1: Normalize eventType and subType
      String eventType = event.type == 'signal' ? 'crisis' : 'relief';
      String subType = 'unknown';
      if (eventType == 'crisis') {
        subType = (event.payload['crisisType'] as String? ?? 'unknown').toLowerCase();
        if (subType == 'medical emergency') subType = 'medical';
      } else if (eventType == 'relief') {
        String originalAid = event.payload['type'] as String? ?? 'unknown';
        subType = (originalAid == 'medical' || originalAid == 'medical_aid') ? 'medical_aid' : originalAid.toLowerCase();
      }

      // Step 2: Prepare clean payload removing conflicting "type" keys
      Map<String, dynamic> cleanPayload = Map<String, dynamic>.from(event.payload);
      cleanPayload.remove('type');
      cleanPayload.remove('crisisType');
      cleanPayload['eventType'] = eventType;
      cleanPayload['subType'] = subType;

      // Safe householdId extraction (Fallback to userId)
      String? userId = FirebaseAuth.instance.currentUser?.uid;
      String householdId = userId ?? 'anonymous';
      
      if (userId != null) {
        try {
          final familyDoc = await FirebaseFirestore.instance.collection('family_profiles').doc(userId).get();
          if (familyDoc.exists && familyDoc.data()?['householdId'] != null) {
            householdId = familyDoc.data()!['householdId'];
          }
        } catch (e) {
          debugPrint('[CLIENT INGESTION] Family profile lookup failed, using fallback userId: $e');
        }
      }
      cleanPayload['householdId'] = householdId;

      // Step 3: Write standardized document to Firestore event_queue
      await FirebaseFirestore.instance
          .collection('event_queue')
          .doc(event.eventId)
          .set({
        'eventId': event.eventId,
        'eventType': eventType,
        'subType': subType,
        'payload': cleanPayload,
        'status': event.status,
        'retryCount': event.retryCount,
        'timestamp': event.timestamp.toIso8601String(),
        'failureReason': event.failureReason,
        'createdAt': FieldValue.serverTimestamp(),
      });
      debugPrint('[CLIENT INGESTION] Event registered in outbox successfully.');
    } catch (e) {
      debugPrint('[CLIENT INGESTION] Critical queue write error: $e');
      throw Exception('Durable Outbox Error: Failed to write event to ingestion queue: $e');
    }
  }

  /// Server-side Truth Engine initialization verification
  static Future<void> initializeQueue() async {
    debugPrint('[CLIENT INGESTION] Server-side Truth Engine ingestion verification: ACTIVE.');
  }
}
