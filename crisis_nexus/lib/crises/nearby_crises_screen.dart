import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:geolocator/geolocator.dart';
import '../core/onboarding_guard.dart';
import '../core/ui/severity_config.dart';
import 'crisis_map_modal.dart';

class NearbyCrisesScreen extends StatefulWidget {
  const NearbyCrisesScreen({Key? key}) : super(key: key);

  @override
  State<NearbyCrisesScreen> createState() => _NearbyCrisesScreenState();
}

class _NearbyCrisesScreenState extends State<NearbyCrisesScreen> {
  Position? _currentPosition;
  bool _isLoadingLocation = true;
  String _locationError = '';

  @override
  void initState() {
    super.initState();
    OnboardingGuard.enforceGuard(context);
    _getCurrentLocation();
  }

  Future<void> _getCurrentLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() {
          _locationError = 'Location services are disabled.';
          _isLoadingLocation = false;
        });
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          setState(() {
            _locationError = 'Location permissions are denied';
            _isLoadingLocation = false;
          });
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        setState(() {
          _locationError = 'Location permissions are permanently denied.';
          _isLoadingLocation = false;
        });
        return;
      }

      Position position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      setState(() {
        _currentPosition = position;
        _isLoadingLocation = false;
      });
    } catch (e) {
      setState(() {
        _locationError = 'Failed to acquire location: $e';
        _isLoadingLocation = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0B10),
      appBar: AppBar(
        title: const Text('Threat & Crisis Feed'),
        backgroundColor: Colors.transparent,
      ),
      body: Stack(
        children: [
          // Background ambient soft red glow on threat feed
          Positioned(
            top: -50,
            right: -50,
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFFD3C5B).withOpacity(0.04),
                    blurRadius: 100,
                    spreadRadius: 40,
                  ),
                ],
              ),
            ),
          ),
          if (_isLoadingLocation)
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const CircularProgressIndicator(
                    valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFFD3C5B)),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'ACQUIRING GPS LOCK...',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.5,
                      color: Colors.white.withOpacity(0.7),
                    ),
                  ),
                ],
              ),
            )
          else if (_locationError.isNotEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(32.0),
                child: Text(
                  _locationError,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFFFD3C5B)),
                ),
              ),
            )
          else
            StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('crises')
                  .orderBy('time', descending: true)
                  .limit(100) // Limit to recent 100 before client-side filter
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return const Center(
                    child: Text(
                      'Operational telemetry sync failure',
                      style: TextStyle(color: Color(0xFFFD3C5B)),
                    ),
                  );
                }
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: CircularProgressIndicator(
                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFFD3C5B)),
                    ),
                  );
                }

                // Client-side distance filtering
                final docs = snapshot.data?.docs ?? [];
                final nearbyDocs = docs.where((doc) {
                  final data = doc.data() as Map<String, dynamic>;
                  final location = data['location'];
                  if (location == null || location['lat'] == null || location['lng'] == null) {
                    return false;
                  }

                  double distanceInMeters = Geolocator.distanceBetween(
                    _currentPosition!.latitude,
                    _currentPosition!.longitude,
                    (location['lat'] as num).toDouble(),
                    (location['lng'] as num).toDouble(),
                  );

                  // Filter within 5km (5000 meters)
                  return distanceInMeters <= 5000;
                }).toList();

                if (nearbyDocs.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: const Color(0xFF161922),
                            border: Border.all(
                              color: Colors.white.withOpacity(0.06),
                              width: 1,
                            ),
                          ),
                          child: Icon(
                            Icons.radar_rounded,
                            size: 40,
                            color: Colors.white.withOpacity(0.3),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'GRID MONITOR NOMINAL',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.5,
                            color: Colors.white.withOpacity(0.7),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'No active regional crises detected inside this sector.',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.white.withOpacity(0.4),
                          ),
                        ),
                      ],
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                  itemCount: nearbyDocs.length,
                  itemBuilder: (context, index) {
                    final doc = nearbyDocs[index];
                    final data = doc.data() as Map<String, dynamic>;
                    final rawSeverity = data['severity'];
                    final String severity = SeverityConfig.parseSeverity(rawSeverity);
                    final Color severityColor = SeverityConfig.getColor(severity);
                    final String severityLabel = SeverityConfig.getLabel(severity);

                    final String status = (data['status'] ?? 'Active').toString().toUpperCase();

                    // Calculate distance for display and check coordinates validity (Case 4)
                    final location = data['location'];
                    final bool isLocationValid = location != null && 
                        location['lat'] != null && 
                        location['lng'] != null;

                    double distanceInMeters = 0.0;
                    if (isLocationValid && _currentPosition != null) {
                      distanceInMeters = Geolocator.distanceBetween(
                        _currentPosition!.latitude,
                        _currentPosition!.longitude,
                        (location['lat'] as num).toDouble(),
                        (location['lng'] as num).toDouble(),
                      );
                    }
                    String distanceStr = isLocationValid 
                        ? '${(distanceInMeters / 1000).toStringAsFixed(1)} km away • Telemetry Lock' 
                        : 'Location unavailable';

                    return Stack(
                      children: [
                        // The Outer Container (defines size and base content)
                        Container(
                          margin: const EdgeInsets.only(bottom: 16),
                          clipBehavior: Clip.antiAlias,
                          decoration: BoxDecoration(
                            color: const Color(0xFF161922),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: Colors.white.withOpacity(0.06),
                              width: 1,
                            ),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: severityColor.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                          color: severityColor.withOpacity(0.3),
                                          width: 1,
                                        ),
                                      ),
                                      child: Text(
                                        severityLabel,
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w900,
                                          letterSpacing: 0.8,
                                          color: severityColor,
                                        ),
                                      ),
                                    ),
                                    if (severity == 'Critical') ...[
                                      const SizedBox(width: 8),
                                      const PulsingWarningIcon(),
                                    ],
                                    const Spacer(),
                                    Row(
                                      children: [
                                        Container(
                                          width: 6,
                                          height: 6,
                                          decoration: const BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: Color(0xFF34C759),
                                          ),
                                        ),
                                        const SizedBox(width: 6),
                                        Text(
                                          status,
                                          style: const TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.bold,
                                            color: Color(0xFF34C759),
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 16),
                                Text(
                                  (data['title'] ?? 'Unknown Crisis').toString(),
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  (data['aiSummary'] ?? data['description'] ?? 'Emergency operational alert logged. Dispatch in progress.').toString(),
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: Colors.white.withOpacity(0.6),
                                    height: 1.4,
                                  ),
                                ),
                                const SizedBox(height: 16),
                                const Divider(color: Colors.white10),
                                const SizedBox(height: 8),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Row(
                                        children: [
                                          Icon(
                                            Icons.location_on_outlined,
                                            size: 14,
                                            color: Colors.white.withOpacity(0.4),
                                          ),
                                          const SizedBox(width: 6),
                                          Expanded(
                                            child: Text(
                                              distanceStr,
                                              style: TextStyle(
                                                fontSize: 11,
                                                color: Colors.white.withOpacity(0.4),
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    TextButton.icon(
                                      style: TextButton.styleFrom(
                                        foregroundColor: isLocationValid 
                                            ? const Color(0xFF007AFF) 
                                            : Colors.white24,
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                        minimumSize: Size.zero,
                                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                      ),
                                      icon: Icon(
                                        isLocationValid ? Icons.map_outlined : Icons.map_sharp, 
                                        size: 14,
                                        color: isLocationValid ? const Color(0xFF007AFF) : Colors.white24,
                                      ),
                                      label: Text(
                                        isLocationValid ? 'VIEW ON MAP' : 'MAP UNAVAILABLE',
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                          letterSpacing: 0.5,
                                          color: isLocationValid ? const Color(0xFF007AFF) : Colors.white24,
                                        ),
                                      ),
                                      onPressed: isLocationValid 
                                          ? () {
                                              CrisisMapModal.show(context, data);
                                            }
                                          : null,
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                        // Positioned Left Strip inside Stack (renders visual indicator strip without IntrinsicHeight performance penalty)
                        Positioned(
                          left: 0,
                          top: 0,
                          bottom: 16, // Matches the bottom margin of the container
                          child: ClipRRect(
                            borderRadius: const BorderRadius.only(
                              topLeft: Radius.circular(20),
                              bottomLeft: Radius.circular(20),
                            ),
                            child: Container(
                              width: severity == 'Critical' ? 6 : 4,
                              color: severityColor,
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                );
              },
            ),
        ],
      ),
    );
  }
}

class PulsingWarningIcon extends StatefulWidget {
  const PulsingWarningIcon({Key? key}) : super(key: key);

  @override
  State<PulsingWarningIcon> createState() => _PulsingWarningIconState();
}

class _PulsingWarningIconState extends State<PulsingWarningIcon> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..repeat(reverse: true);
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
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: const Color(0xFFFD3C5B).withOpacity(0.1 + (_controller.value * 0.15)),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(
              color: const Color(0xFFFD3C5B).withOpacity(0.3 + (_controller.value * 0.4)),
              width: 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.gpp_maybe_rounded,
                color: const Color(0xFFFD3C5B).withOpacity(0.6 + (_controller.value * 0.4)),
                size: 14,
              ),
              const SizedBox(width: 4),
              Text(
                'LIVE THREAT',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  color: const Color(0xFFFD3C5B).withOpacity(0.6 + (_controller.value * 0.4)),
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}


