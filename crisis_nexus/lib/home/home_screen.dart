import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/location_service.dart';
import '../core/onboarding_guard.dart';
import '../core/citizen_alert_banner.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  bool _checkingOnboarding = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _checkOnboarding();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    LocationService.stopLiveTracking();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.detached) {
      LocationService.stopLiveTracking();
    } else if (state == AppLifecycleState.resumed) {
      final user = FirebaseAuth.instance.currentUser;
      if (user != null) {
        // startLiveTracking handles permission checks internally safely
        LocationService.startLiveTracking(user.uid);
      }
    }
  }

  Future<void> _checkOnboarding() async {
    await OnboardingGuard.enforceGuard(context);
    
    final user = FirebaseAuth.instance.currentUser;
    if (user != null) {
      final userDoc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        final data = userDoc.data();
        final permissions = data?['permissions'] as Map<String, dynamic>?;
        final locationEnabled = permissions?['locationEnabled'] == true;
        if (locationEnabled) {
          LocationService.startLiveTracking(user.uid);
        }
      }
    }

    if (mounted) {
      setState(() => _checkingOnboarding = false);
    }
  }

  void _logout(BuildContext context) async {
    await LocationService.stopLiveTracking();
    await FirebaseAuth.instance.signOut();
    if (context.mounted) {
      Navigator.pushReplacementNamed(context, '/login'); // Return to login
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checkingOnboarding) {
      return const Scaffold(
        backgroundColor: Color(0xFF0A0B10),
        body: Center(
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF007AFF)),
          ),
        ),
      );
    }
    return CitizenAlertListener(
      child: Scaffold(
      backgroundColor: const Color(0xFF0A0B10),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(4),
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Color(0xFF161922),
              ),
              child: Image.asset(
                'assets/crisisnexus-loader.png',
                width: 24,
                height: 24,
                fit: BoxFit.contain,
              ),
            ),
            const SizedBox(width: 8),
            const Text(
              'CrisisNexus',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 18,
                letterSpacing: 1.0,
              ),
            ),
          ],
        ),
        actions: [
          StreamBuilder<int>(
            stream: FirebaseFirestore.instance
                .collection('event_queue')
                .where('payload.userId', isEqualTo: FirebaseAuth.instance.currentUser?.uid)
                .snapshots(includeMetadataChanges: true)
                .map((snapshot) {
                  int count = 0;
                  for (var doc in snapshot.docs) {
                    if (doc.metadata.hasPendingWrites) {
                      count++;
                    }
                  }
                  return count;
                }),
            builder: (context, snapshot) {
              final count = snapshot.data ?? 0;
              if (count == 0) return const SizedBox.shrink();
              return Container(
                margin: const EdgeInsets.only(right: 8),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF9500).withOpacity(0.15),
                  border: Border.all(color: const Color(0xFFFF9500).withOpacity(0.4)),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(
                      width: 10,
                      height: 10,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFFF9500)),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'PENDING SYNC ($count)',
                      style: const TextStyle(
                        color: Color(0xFFFF9500),
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          IconButton(
            icon: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withOpacity(0.04),
                border: Border.all(color: Colors.white.withOpacity(0.08)),
              ),
              child: const Icon(Icons.logout_rounded, size: 16, color: Color(0xFFFD3C5B)),
            ),
            onPressed: () => _logout(context),
            tooltip: 'Logout',
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Stack(
        children: [
          // Background soft ambient glow
          Positioned(
            top: 40,
            left: -50,
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF007AFF).withOpacity(0.08),
                    blurRadius: 80,
                    spreadRadius: 40,
                  ),
                ],
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Premium interactive Welcome Banner
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          const Color(0xFF1A1F2C),
                          const Color(0xFF12141C),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: const Color(0xFF007AFF).withOpacity(0.2),
                        width: 1.5,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF007AFF).withOpacity(0.06),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                color: Color(0xFF34C759),
                                boxShadow: [
                                  BoxShadow(
                                    color: Color(0xFF34C759),
                                    blurRadius: 8,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Text(
                              'RESPONSE NETWORK ACTIVE',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.5,
                                color: Color(0xFF34C759),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Citizen Portal',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Select a utility below to report crisis nodes or request resources.',
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.white.withOpacity(0.5),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),
                  // Coordinator Broadcast Alerts for Citizens
                  const CitizenAlertBanner(),

                  const Text(
                    'UTILITY SUITE',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.5,
                      color: Color(0xFF007AFF),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          GridView.count(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            crossAxisCount: 2,
                            crossAxisSpacing: 16,
                            mainAxisSpacing: 16,
                            childAspectRatio: 1.05,
                            children: [
                              _buildNavCard(
                                context: context,
                                title: 'Report Emergency',
                                icon: Icons.warning_amber_rounded,
                                color: const Color(0xFFFD3C5B),
                                description: 'Broadcast active threats',
                                routeName: '/report',
                              ),
                              _buildNavCard(
                                context: context,
                                title: 'Request Aid',
                                icon: Icons.health_and_safety_rounded,
                                color: const Color(0xFF007AFF),
                                description: 'Acquire resources',
                                routeName: '/request_aid',
                              ),
                              _buildNavCard(
                                context: context,
                                title: 'Nearby Crises',
                                icon: Icons.explore_rounded,
                                color: const Color(0xFFFF9500),
                                description: 'Track ongoing signals',
                                routeName: '/nearby',
                              ),
                              _buildNavCard(
                                context: context,
                                title: 'Profile Hub',
                                icon: Icons.fingerprint_rounded,
                                color: const Color(0xFF34C759),
                                description: 'View active risk metrics',
                                routeName: '/profile',
                              ),
                              _buildNavCard(
                                context: context,
                                title: 'Family Safety',
                                icon: Icons.family_restroom_rounded,
                                color: const Color(0xFFA259FF),
                                description: 'Manage household profile',
                                routeName: '/family_profile',
                              ),
                            ],
                          ),
                          const SizedBox(height: 20),
                          _buildResponseTrackerCard(context),
                          const SizedBox(height: 24),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),        // closes Scaffold body Stack
      ),        // closes Scaffold (child of CitizenAlertListener)
    );          // closes CitizenAlertListener
  }

  Widget _buildResponseTrackerCard(BuildContext context) {
    final userId = FirebaseAuth.instance.currentUser?.uid;
    if (userId == null) return const SizedBox.shrink();

    return StreamBuilder<bool>(
      stream: _hasActiveTrackingStream(userId),
      builder: (context, snapshot) {
        final hasActive = snapshot.data ?? false;

        return Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                const Color(0xFF1A1F2C),
                const Color(0xFF12141C),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: hasActive ? const Color(0xFF3B82F6).withOpacity(0.4) : const Color(0xFF3B82F6).withOpacity(0.15),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF3B82F6).withOpacity(hasActive ? 0.08 : 0.03),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () {
                Navigator.pushNamed(context, '/response_tracker');
              },
              borderRadius: BorderRadius.circular(24),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 18.0),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF3B82F6).withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.satellite_alt_rounded,
                        color: Color(0xFF3B82F6),
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Text(
                                '🚑 RESPONSE TRACKER',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                  letterSpacing: 1.0,
                                ),
                              ),
                              const SizedBox(width: 8),
                              if (hasActive) ...[
                                const PulseDot(color: Color(0xFF22C55E)),
                                const SizedBox(width: 4),
                                const Text(
                                  'LIVE RESPONSE ACTIVE',
                                  style: TextStyle(
                                    fontSize: 8,
                                    fontWeight: FontWeight.w900,
                                    color: Color(0xFF22C55E),
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ] else ...[
                                Container(
                                  width: 6,
                                  height: 6,
                                  decoration: const BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: Colors.grey,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                const Text(
                                  'STANDBY',
                                  style: TextStyle(
                                    fontSize: 8,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.grey,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Track your emergency and aid status in real-time',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.white.withOpacity(0.5),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Icon(
                      Icons.arrow_forward_ios_rounded,
                      color: Colors.white.withOpacity(0.3),
                      size: 16,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Stream<bool> _hasActiveTrackingStream(String userId) {
    // Return a stream combining changes on both databases
    final reliefSnapshots = FirebaseFirestore.instance
        .collection('relief_requests')
        .where('userId', isEqualTo: userId)
        .snapshots();

    final crisisSnapshots = FirebaseFirestore.instance
        .collection('crises')
        .where('citizenInput.userId', isEqualTo: userId)
        .snapshots();

    return FirebaseFirestore.instance
        .collection('event_queue')
        .where('payload.userId', isEqualTo: userId)
        .snapshots()
        .asyncMap((queueSnap) async {
          final reliefSnap = await FirebaseFirestore.instance
              .collection('relief_requests')
              .where('userId', isEqualTo: userId)
              .get();

          final crisisSnap = await FirebaseFirestore.instance
              .collection('crises')
              .where('citizenInput.userId', isEqualTo: userId)
              .get();

          bool hasActiveRelief = reliefSnap.docs.any((d) {
            final s = (d.data()['status'] as String? ?? '').toUpperCase();
            return s != 'CLOSED' && s.isNotEmpty;
          });

          bool hasActiveCrisis = crisisSnap.docs.any((d) {
            final s = (d.data()['status'] as String? ?? '').toUpperCase();
            return s != 'RESOLVED' && s.isNotEmpty;
          });

          return hasActiveRelief || hasActiveCrisis;
        });
  }

  Widget _buildNavCard({
    required BuildContext context,
    required String title,
    required IconData icon,
    required Color color,
    required String description,
    required String routeName,
  }) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            const Color(0xFF1A1F2C),
            const Color(0xFF12141C),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: color.withOpacity(0.2),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.05),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            try {
              Navigator.pushNamed(context, routeName);
            } catch (e) {
              debugPrint('Route not yet created: $e');
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Route $title not yet available'),
                  backgroundColor: const Color(0xFFFD3C5B),
                ),
              );
            }
          },
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: color.withOpacity(0.12),
                    boxShadow: [
                      BoxShadow(
                        color: color.withOpacity(0.2),
                        blurRadius: 10,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                  child: Icon(icon, size: 28, color: color),
                ),
                const Spacer(),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    letterSpacing: 0.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  description,
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.white.withOpacity(0.4),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class PulseDot extends StatefulWidget {
  final Color color;
  const PulseDot({Key? key, this.color = const Color(0xFF22C55E)}) : super(key: key);

  @override
  State<PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<PulseDot> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: widget.color,
            boxShadow: [
              BoxShadow(
                color: widget.color.withOpacity(1.0 - _controller.value),
                blurRadius: 6 * _controller.value + 2,
                spreadRadius: 3 * _controller.value,
              ),
            ],
          ),
        );
      },
    );
  }
}
