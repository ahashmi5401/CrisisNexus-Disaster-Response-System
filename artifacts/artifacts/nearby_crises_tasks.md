# Fix Nearby Crises Feature - Tasks

This task list serves as proof that the Antigravity agent was utilized for organizing and executing the geospatial distance filtering architecture for the Nearby Crises feature during the hackathon.

- [x] Fix Nearby Crises Feature
  - [x] Implement `Geolocator` to fetch user's current GPS coordinates on screen load.
  - [x] Update `StreamBuilder` logic to filter `crises` documents.
  - [x] Calculate `Geolocator.distanceBetween()` for each document.
  - [x] Only render crisis documents that are within a 5km radius.
  - [x] Add a loading state while fetching GPS coordinates.
- [x] Verify functionality via Flutter UI.
