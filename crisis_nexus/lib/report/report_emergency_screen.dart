import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/location_service.dart';
import '../core/crisis_ingestion_controller.dart';
import '../core/onboarding_guard.dart';

class ReportEmergencyScreen extends StatefulWidget {
  const ReportEmergencyScreen({Key? key}) : super(key: key);

  @override
  State<ReportEmergencyScreen> createState() => _ReportEmergencyScreenState();
}

class _ReportEmergencyScreenState extends State<ReportEmergencyScreen> {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  final TextEditingController _descriptionController = TextEditingController();

  String? _selectedCrisisType;
  final List<String> _crisisTypes = [
    'Flood',
    'Earthquake',
    'Fire',
    'Medical Emergency',
    'Accident',
    'Other'
  ];

  String _selectedSeverity = 'Medium';
  final List<String> _severities = ['Low', 'Medium', 'High', 'Critical'];

  double? _lat;
  double? _lng;
  double? _accuracy;
  bool _isFetchingLocation = false;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    OnboardingGuard.enforceGuard(context);
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _fetchLocation() async {
    setState(() {
      _isFetchingLocation = true;
    });

    final user = _auth.currentUser;
    if (user == null) {
      setState(() => _isFetchingLocation = false);
      return;
    }

    final resolved = await LocationService.resolveIngestionLocation(user.uid);
    
    if (mounted) {
      setState(() {
        _lat = resolved.latitude;
        _lng = resolved.longitude;
        _accuracy = resolved.accuracy;
        _isFetchingLocation = false;
      });

      if (resolved.source == 'GPS') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('GPS Lock Acquired successfully.'),
            backgroundColor: Color(0xFF34C759),
          ),
        );
      } else if (resolved.source != 'None') {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('GPS lock unavailable. Resolved via ${resolved.source}.'),
            backgroundColor: const Color(0xFFFF9500),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to retrieve location telemetry. Please enable GPS or verify your onboarding profile.'),
            backgroundColor: Color(0xFFFD3C5B),
          ),
        );
      }
    }
  }

  Future<void> _submitReport() async {
    if (_isSubmitting) return;
    if (_selectedCrisisType == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a crisis type')),
      );
      return;
    }
    if (_descriptionController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please provide a description')),
      );
      return;
    }

    final user = _auth.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You must be logged in to report')),
      );
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      debugPrint('[UI SCREEN] Delegating emergency signal submission to CrisisIngestionController.');
      await CrisisIngestionController.submitEmergencySignal(
        type: _selectedCrisisType!,
        severityString: _selectedSeverity,
        description: _descriptionController.text.trim(),
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Emergency report submitted successfully')),
        );
        Navigator.pop(context); // Return to HomeScreen
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error submitting report: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF0A0B10),
      appBar: AppBar(
        title: const Text('Broadcast Emergency'),
        backgroundColor: Colors.transparent,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Premium top visual warning alert banner
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFFD3C5B).withOpacity(0.08),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: const Color(0xFFFD3C5B).withOpacity(0.2),
                    width: 1.2,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFFFD3C5B).withOpacity(0.12),
                      ),
                      child: const Icon(
                        Icons.crisis_alert_rounded,
                        color: Color(0xFFFD3C5B),
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'EMERGENCY BROADCAST SYSTEM',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                              color: Color(0xFFFD3C5B),
                              letterSpacing: 1.0,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Reports are processed with real-time CIRO risk assessments to organize swift NGO responses.',
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
              
              // Form details inside a custom polished container
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
                    const Text(
                      'CRISIS REPORT METADATA',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.5,
                        color: Color(0xFF007AFF),
                      ),
                    ),
                    const SizedBox(height: 24),
                    
                    // Crisis Type Dropdown
                    DropdownButtonFormField<String>(
                      decoration: const InputDecoration(
                        labelText: 'Crisis Category',
                        prefixIcon: Icon(Icons.category_outlined),
                      ),
                      dropdownColor: const Color(0xFF161922),
                      style: const TextStyle(color: Colors.white, fontSize: 16),
                      value: _selectedCrisisType,
                      items: _crisisTypes.map((type) {
                        return DropdownMenuItem(
                          value: type,
                          child: Text(type),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() {
                          _selectedCrisisType = value;
                        });
                      },
                    ),
                    const SizedBox(height: 24),

                    // Severity Level Label
                    const Text(
                      'SEVERITY IMPACT LEVEL',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.2,
                        color: Colors.grey,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8.0,
                      runSpacing: 8.0,
                      children: _severities.map((severity) {
                        final isSelected = _selectedSeverity == severity;
                        Color activeColor = const Color(0xFF007AFF);
                        if (severity == 'Critical') {
                          activeColor = const Color(0xFFFD3C5B);
                        } else if (severity == 'High') {
                          activeColor = const Color(0xFFFF9500);
                        } else if (severity == 'Low') {
                          activeColor = const Color(0xFF34C759);
                        }
                        
                        return GestureDetector(
                          onTap: () {
                            setState(() {
                              _selectedSeverity = severity;
                            });
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                            decoration: BoxDecoration(
                              color: isSelected 
                                  ? activeColor.withOpacity(0.12)
                                  : const Color(0xFF0A0B10),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: isSelected 
                                    ? activeColor 
                                    : Colors.white.withOpacity(0.08),
                                width: 1.5,
                              ),
                              boxShadow: isSelected ? [
                                BoxShadow(
                                  color: activeColor.withOpacity(0.15),
                                  blurRadius: 8,
                                  spreadRadius: 1,
                                )
                              ] : [],
                            ),
                            child: Text(
                              severity.toUpperCase(),
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                                color: isSelected ? activeColor : Colors.white.withOpacity(0.6),
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 28),

                    // Description Input
                    TextField(
                      controller: _descriptionController,
                      maxLines: 4,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Detailed Incident Description',
                        alignLabelWithHint: true,
                        hintText: 'Describe active casualties, structures affected, or current accessibility issues...',
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Auto Location Visual Feedback Panel
                    const Text(
                      'GPS TELEMETRY DATA',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.2,
                        color: Colors.grey,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0A0B10),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: Colors.white.withOpacity(0.06),
                          width: 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: (_lat != null && _lng != null)
                                  ? const Color(0xFF34C759).withOpacity(0.1)
                                  : const Color(0xFF007AFF).withOpacity(0.1),
                            ),
                            child: Icon(
                              Icons.location_searching_rounded,
                              color: (_lat != null && _lng != null)
                                  ? const Color(0xFF34C759)
                                  : const Color(0xFF007AFF),
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _lat != null && _lng != null
                                      ? 'Telemetry Locked'
                                      : 'Telemetry Unlocked',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                    color: (_lat != null && _lng != null)
                                        ? const Color(0xFF34C759)
                                        : Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  _lat != null && _lng != null
                                      ? 'Lat: ${_lat!.toStringAsFixed(5)}, Lng: ${_lng!.toStringAsFixed(5)}'
                                      : 'Fetch device coordinates below to complete report.',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.white.withOpacity(0.4),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (_isFetchingLocation)
                            const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF007AFF)),
                              ),
                            )
                          else
                            TextButton(
                              onPressed: _fetchLocation,
                              style: TextButton.styleFrom(
                                foregroundColor: const Color(0xFF007AFF),
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  side: BorderSide(color: const Color(0xFF007AFF).withOpacity(0.2)),
                                ),
                              ),
                              child: const Text(
                                'FETCH',
                                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11),
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 36),

                    // Submit Button
                    _isSubmitting
                        ? const Center(
                            child: Padding(
                              padding: EdgeInsets.symmetric(vertical: 8.0),
                              child: CircularProgressIndicator(
                                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFFD3C5B)),
                              ),
                            ),
                          )
                        : Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(16),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFFFD3C5B).withOpacity(0.25),
                                  blurRadius: 16,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: ElevatedButton(
                              onPressed: _submitReport,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFFFD3C5B),
                              ),
                              child: const Text('BROADCAST EMERGENCY SIGNAL'),
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
