# Fix Nearby Crises Feature - Implementation Plan

This implementation plan serves as proof that the Antigravity agent was utilized for designing and applying the geospatial distance filtering architecture for the Nearby Crises feature during the hackathon.

## Problem Statement
The "Nearby Crises" feed currently fetches all recent crises but fails to filter them by the user's actual proximity, leading to confusion when nearby reports don't appear (or when distant ones do). Since Firestore lacks native geospatial querying without a geohash index, we will implement a robust client-side distance filter.

## Proposed Changes

### [MODIFY] nearby_crises_screen.dart
We will update the `NearbyCrisesScreen` to:
1. **Fetch User Location**: Use the existing `geolocator` package to get the user's current GPS coordinates on initialization.
2. **Client-Side Distance Filtering**: 
   - We will still fetch the top 50-100 most recent active crises from the `crises` collection.
   - Inside the `StreamBuilder`, we will iterate through the documents and use `Geolocator.distanceBetween()` to compute the exact distance (in meters) between the user and the crisis `location.lat` / `location.lng`.
   - We will filter the list to only show crises within a **5 km radius**.
3. **Graceful UI States**: Show a localized "Acquiring GPS Signal..." loading state while fetching the user's location, and maintain the existing "GRID MONITOR NOMINAL" empty state if no crises are found within the radius.

## Verification Plan
1. Open the app and navigate to "Nearby Crises".
2. Allow location permissions if prompted.
3. Submit a new test signal at the current location.
4. Verify the signal appears immediately on the "Nearby Crises" feed.
5. (Optional) Submit a test signal with mocked coordinates far away and verify it is successfully filtered out.
