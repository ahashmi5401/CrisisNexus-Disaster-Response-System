import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class ResolvedLocation {
  final double? latitude;
  final double? longitude;
  final double? accuracy;
  final String source; // 'GPS', 'Last Known Fallback', 'Home Fallback', 'None'

  ResolvedLocation({
    this.latitude,
    this.longitude,
    this.accuracy,
    required this.source,
  });
}

class LocationService {
  static StreamSubscription<Position>? _positionStreamSubscription;
  static Timer? _periodicTimer;
  static DateTime? _lastWriteTime;

  /// Check permissions and request if necessary.
  /// Returns true if permission is granted, false otherwise.
  static Future<bool> requestPermission() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        debugPrint('[LOCATION SERVICE] GPS hardware service is disabled.');
        return false;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          debugPrint('[LOCATION SERVICE] Location permission denied by user.');
          return false;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        debugPrint('[LOCATION SERVICE] Location permission denied permanently.');
        return false;
      }

      debugPrint('[LOCATION SERVICE] Location permission GRANTED.');
      return true;
    } catch (e) {
      debugPrint('[LOCATION SERVICE] Permission check failed: $e');
      return false;
    }
  }

  /// Get the current high-accuracy single fix location safely.
  /// Returns null if location is disabled or permission is denied.
  static Future<Position?> getCurrentLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        debugPrint('[LOCATION SERVICE] GPS hardware disabled. Returning null.');
        return null;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        debugPrint('[LOCATION SERVICE] No permission. Returning null.');
        return null;
      }

      return await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 5),
      );
    } catch (e) {
      debugPrint('[LOCATION SERVICE] Error fetching single fix position: $e');
      return null;
    }
  }

  /// Resolves the user's location using the strict production fallback cascade:
  /// 1. Real GPS Lock
  /// 2. Profile `lastKnown` location (cached in Firestore)
  /// 3. Profile `home` location (onboarding anchor in Firestore)
  /// 4. Null (if all systems fail)
  static Future<ResolvedLocation> resolveIngestionLocation(String uid) async {
    debugPrint('[LOCATION SERVICE] Resolving ingestion location for user: $uid');
    
    // Step 1: Real GPS Lock
    try {
      final position = await getCurrentLocation();
      if (position != null) {
        debugPrint('[LOCATION SERVICE] GPS Lock Successful.');
        return ResolvedLocation(
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
          source: 'GPS',
        );
      } else {
        // Fallback to low accuracy network location
        final networkPosition = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.low,
          timeLimit: const Duration(seconds: 3),
        );
        debugPrint('[LOCATION SERVICE] Network Lock Successful.');
        return ResolvedLocation(
          latitude: networkPosition.latitude,
          longitude: networkPosition.longitude,
          accuracy: networkPosition.accuracy,
          source: 'Network',
        );
      }
    } catch (e) {
      debugPrint('[LOCATION SERVICE] GPS/Network Lock failed or unavailable: $e');
    }

    // Step 2 & 3: Query Firestore user profile
    try {
      final doc = await FirebaseFirestore.instance.collection('users').doc(uid).get();
      if (doc.exists) {
        final data = doc.data();
        final loc = data?['location'] as Map<String, dynamic>?;
        if (loc != null) {
          // Check lastKnown
          if (loc['lastKnownLat'] != null && loc['lastKnownLng'] != null) {
            debugPrint('[LOCATION SERVICE] Falling back to Last Known location.');
            return ResolvedLocation(
              latitude: (loc['lastKnownLat'] as num).toDouble(),
              longitude: (loc['lastKnownLng'] as num).toDouble(),
              source: 'Last Known Fallback',
            );
          }
          // Check home
          if (loc['homeLat'] != null && loc['homeLng'] != null) {
            debugPrint('[LOCATION SERVICE] Falling back to Home location.');
            return ResolvedLocation(
              latitude: (loc['homeLat'] as num).toDouble(),
              longitude: (loc['homeLng'] as num).toDouble(),
              source: 'Home Fallback',
            );
          }
        }
      }
    } catch (e) {
      debugPrint('[LOCATION SERVICE] Fallback database query failed: $e');
    }

    debugPrint('[LOCATION SERVICE] Zero coordinates could be resolved.');
    return ResolvedLocation(
      source: 'unknown',
    );
  }

  /// Helper to update location in firestore with throttle safety
  static Future<void> _updateFirestoreLocation(String uid, double lat, double lng) async {
    final now = DateTime.now();
    if (_lastWriteTime != null && now.difference(_lastWriteTime!) < const Duration(seconds: 30)) {
      debugPrint('[LOCATION SERVICE] Firestore write throttled to protect battery and database load.');
      return;
    }

    _lastWriteTime = now;
    debugPrint('[LOCATION SERVICE] Syncing live coordinates to users/$uid: Lat: $lat, Lng: $lng');

    await FirebaseFirestore.instance.collection('users').doc(uid).update({
      'location.lastKnownLat': lat,
      'location.lastKnownLng': lng,
      'location.updatedAt': FieldValue.serverTimestamp(),
    }).catchError((err) {
      debugPrint('[LOCATION SERVICE] Failed to update coordinate sync: $err');
    });
  }

  /// Start live continuous background tracking and store in firestore users/{uid} collection.
  /// Battery-optimized using distance-based triggers (10 meters) and time-based throttling (30-60s).
  static void startLiveTracking(String uid) async {
    // Prevent overlapping stream listeners and timers
    await stopLiveTracking();

    bool hasPermission = await requestPermission();
    if (!hasPermission) {
      debugPrint('[LOCATION SERVICE] Cannot start live tracking: permission denied.');
      return;
    }

    debugPrint('[LOCATION SERVICE] Starting live location tracking loop for user: $uid');

    try {
      // 1. Setup distance-based geolocator listener (triggers when user moves > 10m)
      const locationSettings = LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      );

      _positionStreamSubscription = Geolocator.getPositionStream(
        locationSettings: locationSettings,
      ).listen(
        (Position position) {
          debugPrint('[LOCATION SERVICE] Distance-based Trigger (moved > 10m)');
          _updateFirestoreLocation(uid, position.latitude, position.longitude);
        },
        onError: (error) {
          debugPrint('[LOCATION SERVICE] Position stream error observed: $error');
        },
        cancelOnError: false,
      );

      // 2. Setup periodic time-based update (every 45 seconds to keep dashboard fresh even if stationary)
      _periodicTimer = Timer.periodic(const Duration(seconds: 45), (timer) async {
        debugPrint('[LOCATION SERVICE] Time-based Trigger (every 45 seconds)');
        final position = await getCurrentLocation();
        if (position != null) {
          _updateFirestoreLocation(uid, position.latitude, position.longitude);
        }
      });

    } catch (e) {
      debugPrint('[LOCATION SERVICE] Fatal exception in startLiveTracking: $e');
    }
  }

  /// Stop the active position stream listener to save battery and system resources.
  static Future<void> stopLiveTracking() async {
    if (_positionStreamSubscription != null) {
      debugPrint('[LOCATION SERVICE] Stopping live location tracking listener.');
      await _positionStreamSubscription!.cancel();
      _positionStreamSubscription = null;
    }
    if (_periodicTimer != null) {
      debugPrint('[LOCATION SERVICE] Stopping live location tracking periodic timer.');
      _periodicTimer!.cancel();
      _periodicTimer = null;
    }
  }
}
