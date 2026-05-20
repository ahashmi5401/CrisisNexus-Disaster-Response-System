import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../core/onboarding_guard.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({Key? key}) : super(key: key);

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  @override
  void initState() {
    super.initState();
    OnboardingGuard.enforceGuard(context);
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    return Scaffold(
      backgroundColor: const Color(0xFF0A0B10),
      appBar: AppBar(
        title: const Text('Citizen Identity Hub'),
        backgroundColor: Colors.transparent,
      ),
      body: Stack(
        children: [
          // Elegant top subtle ambient glow
          Positioned(
            top: -100,
            left: 50,
            right: 50,
            child: Container(
              width: 300,
              height: 200,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF007AFF).withOpacity(0.06),
                    blurRadius: 100,
                    spreadRadius: 50,
                  ),
                ],
              ),
            ),
          ),
          user == null
              ? const Center(
                  child: Text(
                    'No authenticated telemetry found. Please log in.',
                    style: TextStyle(color: Colors.grey),
                  ),
                )
              : StreamBuilder<DocumentSnapshot>(
                  stream: FirebaseFirestore.instance.collection('users').doc(user.uid).snapshots(),
                  builder: (context, snapshot) {
                    if (snapshot.hasError) {
                      return const Center(
                        child: Text(
                          'Error loading profile metadata',
                          style: TextStyle(color: Color(0xFFFD3C5B)),
                        ),
                      );
                    }
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(
                        child: CircularProgressIndicator(
                          valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF007AFF)),
                        ),
                      );
                    }

                    if (!snapshot.hasData || !snapshot.data!.exists) {
                      return const Center(
                        child: Text(
                          'User profile registry not found',
                          style: TextStyle(color: Colors.grey),
                        ),
                      );
                    }

                    final data = snapshot.data!.data() as Map<String, dynamic>;
                    final stats = data['stats'] as Map<String, dynamic>? ?? {};
                    final profile = data['profile'] as Map<String, dynamic>? ?? {};
                    final lastActive = stats['lastActiveAt'] as Timestamp?;
                    final int riskScore = stats['riskScore'] is num 
                        ? (stats['riskScore'] as num).toInt() 
                        : 0;

                    // Compute dynamic warning levels for CIRO intelligence
                    String warningLevel = 'NOMINAL';
                    Color indicatorColor = const Color(0xFF34C759);
                    if (riskScore >= 60) {
                      warningLevel = 'CRITICAL IMPACT';
                      indicatorColor = const Color(0xFFFD3C5B);
                    } else if (riskScore >= 30) {
                      warningLevel = 'ELEVATED SUSPICION';
                      indicatorColor = const Color(0xFFFF9500);
                    }

                    return SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 24.0),
                      child: Column(
                        children: [
                          // Biometric Avatar Emblem
                          Center(
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                Container(
                                  width: 110,
                                  height: 110,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: Colors.transparent,
                                    border: Border.all(
                                      color: indicatorColor.withOpacity(0.3),
                                      width: 2,
                                    ),
                                  ),
                                ),
                                Container(
                                  width: 96,
                                  height: 96,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: const Color(0xFF161922),
                                    border: Border.all(
                                      color: indicatorColor.withOpacity(0.8),
                                      width: 2,
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: indicatorColor.withOpacity(0.2),
                                        blurRadius: 16,
                                        spreadRadius: 2,
                                      ),
                                    ],
                                  ),
                                  child: const Icon(
                                    Icons.fingerprint_rounded,
                                    size: 48,
                                    color: Colors.white,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 20),
                          Text(
                            profile['displayName']?.isNotEmpty == true 
                                ? profile['displayName'] 
                                : 'Citizen Node',
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            user.email ?? 'unregistered_telemetry',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.white.withOpacity(0.5),
                              letterSpacing: 0.2,
                            ),
                          ),
                          const SizedBox(height: 16),
                          // Premium Status pill
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                            decoration: BoxDecoration(
                              color: indicatorColor.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(100),
                              border: Border.all(
                                color: indicatorColor.withOpacity(0.3),
                                width: 1,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 6,
                                  height: 6,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: indicatorColor,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'CIRO STATUS: $warningLevel',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 1.0,
                                    color: indicatorColor,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 36),
                          
                          const Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              'OPERATIONAL DIAGNOSTICS',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.5,
                                color: Color(0xFF007AFF),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          
                          // Custom grid details
                          GridView.count(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            crossAxisCount: 2,
                            crossAxisSpacing: 16,
                            mainAxisSpacing: 16,
                            childAspectRatio: 1.25,
                            children: [
                              _buildStatCard(
                                'BROADCAST SIGNALS',
                                stats['totalReports']?.toString() ?? '0',
                                Icons.warning_amber_rounded,
                                const Color(0xFFFD3C5B),
                              ),
                              _buildStatCard(
                                'RELIEF REQUESTS',
                                stats['totalAidRequests']?.toString() ?? '0',
                                Icons.health_and_safety_rounded,
                                const Color(0xFF007AFF),
                              ),
                              _buildStatCard(
                                'RISK THREAT COEFFICIENT',
                                stats['riskScore']?.toString() ?? '0',
                                Icons.analytics_rounded,
                                indicatorColor,
                              ),
                              _buildStatCard(
                                'ACTIVITY INTEGRITY',
                                lastActive != null ? 'SECURE' : 'UNINITIALIZED',
                                Icons.verified_user_rounded,
                                const Color(0xFF34C759),
                              ),
                            ],
                          ),
                          const SizedBox(height: 24),
                          // Recent Crisis Interaction Display
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: const Color(0xFF161922),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: Colors.white.withOpacity(0.06),
                                width: 1,
                              ),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF007AFF).withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: const Icon(
                                    Icons.chat_bubble_outline_rounded,
                                    color: Color(0xFF007AFF),
                                    size: 20,
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'RECENT CRISIS INTERACTION',
                                        style: TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w900,
                                          letterSpacing: 1.0,
                                          color: Colors.white.withOpacity(0.4),
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        stats['recentCrisisInteraction'] ?? 'None',
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.bold,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),
                          if (lastActive != null)
                            Text(
                              'Registry Telemetry Update: ${lastActive.toDate().toString().split('.')[0]}',
                              style: TextStyle(
                                color: Colors.white.withOpacity(0.3),
                                fontSize: 11,
                                letterSpacing: 0.2,
                              ),
                            ),
                          
                          const SizedBox(height: 32),
                          // Family Profile Option
                          ElevatedButton.icon(
                            onPressed: () {
                              Navigator.pushNamed(context, '/family_profile');
                            },
                            icon: const Icon(Icons.family_restroom_rounded, size: 18),
                            label: const Text('OPTIONAL FAMILY PROFILE'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF007AFF).withOpacity(0.1),
                              foregroundColor: const Color(0xFF007AFF),
                              side: BorderSide(color: const Color(0xFF007AFF).withOpacity(0.3)),
                              minimumSize: const Size(double.infinity, 56),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          // Log out button
                          ElevatedButton.icon(
                            onPressed: () async {
                              await FirebaseAuth.instance.signOut();
                              if (context.mounted) {
                                Navigator.pushReplacementNamed(context, '/login');
                              }
                            },
                            icon: const Icon(Icons.logout_rounded, size: 18),
                            label: const Text('DISCONNECT IDENTITY NODE'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFFD3C5B).withOpacity(0.08),
                              foregroundColor: const Color(0xFFFD3C5B),
                              side: BorderSide(color: const Color(0xFFFD3C5B).withOpacity(0.2)),
                              minimumSize: const Size(double.infinity, 56),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, String value, IconData icon, Color color) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF161922),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Colors.white.withOpacity(0.06),
          width: 1,
        ),
      ),
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 24),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withOpacity(0.4),
              fontSize: 9,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.8,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

