import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/location_service.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({Key? key}) : super(key: key);

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _displayNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _ageController = TextEditingController();

  String? _selectedGender;
  final List<String> _genders = ['Male', 'Female', 'Other'];

  bool _locationEnabled = false;
  bool _notificationEnabled = false;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _displayNameController.dispose();
    _phoneController.dispose();
    _ageController.dispose();
    super.dispose();
  }

  Future<void> _submitOnboarding() async {
    if (!_formKey.currentState!.validate()) return;

    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Session mismatch. Please sign in.'),
          backgroundColor: Color(0xFFFD3C5B),
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final String displayName = _displayNameController.text.trim();
      final String phone = _phoneController.text.trim();
      final int age = int.parse(_ageController.text.trim());
      final String gender = _selectedGender!;

      double? lat;
      double? lng;

      if (_locationEnabled) {
        final hasPermission = await LocationService.requestPermission();
        if (hasPermission) {
          final position = await LocationService.getCurrentLocation();
          if (position != null) {
            lat = position.latitude;
            lng = position.longitude;
          }
        }
      }

      // Update ONLY non-system-controlled profile layers (completely bypassing stats)
      await FirebaseFirestore.instance.collection('users').doc(user.uid).update({
        'profile.displayName': displayName,
        'profile.phone': phone,
        'profile.age': age,
        'profile.gender': gender,
        'permissions.locationEnabled': _locationEnabled,
        'permissions.notificationEnabled': _notificationEnabled,
        'location.lastKnownLat': lat,
        'location.lastKnownLng': lng,
        'location.homeLat': lat,
        'location.homeLng': lng,
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Onboarding profile verified!'),
            backgroundColor: Color(0xFF34C759),
          ),
        );
        Navigator.pushReplacementNamed(context, '/home');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Verification failed: $e'),
            backgroundColor: const Color(0xFFFD3C5B),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0B10),
      body: Stack(
        children: [
          // Background ambient soft glow
          Positioned(
            top: -100,
            left: -50,
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF007AFF).withOpacity(0.08),
                    blurRadius: 100,
                    spreadRadius: 40,
                  ),
                ],
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Premium logo & headers
                      Center(
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: const Color(0xFF161922),
                            border: Border.all(
                              color: const Color(0xFF007AFF).withOpacity(0.2),
                              width: 1,
                            ),
                          ),
                          child: Image.asset(
                            'assets/crisisnexus-loader.png',
                            width: 52,
                            height: 52,
                            fit: BoxFit.contain,
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      const Text(
                        'INITIALIZE CITIZEN NODE',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.5,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Complete your profile registries to gain full telemetry clearance and establish security keys.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.white.withOpacity(0.4),
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 32),

                      // Profile Details Form Box
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: const Color(0xFF161922),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: Colors.white.withOpacity(0.06),
                            width: 1,
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'IDENTIFICATION PARAMETERS',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.0,
                                color: Colors.white.withOpacity(0.4),
                              ),
                            ),
                            const SizedBox(height: 20),

                            // Full Name Input
                            TextFormField(
                              controller: _displayNameController,
                              style: const TextStyle(color: Colors.white),
                              decoration: const InputDecoration(
                                labelText: 'Display Name',
                                prefixIcon: Icon(Icons.person_outline_rounded),
                              ),
                              validator: (val) {
                                if (val == null || val.trim().isEmpty) {
                                  return 'Display name is required';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),

                             // Phone Number Input
                            TextFormField(
                              controller: _phoneController,
                              keyboardType: TextInputType.phone,
                              style: const TextStyle(color: Colors.white),
                              decoration: const InputDecoration(
                                labelText: 'Phone Registry',
                                prefixIcon: Icon(Icons.phone_rounded),
                              ),
                              validator: (val) {
                                if (val == null || val.trim().isEmpty) {
                                  return 'Phone registry is required';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),

                            // Age Input
                            TextFormField(
                              controller: _ageController,
                              keyboardType: TextInputType.number,
                              style: const TextStyle(color: Colors.white),
                              decoration: const InputDecoration(
                                labelText: 'Age Coefficient',
                                prefixIcon: Icon(Icons.cake_rounded),
                              ),
                              validator: (val) {
                                if (val == null || val.trim().isEmpty) {
                                  return 'Age parameter is required';
                                }
                                if (int.tryParse(val) == null) {
                                  return 'Must be a valid number';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),

                            // Gender Dropdown
                            DropdownButtonFormField<String>(
                              value: _selectedGender,
                              dropdownColor: const Color(0xFF161922),
                              style: const TextStyle(color: Colors.white),
                              decoration: const InputDecoration(
                                labelText: 'Select Gender',
                                prefixIcon: Icon(Icons.transgender_rounded),
                              ),
                              items: _genders.map((g) {
                                return DropdownMenuItem<String>(
                                  value: g,
                                  child: Text(g, style: const TextStyle(color: Colors.white)),
                                );
                              }).toList(),
                              onChanged: (val) => setState(() => _selectedGender = val),
                              validator: (val) => val == null ? 'Please select a gender' : null,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Permissions Box
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: const Color(0xFF161922),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: Colors.white.withOpacity(0.06),
                            width: 1,
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'COMMUNICATION & TELEMETRY clearances',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.0,
                                color: Colors.white.withOpacity(0.4),
                              ),
                            ),
                            const SizedBox(height: 12),

                            // Location Permission
                            SwitchListTile(
                              activeColor: const Color(0xFF007AFF),
                              contentPadding: EdgeInsets.zero,
                              title: const Text(
                                'Real-Time Location Registry',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                              subtitle: Text(
                                'Grants GPS locking to report crises in real time.',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.white.withOpacity(0.4),
                                ),
                              ),
                              value: _locationEnabled,
                              onChanged: (val) => setState(() => _locationEnabled = val),
                            ),

                            const Divider(color: Colors.white10),

                            // Notification Permission
                            SwitchListTile(
                              activeColor: const Color(0xFF007AFF),
                              contentPadding: EdgeInsets.zero,
                              title: const Text(
                                'Vitals Broadcast Notifications',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                              subtitle: Text(
                                'Authorize security and evacuation warning broadcasts.',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.white.withOpacity(0.4),
                                ),
                              ),
                              value: _notificationEnabled,
                              onChanged: (val) => setState(() => _notificationEnabled = val),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 32),

                      // Submit button
                      _isSubmitting
                          ? const Center(
                              child: CircularProgressIndicator(
                                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF007AFF)),
                              ),
                            )
                          : ElevatedButton(
                              onPressed: _submitOnboarding,
                              child: const Text('INITIALIZE PROFILE NODE'),
                            ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
