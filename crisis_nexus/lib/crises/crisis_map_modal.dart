import 'package:flutter/material.dart';
import '../core/ui/map_provider_wrapper.dart';
import '../core/ui/severity_config.dart';

class CrisisMapModal extends StatelessWidget {
  final Map<String, dynamic> crisisData;

  const CrisisMapModal({
    Key? key,
    required this.crisisData,
  }) : super(key: key);

  static void show(BuildContext context, Map<String, dynamic> crisisData) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => CrisisMapModal(crisisData: crisisData),
    );
  }

  @override
  Widget build(BuildContext context) {
    final location = crisisData['location'];
    if (location == null || location['lat'] == null || location['lng'] == null) {
      return const SizedBox.shrink();
    }

    final double lat = (location['lat'] as num).toDouble();
    final double lng = (location['lng'] as num).toDouble();
    
    // Parse severity using centralized config
    final rawSeverity = crisisData['severity'];
    final String severity = SeverityConfig.parseSeverity(rawSeverity);
    final Color severityColor = SeverityConfig.getColor(severity);
    final String severityLabel = SeverityConfig.getLabel(severity);

    // Blast/affected radius (with robust backend & backward compatibility lookup)
    final double radiusKm = SeverityConfig.getRadiusKm(crisisData['radiusKm'], severity);
    final double circleOpacity = SeverityConfig.getCircleOpacity(severity);

    final String type = (crisisData['type'] ?? crisisData['subType'] ?? 'Crisis Node').toString();

    return Container(
      height: MediaQuery.of(context).size.height * 0.75, // Responsive 75% height
      decoration: const BoxDecoration(
        color: Color(0xFF0A0B10), // Matching app theme background
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(28),
          topRight: Radius.circular(28),
        ),
      ),
      child: Column(
        children: [
          // Elegant Header Drag Handle
          const SizedBox(height: 12),
          Container(
            width: 48,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),
          
          // Header Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        type.toUpperCase(),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          letterSpacing: 0.5,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: severityColor,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            '$severityLabel THREAT STATUS',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              color: severityColor,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withOpacity(0.05),
                    ),
                    child: const Icon(Icons.close, color: Colors.white, size: 18),
                  ),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Step 4: Map Header Danger Label (Banner Overlay inside modal sheet)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: severityColor.withOpacity(0.08),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: severityColor.withOpacity(0.25),
                width: 1,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.warning_amber_rounded,
                  color: severityColor,
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${severityLabel} DANGER ZONE',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                          color: severityColor,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Affected Radius: ${radiusKm.toStringAsFixed(1)} km',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.white.withOpacity(0.6),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          
          // Map Container
          Expanded(
            child: ClipRRect(
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(24),
                topRight: Radius.circular(24),
              ),
              child: MapProviderWrapper(
                latitude: lat,
                longitude: lng,
                markerColor: severityColor,
                radiusKm: radiusKm,
                circleOpacity: circleOpacity,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
