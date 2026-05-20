# CrisisNexus NGO Dashboard — Map Fallback Decision Logic

This document describes the core design choices, fallback logic flow, and architectural reasoning behind the high-reliability dual-map dynamic failover implementation.

---

## 1. Architectural Design Decisions

### Choice A: Dynamic CDN Loading vs. NPM Leaflet Install
We decided to load Leaflet dynamically via CDN injection on fallback activation rather than bundling `leaflet` and `react-leaflet` into `package.json`.
* **Reasoning:**
  1. **Next.js SSR Hydration Safety:** Leaflet depends directly on browser-level global variables (`window`, `document`, `navigator`). Direct imports can cause Next.js build-time errors and hydration mismatches during server-side compilation.
  2. **React 19 Compatibility:** `react-leaflet` has deep dependencies on specific React versions that can conflict with the advanced `React 19.2.4` version running in CrisisNexus.
  3. **Zero Impact on Bundle Size:** Operators who have a working Google Maps key will never load the OpenStreetMap libraries, saving network bandwidth and memory overhead.

### Choice B: Tile Selection — CartoDB Dark Matter
Instead of OpenStreetMap's default bright-colored tile scheme, the system utilizes CartoDB's Dark Matter tiles:
`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
* **Reasoning:**
  The CrisisNexus NGO EOC Dashboard uses a highly refined dark glassmorphic design system. Using standard OSM light tiles would cause massive visual contrast shifts, breaking dark-mode layout continuity and operator concentration. CartoDB's Dark Matter fits perfectly, rendering high-contrast dark satellite routes that blend into the dashboard design.

### Choice C: DivIcon SVGs for Markers
Traditional Leaflet markers use default PNG pins. We chose custom `L.divIcon` to render inline SVG templates using the exact vector paths as our Google Maps primary markers.
* **Reasoning:**
  Matches the visual styles of crisis assets perfectly. Allows us to dynamically color-code markers by departments (Logistics as Blue, Rescue as Yellow, Danger as Red/Orange/Green depending on severity) using simple inline CSS styling, preserving 100% telemetry visualization completeness.

---

## 2. Decision Logic Flowchart

```
[Start EOC Dashboard]
         │
         ▼
[Google Maps Init]
         │
         ├──► (Success) ──► [Normal Satellite View]
         │                       │
         │                       └─► (On gm_authFailure Error Triggered)
         │                                   │
         ▼                                   ▼
   (Load Error / API Key Blocked) ──► [Set useOsmFallback = true]
                                             │
                                             ▼
                                 [Render OsmMapViewport]
                                             │
                                             ▼
                               [Lazy Load Leaflet CSS/JS]
                                             │
                                             ▼
                               [Mount dark-mode Leaflet map]
                                             │
                                             ▼
                               [Validate Coordinates (Finite Only)]
                                             │
                                             ▼
                               [Draw circles + interactive SVGs]
                                             │
                                             ▼
                               [EOC Operations Fully Functional]
```

---

## 3. Operational Integrity Guards
To ensure absolute disaster operations reliability:
* **The Telemetry Purge:** Both map rendering engines strictly filter out coordinates that are not finite float values:
  ```typescript
  const safeLat = typeof lat === 'number' && Number.isFinite(lat);
  const safeLng = typeof lng === 'number' && Number.isFinite(lng);
  ```
  This guarantees that mathematical coordinate fallback values or undefined states from Firestore do not pollute the viewports or trigger Leaflet coordinate parse crashes.
* **Event Propagation Safety:** Map markers utilize Leaflet's `.on("click", ...)` to pipe operational data directly to the dashboard React state variables, populating incident detail drawers, assigning emergency personnel, and updating logistics metrics smoothly.
