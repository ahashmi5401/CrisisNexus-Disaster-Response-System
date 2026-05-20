import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

class MapProviderWrapper extends StatelessWidget {
  final double latitude;
  final double longitude;
  final Color markerColor;
  final double? radiusKm;
  final double circleOpacity;
  final String title;

  const MapProviderWrapper({
    Key? key,
    required this.latitude,
    required this.longitude,
    required this.markerColor,
    this.radiusKm,
    this.circleOpacity = 0.20,
    this.title = 'Crisis Location',
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Center point using latlong2
    final LatLng center = LatLng(latitude, longitude);

    return FlutterMap(
      options: MapOptions(
        initialCenter: center,
        initialZoom: 14.0,
      ),
      children: [
        // Layer 1: TileLayer
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.crisisnexus.app',
        ),
        // Layer 2: CircleLayer
        if (radiusKm != null)
          CircleLayer(
            circles: [
              CircleMarker(
                point: center,
                radius: radiusKm! * 1000, // Convert to meters
                useRadiusInMeter: true,
                color: markerColor.withOpacity(circleOpacity),
                borderColor: markerColor.withOpacity(circleOpacity * 2.0 > 1.0 ? 1.0 : circleOpacity * 2.0),
                borderStrokeWidth: 2.0,
              ),
            ],
          ),
        // Layer 3: MarkerLayer
        MarkerLayer(
          markers: [
            Marker(
              point: center,
              width: 50,
              height: 50,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Outer soft glowing ring
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: markerColor.withOpacity(0.25),
                    ),
                  ),
                  Icon(
                    Icons.location_on_rounded,
                    color: markerColor,
                    size: 32,
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}
