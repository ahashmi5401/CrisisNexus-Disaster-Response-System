import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:math' as math;

class ResponseTrackerScreen extends StatefulWidget {
  const ResponseTrackerScreen({Key? key}) : super(key: key);

  @override
  State<ResponseTrackerScreen> createState() => _ResponseTrackerScreenState();
}

class _ResponseTrackerScreenState extends State<ResponseTrackerScreen> with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  String? _selectedTrackId;
  String _selectedType = 'relief'; // 'relief' or 'crisis'
  final Set<String> _shownResolvedPopups = {};

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  // Maps status to step index (0 to 6)
  int _getStatusIndex(String status, String type) {
    final s = status.toUpperCase();
    if (type == 'crisis') {
      if (s == 'NEW' || s == 'REPORTED' || s == 'PROVISIONAL') return 1; // AI Processing / Submitted
      if (s == 'NEEDS_VERIFICATION') return 2;
      if (s == 'CONFIRMED' || s == 'APPROVED') return 3;
      if (s == 'ASSIGNED' || s == 'IN_PROGRESS') return 4;
      if (s == 'MITIGATED') return 5;
      if (s == 'RESOLVED') return 6;
      return 0;
    } else {
      // Relief Request mapping
      if (s == 'PENDING') return 1; // Submitted -> AI Processing
      if (s == 'VERIFIED') return 2;
      if (s == 'APPROVED') return 3;
      if (s == 'DISPATCHED') return 4;
      if (s == 'DELIVERED') return 5;
      if (s == 'CLOSED') return 6;
      return 0;
    }
  }

  // Custom action to cancel request
  Future<void> _cancelRequest(String docId, String type) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF121A2B),
        title: const Text('Cancel Request', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        content: const Text('Are you sure you want to cancel this active request?', style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('NO', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEF4444)),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('CANCEL REQUEST'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        if (type == 'relief') {
          await FirebaseFirestore.instance.collection('relief_requests').doc(docId).update({
            'status': 'CLOSED',
            'updatedAt': new DateTime.now().toIso8601String(),
            'notes': '[CITIZEN CANCELLED]: Request retracted by owner.'
          });
        } else {
          await FirebaseFirestore.instance.collection('crises').doc(docId).update({
            'status': 'resolved',
            'updatedAt': FieldValue.serverTimestamp()
          });
        }
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Request cancelled successfully'), backgroundColor: Color(0xFFEF4444)),
        );
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to cancel: $e'), backgroundColor: const Color(0xFFEF4444)),
        );
      }
    }
  }

  // Custom action to update situation details
  Future<void> _updateSituation(String docId, String type, String existingNotes) async {
    final textController = TextEditingController();
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF121A2B),
        title: const Text('Update Situation', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Provide additional details or changes to your current emergency status:', style: TextStyle(color: Colors.white70, fontSize: 13)),
            const SizedBox(height: 12),
            TextField(
              controller: textController,
              maxLines: 3,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'e.g. water rising, medical urgency updated...',
                hintStyle: TextStyle(color: Colors.white.withOpacity(0.3)),
                fillColor: const Color(0xFF0B1020),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('CANCEL', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF3B82F6)),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('SUBMIT UPDATE'),
          ),
        ],
      ),
    );

    if (confirm == true && textController.text.trim().isNotEmpty) {
      try {
        final newNotes = '$existingNotes\n[CITIZEN UPDATE - ${DateTime.now().toLocal().toString().split('.')[0]}]: ${textController.text.trim()}';
        if (type == 'relief') {
          await FirebaseFirestore.instance.collection('relief_requests').doc(docId).update({
            'notes': newNotes,
            'updatedAt': new DateTime.now().toIso8601String()
          });
        } else {
          await FirebaseFirestore.instance.collection('crises').doc(docId).update({
            'description': newNotes,
            'updatedAt': FieldValue.serverTimestamp()
          });
        }
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Situation update dispatched to NGO'), backgroundColor: Color(0xFF22C55E)),
        );
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update: $e'), backgroundColor: const Color(0xFFEF4444)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final userId = FirebaseAuth.instance.currentUser?.uid;

    return Scaffold(
      backgroundColor: const Color(0xFF0B1020),
      appBar: AppBar(
        title: const Text('Response Tracker'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Stack(
        children: [
          // Subtle blue neon glow behind
          Positioned(
            top: 20,
            left: -80,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF3B82F6).withOpacity(0.08),
                    blurRadius: 100,
                    spreadRadius: 30,
                  ),
                ],
              ),
            ),
          ),
          
          userId == null
              ? const Center(child: Text('No authenticated citizen telemetry found.', style: TextStyle(color: Colors.grey)))
              : StreamBuilder<List<Map<String, dynamic>>>(
                  stream: _combineUserTrackingStreams(userId),
                  builder: (context, snapshot) {
                    if (snapshot.hasError) {
                      return const Center(child: Text('Operational telemetry sync error.', style: TextStyle(color: Color(0xFFEF4444))));
                    }
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator(valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF3B82F6))));
                    }

                    final allTracks = snapshot.data ?? [];

                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (!mounted) return;
                      for (var track in allTracks) {
                        final status = (track['status'] as String? ?? '').toLowerCase();
                        if ((status == 'resolved' || status == 'closed') && !_shownResolvedPopups.contains(track['id'])) {
                          _shownResolvedPopups.add(track['id']);
                          showDialog(
                            context: context,
                            builder: (context) => AlertDialog(
                              backgroundColor: const Color(0xFF121A2B),
                              title: Row(
                                children: [
                                  const Icon(Icons.check_circle_outline, color: Color(0xFF22C55E)),
                                  const SizedBox(width: 8),
                                  const Text('Case Resolved', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                                ],
                              ),
                              content: Text('Your request #${track['id'].toString().substring(math.max(0, track['id'].toString().length - 6)).toUpperCase()} has been successfully resolved and closed.', style: const TextStyle(color: Colors.white70)),
                              actions: [
                                ElevatedButton(
                                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF3B82F6)),
                                  onPressed: () => Navigator.pop(context),
                                  child: const Text('OK'),
                                ),
                              ],
                            ),
                          );
                        }
                      }
                    });

                    final tracks = allTracks.where((t) {
                      final s = (t['status'] as String? ?? '').toLowerCase();
                      return s != 'resolved' && s != 'closed';
                    }).toList();

                    if (tracks.isEmpty) {
                      return Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32.0),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(24),
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: const Color(0xFF121A2B),
                                  border: Border.all(color: Colors.white.withOpacity(0.05)),
                                ),
                                child: Icon(Icons.satellite_alt_rounded, size: 48, color: Colors.white.withOpacity(0.3)),
                              ),
                              const SizedBox(height: 20),
                              const Text(
                                'GRID SECURE • NO ACTIVE RESPONSE',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                  letterSpacing: 1.5,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'You do not have any active emergency signals or relief requests in this sector.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.white.withOpacity(0.5),
                                  height: 1.4,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }

                    // Select first active request by default if no selection exists
                    if (_selectedTrackId == null || !tracks.any((t) => t['id'] == _selectedTrackId)) {
                      _selectedTrackId = tracks.first['id'];
                      _selectedType = tracks.first['type'];
                    }

                    final activeTrack = tracks.firstWhere((t) => t['id'] == _selectedTrackId, orElse: () => tracks.first);

                    final status = activeTrack['status'] as String? ?? 'PENDING';
                    final type = activeTrack['type'] as String;
                    final subType = activeTrack['subType'] as String? ?? 'Emergency';
                    final description = activeTrack['description'] as String? ?? 'Request logged.';
                    final finalSeverity = activeTrack['finalSeverity'] as String? ?? 'HIGH';
                    final decisionSource = activeTrack['decisionSource'] as String? ?? 'hybrid_confirmed';
                    final severityBadge = activeTrack['severityBadge'] as String? ?? 'HYBRID CONFIRMED';
                    final confidence = activeTrack['confidence'] as double? ?? 0.91;
                    final locationName = activeTrack['locationName'] as String? ?? 'Karachi';
                    
                    final stepIndex = _getStatusIndex(status, type);

                    return Column(
                      children: [
                        // Horizontal selector chip scroll
                        Container(
                          height: 48,
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListView.builder(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: tracks.length,
                            itemBuilder: (context, idx) {
                              final item = tracks[idx];
                              final isSelected = item['id'] == _selectedTrackId;
                              final isCrisis = item['type'] == 'crisis';
                              final itemStatus = (item['status'] as String? ?? 'PENDING').toUpperCase();
                              
                              return GestureDetector(
                                onTap: () {
                                  setState(() {
                                    _selectedTrackId = item['id'];
                                    _selectedType = item['type'];
                                  });
                                },
                                child: Container(
                                  margin: const EdgeInsets.only(right: 10),
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                  decoration: BoxDecoration(
                                    color: isSelected ? const Color(0xFF3B82F6).withOpacity(0.15) : const Color(0xFF121A2B),
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(
                                      color: isSelected ? const Color(0xFF3B82F6) : Colors.white.withOpacity(0.06),
                                      width: 1,
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      Icon(
                                        isCrisis ? Icons.warning_amber_rounded : Icons.health_and_safety_rounded,
                                        size: 14,
                                        color: isSelected ? const Color(0xFF3B82F6) : Colors.white70,
                                      ),
                                      const SizedBox(width: 6),
                                      Text(
                                        '#${item['id'].toString().substring(math.max(0, item['id'].toString().length - 6)).toUpperCase()}',
                                        style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.bold,
                                          color: isSelected ? Colors.white : Colors.white70,
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      Container(
                                        width: 6,
                                        height: 6,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: _getStatusColor(itemStatus),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        ),

                        // Main Scrollable Area
                        Expanded(
                          child: SingleChildScrollView(
                            physics: const BouncingScrollPhysics(),
                            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                // Live Status Banner
                                _buildLiveStatusBanner(status),
                                const SizedBox(height: 16),

                                // General Details Card
                                Container(
                                  padding: const EdgeInsets.all(20),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF121A2B),
                                    borderRadius: BorderRadius.circular(24),
                                    border: Border.all(color: Colors.white.withOpacity(0.05)),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            'TRACKING ID: #${activeTrack['id'].toString().toUpperCase()}',
                                            style: const TextStyle(
                                              fontFamily: 'monospace',
                                              fontSize: 13,
                                              fontWeight: FontWeight.bold,
                                              color: Color(0xFF3B82F6),
                                            ),
                                          ),
                                          Text(
                                            type == 'crisis' ? 'CRISIS NODE' : 'AID REQUEST',
                                            style: TextStyle(
                                              fontSize: 9,
                                              fontWeight: FontWeight.w900,
                                              letterSpacing: 1.0,
                                              color: Colors.white.withOpacity(0.4),
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 12),
                                      Text(
                                        subType.toUpperCase(),
                                        style: const TextStyle(
                                          fontSize: 20,
                                          fontWeight: FontWeight.w900,
                                          color: Colors.white,
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                      Text(
                                        description,
                                        style: TextStyle(
                                          fontSize: 13,
                                          color: Colors.white.withOpacity(0.6),
                                          height: 1.4,
                                        ),
                                      ),
                                      const SizedBox(height: 12),
                                      Row(
                                        children: [
                                          Icon(Icons.location_on_outlined, size: 14, color: Colors.white.withOpacity(0.4)),
                                          const SizedBox(width: 4),
                                          Text(
                                            locationName,
                                            style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.4)),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 20),

                                // Timeline Component (Hero Element)
                                const Text(
                                  'RESPONSE LIFECYCLE',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 1.5,
                                    color: Color(0xFF3B82F6),
                                  ),
                                ),
                                const SizedBox(height: 16),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF121A2B),
                                    borderRadius: BorderRadius.circular(24),
                                    border: Border.all(color: Colors.white.withOpacity(0.05)),
                                  ),
                                  child: _buildVerticalTimeline(stepIndex, subType.toLowerCase() == 'medical'),
                                ),
                                const SizedBox(height: 20),

                                // Assigned Response Card
                                if (stepIndex >= 4 && stepIndex < 6) ...[
                                  const Text(
                                    'ACTIVE FIELD UNIT',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 1.5,
                                      color: Color(0xFF3B82F6),
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  _buildAssignedTeamCard(subType),
                                  const SizedBox(height: 20),
                                ],

                                // Severity Trust Card (CRIO Hybrid Info)
                                if (type == 'crisis') ...[
                                  const Text(
                                    'CRIO DECISION TELEMETRY',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 1.5,
                                      color: Color(0xFF3B82F6),
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  _buildSeverityTrustCard(finalSeverity, decisionSource, severityBadge, confidence),
                                  const SizedBox(height: 20),
                                ],

                                // Radar Map Preview Mini Card
                                const Text(
                                  'RADAR ZONE MAP',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 1.5,
                                    color: Color(0xFF3B82F6),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                _buildRadarMapCard(stepIndex),
                                const SizedBox(height: 40),
                              ],
                            ),
                          ),
                        ),

                        // Bottom Actions Action Bar
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                          decoration: BoxDecoration(
                            color: const Color(0xFF121A2B),
                            border: Border.all(color: Colors.white.withOpacity(0.06), width: 1),
                            borderRadius: const BorderRadius.only(
                              topLeft: Radius.circular(24),
                              topRight: Radius.circular(24),
                            ),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () {
                                    showDialog(
                                      context: context,
                                      builder: (context) => AlertDialog(
                                        backgroundColor: const Color(0xFF121A2B),
                                        title: const Text('Call NGO Command Room', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                                        content: const Text('NGO Emergency Hotline: +92 21 111-NGO-911\n\nDo you want to establish an audio connection?', style: TextStyle(color: Colors.white70)),
                                        actions: [
                                          TextButton(
                                            onPressed: () => Navigator.pop(context),
                                            child: const Text('NO', style: TextStyle(color: Colors.grey)),
                                          ),
                                          ElevatedButton(
                                            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF3B82F6)),
                                            onPressed: () => Navigator.pop(context),
                                            child: const Text('CALL NOW'),
                                          ),
                                        ],
                                      ),
                                    );
                                  },
                                  icon: const Icon(Icons.phone_in_talk_rounded, size: 16),
                                  label: const Text('CALL NGO', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: Colors.white,
                                    side: BorderSide(color: Colors.white.withOpacity(0.12)),
                                    padding: const EdgeInsets.symmetric(vertical: 16),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: ElevatedButton.icon(
                                  onPressed: stepIndex >= 6 
                                      ? null 
                                      : () => _updateSituation(activeTrack['id'], type, description),
                                  icon: const Icon(Icons.edit_note_rounded, size: 16),
                                  label: const Text('UPDATE SITUATION', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFF3B82F6).withOpacity(0.2),
                                    foregroundColor: const Color(0xFF3B82F6),
                                    elevation: 0,
                                    padding: const EdgeInsets.symmetric(vertical: 16),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      side: BorderSide(color: const Color(0xFF3B82F6).withOpacity(0.3)),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              IconButton(
                                onPressed: stepIndex >= 5 
                                    ? null 
                                    : () => _cancelRequest(activeTrack['id'], type),
                                icon: const Icon(Icons.cancel_outlined, color: Color(0xFFEF4444)),
                                tooltip: 'Cancel Request',
                              ),
                            ],
                          ),
                        ),
                      ],
                    );
                  },
                ),
        ],
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'PENDING': return const Color(0xFFF59E0B);
      case 'VERIFIED': return const Color(0xFF3B82F6);
      case 'APPROVED': return const Color(0xFF3B82F6);
      case 'DISPATCHED': return const Color(0xFF22C55E);
      case 'DELIVERED': return const Color(0xFF22C55E);
      case 'CLOSED': return Colors.grey;
      default: return const Color(0xFF3B82F6);
    }
  }

  // Live status banner UI
  Widget _buildLiveStatusBanner(String status) {
    final s = status.toUpperCase();
    String text = 'Awaiting verification';
    Color color = const Color(0xFFF59E0B);
    IconData icon = Icons.pending_actions_rounded;

    if (s == 'VERIFIED') {
      text = 'Medical team verified signal';
      color = const Color(0xFF3B82F6);
      icon = Icons.health_and_safety_rounded;
    } else if (s == 'APPROVED') {
      text = 'Coordinator approved response';
      color = const Color(0xFF3B82F6);
      icon = Icons.verified_user_rounded;
    } else if (s == 'DISPATCHED' || s == 'ASSIGNED' || s == 'IN_PROGRESS') {
      text = 'Rescue unit dispatched & en route';
      color = const Color(0xFF22C55E);
      icon = Icons.local_shipping_rounded;
    } else if (s == 'DELIVERED' || s == 'MITIGATED') {
      text = 'Assistance delivered successfully';
      color = const Color(0xFF22C55E);
      icon = Icons.check_circle_rounded;
    } else if (s == 'CLOSED' || s == 'RESOLVED') {
      text = 'Incident archived & resolved';
      color = Colors.grey;
      icon = Icons.archive_rounded;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text.toUpperCase(),
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w900,
                color: color,
                letterSpacing: 0.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // Vertical Timeline Widget
  Widget _buildVerticalTimeline(int activeIndex, bool isMedical) {
    final steps = [
      'Submitted',
      'AI Processing',
      isMedical ? 'Medical Team Verified' : 'Situation Triaged',
      'Dispatch Approved',
      'Team En Route',
      'Aid Delivered',
      'Case Closed',
    ];

    return Column(
      children: List.generate(steps.length, (idx) {
        final isCompleted = idx < activeIndex;
        final isActive = idx == activeIndex;
        
        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Line and dot
              Column(
                children: [
                  // Dot
                  if (isActive)
                    AnimatedBuilder(
                      animation: _pulseController,
                      builder: (context, child) {
                        return Container(
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: const Color(0xFF3B82F6).withOpacity(0.2),
                            border: Border.all(
                              color: const Color(0xFF3B82F6).withOpacity(0.3 + (1.0 - _pulseController.value) * 0.7),
                              width: 2 + _pulseController.value * 3,
                            ),
                          ),
                          child: Center(
                            child: Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                color: Color(0xFF3B82F6),
                              ),
                            ),
                          ),
                        );
                      },
                    )
                  else
                    Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isCompleted ? const Color(0xFF22C55E) : Colors.transparent,
                        border: Border.all(
                          color: isCompleted ? const Color(0xFF22C55E) : Colors.white24,
                          width: 2,
                        ),
                      ),
                      child: isCompleted
                          ? const Icon(Icons.check, size: 10, color: Colors.white)
                          : null,
                    ),
                  
                  // Connector Line
                  if (idx < steps.length - 1)
                    Expanded(
                      child: Container(
                        width: 2,
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        color: isCompleted ? const Color(0xFF22C55E) : Colors.white12,
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 16),
              
              // Text Content
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 24.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        steps[idx],
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: isActive
                              ? const Color(0xFF3B82F6)
                              : (isCompleted ? Colors.white : Colors.white38),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _getStepDescription(idx, isActive, isCompleted),
                        style: TextStyle(
                          fontSize: 11,
                          color: isActive
                              ? Colors.white70
                              : (isCompleted ? Colors.white60 : Colors.white24),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }

  String _getStepDescription(int index, bool isActive, bool isCompleted) {
    if (isCompleted) {
      switch (index) {
        case 0: return 'Emergency node logged in outbox registry.';
        case 1: return 'Fusion heuristics completed. System indicators clean.';
        case 2: return 'Field operational triage verification certified.';
        case 3: return 'Operational logistics cleared for immediate deployment.';
        case 4: return 'Responders reached target coordinate location.';
        case 5: return 'Materials and extraction confirmed in target area.';
        default: return 'Request archived.';
      }
    }
    if (isActive) {
      switch (index) {
        case 0: return 'Syncing event data streams to Firestore...';
        case 1: return 'Circuit breaker analyzing telemetry signals...';
        case 2: return 'NGO coordinator evaluating emergency context...';
        case 3: return 'Scheduling dispatch deployment windows...';
        case 4: return 'Field unit navigating regional delay clusters...';
        case 5: return 'Confirming resource and extraction integrity...';
        default: return 'Archiving incident record...';
      }
    }
    return 'Pending preceding status updates.';
  }

  // Assigned Response Card
  Widget _buildAssignedTeamCard(String subType) {
    final sub = subType.toLowerCase();
    String title = 'Logistics Support Unit';
    String id = 'LSU-14';
    String icon = '📦';
    String eta = '20 mins';

    if (sub == 'medical' || sub == 'medical_aid') {
      title = 'Medical Rapid Unit';
      id = 'MRU-07';
      icon = '🚑';
      eta = '12 mins';
    } else if (sub == 'flood' || sub == 'rescue') {
      title = 'Flood Rescue Unit';
      id = 'FRU-03';
      icon = '🚤';
      eta = '15 mins';
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF121A2B),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFF3B82F6).withOpacity(0.2)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF3B82F6).withOpacity(0.04),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.04),
              shape: BoxShape.circle,
            ),
            child: Text(icon, style: const TextStyle(fontSize: 28)),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title.toUpperCase(),
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 4),
                Text(
                  'Unit ID: $id • Status: En Route',
                  style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.5)),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Text(
                'ETA',
                style: TextStyle(fontSize: 10, color: Color(0xFF3B82F6), fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 2),
              Text(
                eta,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // Severity Trust Card
  Widget _buildSeverityTrustCard(String severity, String source, String badge, double conf) {
    Color badgeColor = const Color(0xFF3B82F6);
    if (source == 'citizen_override') {
      badgeColor = const Color(0xFFF59E0B);
    } else if (source == 'hybrid_confirmed') {
      badgeColor = const Color(0xFF22C55E);
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF121A2B),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'CRIO Arbitrated Severity',
                style: TextStyle(fontSize: 13, color: Colors.white70),
              ),
              Text(
                severity.toUpperCase(),
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: _getSeverityColorHex(severity)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(color: Colors.white10, height: 1),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
               Text(
                'Resolution Mode',
                style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.55)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: badgeColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: badgeColor.withOpacity(0.3)),
                ),
                child: Text(
                  badge.toUpperCase(),
                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: badgeColor, letterSpacing: 0.5),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
               Text(
                'Fission Confidence Coeff',
                style: TextStyle(fontSize: 12,color: Colors.white.withOpacity(0.55),),
              ),
              Text(
                '${(conf * 100).toInt()}%',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Color _getSeverityColorHex(String severity) {
    final s = severity.toUpperCase();
    if (s == 'CRITICAL') return const Color(0xFFEF4444);
    if (s == 'HIGH') return const Color(0xFFF59E0B);
    if (s == 'MEDIUM') return const Color(0xFF3B82F6);
    return const Color(0xFF22C55E);
  }

  // Radar Map Mini Card
  Widget _buildRadarMapCard(int stepIndex) {
    return Container(
      height: 140,
      decoration: BoxDecoration(
        color: const Color(0xFF121A2B),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _RadarBackgroundPainter(_pulseController.value, stepIndex),
            ),
          ),
          Positioned(
            left: 16,
            top: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFF0B1020).withOpacity(0.7),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Color(0xFF3B82F6),
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Text(
                    'CIRO TELEMETRY STREAM',
                    style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // Query and Combine Firestore tracking datasets
  Stream<List<Map<String, dynamic>>> _combineUserTrackingStreams(String userId) {
    final reliefStream = FirebaseFirestore.instance
        .collection('relief_requests')
        .where('userId', isEqualTo: userId)
        .snapshots();

    final crisisStream = FirebaseFirestore.instance
        .collection('crises')
        .where('citizenInput.userId', isEqualTo: userId)
        .snapshots();

    return FirebaseFirestore.instance
        .collection('event_queue')
        .where('payload.userId', isEqualTo: userId)
        .snapshots()
        .asyncMap((queueSnap) async {
          // Fetch real collections
          final reliefSnap = await FirebaseFirestore.instance
              .collection('relief_requests')
              .where('userId', isEqualTo: userId)
              .get();

          final crisisSnap = await FirebaseFirestore.instance
              .collection('crises')
              .where('citizenInput.userId', isEqualTo: userId)
              .get();

          final List<Map<String, dynamic>> items = [];

          // Add Crises
          for (var doc in crisisSnap.docs) {
            final data = doc.data();
            final analysis = data['analysis'] as Map<String, dynamic>? ?? {};
            
            items.add({
              'id': doc.id,
              'type': 'crisis',
              'status': data['status'] ?? 'NEW',
              'subType': data['subType'] ?? 'Emergency',
              'description': data['description'] ?? 'Emergency signal broadcasted.',
              'finalSeverity': analysis['finalSeverity'] ?? data['severity'] ?? 'HIGH',
              'decisionSource': analysis['source'] ?? 'citizen_override',
              'severityBadge': analysis['severityBadge'] ?? 'CITIZEN OVERRIDE',
              'confidence': (analysis['confidenceScore'] as num?)?.toDouble() ?? (data['confidence'] as num?)?.toDouble() ?? 0.91,
              'locationName': data['location']?['name'] ?? 'Target Zone',
              'createdAt': data['time'] is Timestamp ? (data['time'] as Timestamp).toDate() : DateTime.now(),
            });
          }

          // Add Relief Requests
          for (var doc in reliefSnap.docs) {
            final data = doc.data();
            items.add({
              'id': doc.id,
              'type': 'relief',
              'status': data['status'] ?? 'pending',
              'subType': data['subType'] ?? 'Aid',
              'description': data['notes'] ?? 'Relief aid request submitted.',
              'finalSeverity': 'MEDIUM',
              'decisionSource': 'system',
              'severityBadge': 'FUSION ONLY',
              'confidence': 0.85,
              'locationName': data['location']?['name'] ?? 'Citizen Zone',
              'createdAt': data['createdAt'] is Timestamp ? (data['createdAt'] as Timestamp).toDate() : DateTime.now(),
            });
          }

          // Sort by date descending
          items.sort((a, b) => b['createdAt'].compareTo(a['createdAt']));
          return items;
        });
  }
}

// Draw a futuristic radar grid and route coordinate lines
class _RadarBackgroundPainter extends CustomPainter {
  final double animationValue;
  final int stepIndex;

  _RadarBackgroundPainter(this.animationValue, this.stepIndex);

  @override
  void paint(Canvas canvas, Size size) {
    final centerPaint = Paint()
      ..color = const Color(0xFF3B82F6).withOpacity(0.04)
      ..style = PaintingStyle.fill;
    
    final gridPaint = Paint()
      ..color = Colors.white.withOpacity(0.03)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    final radarLinePaint = Paint()
      ..color = const Color(0xFF3B82F6).withOpacity(0.12)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    final routePaint = Paint()
      ..color = const Color(0xFF3B82F6).withOpacity(0.3)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round;

    final dotPaint = Paint()
      ..color = const Color(0xFF3B82F6)
      ..style = PaintingStyle.fill;

    final targetPaint = Paint()
      ..color = const Color(0xFF22C55E)
      ..style = PaintingStyle.fill;

    // Draw background grid circles
    final center = Offset(size.width / 2, size.height / 2);
    canvas.drawCircle(center, size.height * 0.25, gridPaint);
    canvas.drawCircle(center, size.height * 0.45, gridPaint);
    canvas.drawCircle(center, size.height * 0.70, gridPaint);

    // Draw radar sweep line
    final sweepAngle = animationValue * 2 * math.pi;
    final sweepOffset = Offset(
      center.dx + size.width * 0.6 * math.cos(sweepAngle),
      center.dy + size.width * 0.6 * math.sin(sweepAngle),
    );
    canvas.drawLine(center, sweepOffset, radarLinePaint);

    // Draw fake route points: Citizen and Dispatch Team
    final citizenPoint = Offset(size.width * 0.25, size.height * 0.7);
    final dispatchPoint = Offset(size.width * 0.75, size.height * 0.35);

    // Draw dotted line between dispatch and citizen
    final path = Path()
      ..moveTo(dispatchPoint.dx, dispatchPoint.dy)
      ..lineTo(citizenPoint.dx, citizenPoint.dy);
    
    canvas.drawPath(path, routePaint);

    // Draw Citizen Dot
    canvas.drawCircle(citizenPoint, 6, targetPaint);
    canvas.drawCircle(citizenPoint, 12, targetPaint..color = const Color(0xFF22C55E).withOpacity(0.15));

    // Draw Responder Dot moving along line
    if (stepIndex >= 4) {
      // responder is dispatched and moving
      double progress = 0.0;
      if (stepIndex == 4) {
        // En route - animate back and forth on route line
        progress = 0.3 + (math.sin(animationValue * 2 * math.pi) + 1.0) * 0.3; 
      } else {
        // Delivered / closed - arrived at destination
        progress = 1.0;
      }
      
      final responderPoint = Offset(
        dispatchPoint.dx + (citizenPoint.dx - dispatchPoint.dx) * progress,
        dispatchPoint.dy + (citizenPoint.dy - dispatchPoint.dy) * progress,
      );
      
      canvas.drawCircle(responderPoint, 7, dotPaint..color = const Color(0xFF3B82F6));
      canvas.drawCircle(responderPoint, 15, dotPaint..color = const Color(0xFF3B82F6).withOpacity(0.15));
    } else {
      // Still at dispatch base
      canvas.drawCircle(dispatchPoint, 5, dotPaint..color = const Color(0xFF3B82F6).withOpacity(0.5));
    }
  }

  @override
  bool shouldRepaint(covariant _RadarBackgroundPainter oldDelegate) => true;
}
