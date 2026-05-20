import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class OnboardingGuard {
  /// Enforces global onboarding completeness guard checks for the active screen.
  /// Automatically redirects to '/onboarding' if the user's profile registry is incomplete.
  static Future<void> enforceGuard(BuildContext context) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    try {
      final doc = await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .get();

      if (doc.exists) {
        final data = doc.data() as Map<String, dynamic>;
        final profile = data['profile'] as Map<String, dynamic>? ?? {};
        final displayName = profile['displayName'] as String? ?? '';
        final phone = profile['phone'] as String? ?? '';
        final age = profile['age'];
        final gender = profile['gender'] as String? ?? '';

        if (displayName.isEmpty || phone.isEmpty || age == null || gender.isEmpty) {
          debugPrint('[ONBOARDING GUARD] Incomplete profile detected! Redirecting citizen to /onboarding.');
          if (context.mounted) {
            Navigator.pushNamedAndRemoveUntil(
              context, 
              '/onboarding',
              (route) => false, // Remove all underlying routes to prevent back navigation
            );
          }
        }
      }
    } catch (e) {
      debugPrint('[ONBOARDING GUARD] Telemetry verification warning: $e');
    }
  }
}
