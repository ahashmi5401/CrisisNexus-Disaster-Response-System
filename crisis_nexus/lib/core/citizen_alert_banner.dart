import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Listens to active coordinator alerts targeted at citizens or ALL.
/// Shows a modal dialog popup when a new alert arrives.
class CitizenAlertListener extends StatefulWidget {
  final Widget child;
  const CitizenAlertListener({super.key, required this.child});

  @override
  State<CitizenAlertListener> createState() => _CitizenAlertListenerState();
}

class _CitizenAlertListenerState extends State<CitizenAlertListener> {
  final Set<String> _shownAlertIds = {};
  bool _isLoaded = false;

  @override
  void initState() {
    super.initState();
    _loadShownAlerts();
  }

  Future<void> _loadShownAlerts() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final List<String> dismissed = prefs.getStringList('dismissed_alerts') ?? [];
      if (mounted) {
        setState(() {
          _shownAlertIds.addAll(dismissed);
          _isLoaded = true;
        });
      }
    } catch (e) {
      debugPrint('Error loading shown alerts: $e');
      if (mounted) {
        setState(() {
          _isLoaded = true;
        });
      }
    }
  }

  Future<void> _acknowledgeAlert(String id) async {
    try {
      setState(() {
        _shownAlertIds.add(id);
      });
      final prefs = await SharedPreferences.getInstance();
      final List<String> dismissed = prefs.getStringList('dismissed_alerts') ?? [];
      if (!dismissed.contains(id)) {
        dismissed.add(id);
        await prefs.setStringList('dismissed_alerts', dismissed);
      }
    } catch (e) {
      debugPrint('Error acknowledging alert: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    // Prevent listening to alerts or triggering popups until SharedPreferences is fully loaded.
    if (!_isLoaded) {
      return widget.child;
    }

    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('alerts')
          .where('isActive', isEqualTo: true)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasData) {
          final citizenAlerts = snapshot.data!.docs.where((doc) {
            final data = doc.data() as Map<String, dynamic>;
            final role = (data['targetRole'] as String? ?? '').toUpperCase();
            return role == 'ALL' || role == 'CITIZENS';
          }).toList();

          // Trigger popup for any new alert not yet shown
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            for (final doc in citizenAlerts) {
              if (!_shownAlertIds.contains(doc.id)) {
                _acknowledgeAlert(doc.id);
                final data = doc.data() as Map<String, dynamic>;
                final message = data['message'] as String? ?? '';
                final createdBy = data['createdBy'] as String? ?? 'NGO Command';
                _showAlertPopup(message, createdBy);
              }
            }
          });
        }

        return widget.child;
      },
    );
  }

  void _showAlertPopup(String message, String createdBy) {
    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (context) => Dialog(
        backgroundColor: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF121A2B),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: const Color(0xFFEF4444).withOpacity(0.5),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFEF4444).withOpacity(0.15),
                blurRadius: 30,
                spreadRadius: 2,
              ),
            ],
          ),
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444).withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.campaign_rounded,
                      color: Color(0xFFEF4444),
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'NGO BROADCAST',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.5,
                            color: Color(0xFFEF4444),
                          ),
                        ),
                        Text(
                          'Official Alert',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(color: Colors.white10, height: 1),
              const SizedBox(height: 16),

              // Message
              Text(
                message,
                style: const TextStyle(
                  fontSize: 14,
                  color: Colors.white,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 12),

              // Sender
              Text(
                'Sent by: $createdBy',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.white.withOpacity(0.4),
                ),
              ),
              const SizedBox(height: 20),

              // Action button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFEF4444),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    elevation: 0,
                  ),
                  onPressed: () => Navigator.pop(context),
                  child: const Text(
                    'ACKNOWLEDGED',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.0,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Inline banner showing active coordinator alerts for citizens.
/// Use this for persistent visibility on the home screen.
class CitizenAlertBanner extends StatefulWidget {
  const CitizenAlertBanner({super.key});

  @override
  State<CitizenAlertBanner> createState() => _CitizenAlertBannerState();
}

class _CitizenAlertBannerState extends State<CitizenAlertBanner> {
  final Set<String> _dismissedAlertIds = {};
  bool _isLoaded = false;

  @override
  void initState() {
    super.initState();
    _loadDismissedAlerts();
  }

  Future<void> _loadDismissedAlerts() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final List<String> dismissed = prefs.getStringList('dismissed_alerts') ?? [];
      if (mounted) {
        setState(() {
          _dismissedAlertIds.addAll(dismissed);
          _isLoaded = true;
        });
      }
    } catch (e) {
      debugPrint('Error loading dismissed alerts: $e');
      if (mounted) {
        setState(() {
          _isLoaded = true;
        });
      }
    }
  }

  Future<void> _dismissAlert(String id) async {
    try {
      setState(() {
        _dismissedAlertIds.add(id);
      });
      final prefs = await SharedPreferences.getInstance();
      final List<String> dismissed = prefs.getStringList('dismissed_alerts') ?? [];
      if (!dismissed.contains(id)) {
        dismissed.add(id);
        await prefs.setStringList('dismissed_alerts', dismissed);
      }
    } catch (e) {
      debugPrint('Error saving dismissed alert: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    // Prevent rendering banners or flickering until SharedPreferences is fully loaded.
    if (!_isLoaded) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('alerts')
          .where('isActive', isEqualTo: true)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const SizedBox.shrink();

        final alerts = snapshot.data!.docs.where((doc) {
          if (_dismissedAlertIds.contains(doc.id)) return false;
          final role = ((doc.data() as Map<String, dynamic>)['targetRole'] as String? ?? '').toUpperCase();
          return role == 'ALL' || role == 'CITIZENS';
        }).toList();

        if (alerts.isEmpty) return const SizedBox.shrink();

        return Column(
          children: [
            ...alerts.map((doc) {
              final data = doc.data() as Map<String, dynamic>;
              return _AlertBannerTile(
                message: data['message'] as String? ?? '',
                createdBy: data['createdBy'] as String? ?? 'NGO Command',
                onDismiss: () => _dismissAlert(doc.id),
              );
            }),
            const SizedBox(height: 12),
          ],
        );
      },
    );
  }
}

class _AlertBannerTile extends StatelessWidget {
  final String message;
  final String createdBy;
  final VoidCallback onDismiss;

  const _AlertBannerTile({
    required this.message,
    required this.createdBy,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFEF4444).withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.campaign_rounded, color: Color(0xFFEF4444), size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'NGO BROADCAST ALERT',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                    color: Color(0xFFEF4444),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  message,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  'From: $createdBy',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.white.withOpacity(0.4),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: onDismiss,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.08),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.close_rounded,
                color: Colors.white70,
                size: 14,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
