import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/location_service.dart';
import '../core/crisis_ingestion_controller.dart';
import '../core/onboarding_guard.dart';

// Aid option model — icon + label + internal value
class _AidOption {
  final String value;
  final String label;
  final IconData icon;
  const _AidOption({required this.value, required this.label, required this.icon});
}

class RequestAidScreen extends StatefulWidget {
  const RequestAidScreen({Key? key}) : super(key: key);

  @override
  State<RequestAidScreen> createState() => _RequestAidScreenState();
}

class _RequestAidScreenState extends State<RequestAidScreen>
    with SingleTickerProviderStateMixin {
  final FirebaseAuth _auth = FirebaseAuth.instance;

  // Multi-select: a Set of selected values
  final Set<String> _selectedNeeds = {};
  bool _isSubmitting = false;

  late final AnimationController _pulseController;
  late final Animation<double> _pulseAnim;

  static const List<_AidOption> _aidOptions = [
    _AidOption(value: 'medical', label: 'Medical',  icon: Icons.medical_services_outlined),
    _AidOption(value: 'food',    label: 'Food',     icon: Icons.restaurant_outlined),
    _AidOption(value: 'rescue',  label: 'Rescue',   icon: Icons.sos_outlined),
    _AidOption(value: 'shelter', label: 'Shelter',  icon: Icons.home_outlined),
    _AidOption(value: 'water',   label: 'Water',    icon: Icons.water_drop_outlined),
    _AidOption(value: 'logistics', label: 'Logistics', icon: Icons.local_shipping_outlined),
  ];

  @override
  void initState() {
    super.initState();
    OnboardingGuard.enforceGuard(context);

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);
    _pulseAnim = Tween<double>(begin: 0.85, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _toggleNeed(String value) {
    setState(() {
      if (_selectedNeeds.contains(value)) {
        _selectedNeeds.remove(value);
      } else {
        _selectedNeeds.add(value);
      }
    });
  }

  Future<void> _submitRequest() async {
    if (_isSubmitting) return;

    if (_selectedNeeds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select at least one aid type'),
          backgroundColor: Color(0xFFFD3C5B),
        ),
      );
      return;
    }

    final user = _auth.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('User not authenticated'),
          backgroundColor: Color(0xFFFD3C5B),
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final needsList = _selectedNeeds.toList();

      // Backward-compatible dispatch:
      // • 1 need  → send aidType only  (subType in backend, no needs[])
      // • 2+ needs → send aidType + needs[] (backend multi-loop)
      debugPrint('[UI SCREEN] Delegating relief aid request. needs: $needsList');

      await CrisisIngestionController.submitAidRequest(
        aidType: needsList.first,
        needs: needsList.length > 1 ? needsList : null,
      );

      if (mounted) {
        final label = needsList.length == 1
            ? needsList.first.toUpperCase()
            : '${needsList.length} NEEDS';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Aid request submitted: $label'),
            backgroundColor: const Color(0xFF34C759),
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Request failed: $e'),
            backgroundColor: const Color(0xFFFD3C5B),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0B10),
      appBar: AppBar(
        title: const Text('Request Relief Aid'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Info banner ──────────────────────────────────────────────
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF007AFF).withOpacity(0.08),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: const Color(0xFF007AFF).withOpacity(0.2),
                    width: 1.2,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFF007AFF).withOpacity(0.12),
                      ),
                      child: const Icon(
                        Icons.handshake_rounded,
                        color: Color(0xFF007AFF),
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'RELIEF COORDINATION UTILITY',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                              color: Color(0xFF007AFF),
                              letterSpacing: 1.0,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Select one or multiple aid types you need. Each will generate a separate relief request.',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.white.withOpacity(0.6),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // ── Selection card ───────────────────────────────────────────
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFF161922),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: Colors.white.withOpacity(0.06),
                    width: 1,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Text(
                          'SELECT AID TYPES',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.5,
                            color: Color(0xFF007AFF),
                          ),
                        ),
                        const Spacer(),
                        if (_selectedNeeds.isNotEmpty)
                          AnimatedBuilder(
                            animation: _pulseAnim,
                            builder: (_, child) => Opacity(
                              opacity: _pulseAnim.value,
                              child: child,
                            ),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: const Color(0xFF34C759).withOpacity(0.15),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: const Color(0xFF34C759).withOpacity(0.4),
                                ),
                              ),
                              child: Text(
                                '${_selectedNeeds.length} SELECTED',
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF34C759),
                                  letterSpacing: 0.8,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Tap to select. Tap again to deselect.',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.white.withOpacity(0.35),
                      ),
                    ),
                    const SizedBox(height: 20),

                    // ── Chip grid ────────────────────────────────────────
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: _aidOptions.map((option) {
                        final isSelected = _selectedNeeds.contains(option.value);
                        return GestureDetector(
                          onTap: () => _toggleNeed(option.value),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            curve: Curves.easeOut,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 14),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? const Color(0xFF007AFF).withOpacity(0.18)
                                  : const Color(0xFF1E2230),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: isSelected
                                    ? const Color(0xFF007AFF).withOpacity(0.7)
                                    : Colors.white.withOpacity(0.08),
                                width: isSelected ? 1.5 : 1.0,
                              ),
                              boxShadow: isSelected
                                  ? [
                                      BoxShadow(
                                        color: const Color(0xFF007AFF)
                                            .withOpacity(0.20),
                                        blurRadius: 12,
                                        offset: const Offset(0, 4),
                                      ),
                                    ]
                                  : [],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  isSelected
                                      ? Icons.check_circle_rounded
                                      : option.icon,
                                  size: 20,
                                  color: isSelected
                                      ? const Color(0xFF007AFF)
                                      : Colors.white.withOpacity(0.45),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  option.label.toUpperCase(),
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0.6,
                                    color: isSelected
                                        ? const Color(0xFF007AFF)
                                        : Colors.white.withOpacity(0.6),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    ),

                    // ── Multi-need note ──────────────────────────────────
                    if (_selectedNeeds.length > 1) ...[
                      const SizedBox(height: 20),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFF9500).withOpacity(0.08),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: const Color(0xFFFF9500).withOpacity(0.25),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.info_outline_rounded,
                                size: 16, color: Color(0xFFFF9500)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Each selected type will generate a separate relief request linked to this incident.',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.white.withOpacity(0.6),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],

                    const SizedBox(height: 32),

                    // ── Submit button ────────────────────────────────────
                    _isSubmitting
                        ? const Center(
                            child: Padding(
                              padding: EdgeInsets.symmetric(vertical: 8.0),
                              child: CircularProgressIndicator(
                                valueColor: AlwaysStoppedAnimation<Color>(
                                    Color(0xFF007AFF)),
                              ),
                            ),
                          )
                        : Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(16),
                              boxShadow: _selectedNeeds.isNotEmpty
                                  ? [
                                      BoxShadow(
                                        color: const Color(0xFF007AFF)
                                            .withOpacity(0.28),
                                        blurRadius: 18,
                                        offset: const Offset(0, 4),
                                      ),
                                    ]
                                  : [],
                            ),
                            child: ElevatedButton(
                              onPressed: _selectedNeeds.isNotEmpty
                                  ? _submitRequest
                                  : null,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF007AFF),
                                disabledBackgroundColor:
                                    const Color(0xFF007AFF).withOpacity(0.25),
                                minimumSize:
                                    const Size(double.infinity, 52),
                              ),
                              child: Text(
                                _selectedNeeds.isEmpty
                                    ? 'SELECT AID TYPE TO CONTINUE'
                                    : _selectedNeeds.length == 1
                                        ? 'SUBMIT RELIEF REQUEST'
                                        : 'SUBMIT ${_selectedNeeds.length} RELIEF REQUESTS',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ),
                          ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
