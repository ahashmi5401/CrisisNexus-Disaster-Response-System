# CrisisNexus NGO Dashboard — Map Fallback System Implementation Plan

This document outlines the architecture, configuration, and implementation logic for the dual-map system within the CrisisNexus NGO Dashboard. It details the seamless trigger conditions, fallback rendering strategy (OpenStreetMap/Leaflet), data validation policies, and deployment verification details.

---

## 1. Dual-Map Architecture
The map layer utilizes a layered strategy to guarantee 100% operational uptime in humanitarian crisis contexts:
* **Primary Engine:** Google Maps JavaScript API (Satellite operations view).
* **Fallback Engine:** OpenStreetMap (OSM) dynamic client-side Leaflet viewport.

The transition between map engines occurs seamlessly inside the React virtual DOM without requiring page refreshes, ensuring zero state or EOC telemetry data loss.

```mermaid
graph TD
    A[Start Map Component] --> B{Google Maps Key Configured?}
    B -- No -- > C[Activate OSM Fallback]
    B -- Yes --> D[Initialize Google Maps API Loader]
    D --> E{API Loader Succeeds?}
    E -- No (Network / Key Error) --> C
    E -- Yes --> F[Mount Google Map Component]
    F --> G{gm_authFailure / Async Key Error?}
    G -- Yes (ApiTargetBlockedMapError) --> C
    G -- No --> H[Render Primary Google Map View]
    C --> I[Lazy Load Leaflet CSS & JS Assets]
    I --> J[Initialize Leaflet Map Container]
    J --> K[Render CartoDB Dark Matter tile layer]
    K --> L[Inject Custom Interactive SVGs & Circles]
```

---

## 2. Fallback Trigger Conditions
The failover controller switches to the OSM fallback viewport if any of the following conditions evaluate to `true`:
1. **Implicit Deactivation:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is missing or contains an empty string.
2. **Synchronous Load Failures:** `@react-google-maps/api` `loadError` is thrown during script loading (e.g. DNS failure, script blocked by network firewalls).
3. **Asynchronous Authentication Errors:** Triggering of the global `window.gm_authFailure` event handler by Google Maps API (specifically handles `ApiTargetBlockedMapError`, `RefererNotAllowedMapError`, `BillingNotEnabledMapError`, and `InvalidKeyMapError`).
4. **Validation/Telemetry Guards:** If any underlying coordinate datasets fail validation or if standard map instance rendering remains undefined for consecutive mounting frames.

---

## 3. OSM Fallback Specifications
* **Tile Provider:** Leaflet + `CartoDB.DarkMatter` tiles (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`) for premium high-contrast dark theme continuity.
* **Circle Radii:** Renders interactive `L.circle` overlays representing the threat radius of crises, matching custom severity-colored strokes and fills.
* **Custom SVG Incidents:** Custom HTML icons via `L.divIcon` which embed high-fidelity SVGs for **Danger** (crises), **Aid** (relief assets), and **Queue** (events) with color coding matching Google Map custom pins.
* **Interactivity:** Binding Leaflet interactive listeners (`click`) directly to React callback handles (`onMarkerClick`) to populate EOC detail panels, status updates, and dispatch forms without breaking EOC coordinator operations.

---

## 4. Performance & Data Safety Policy
* **Dynamic Script Injection:** Leaflet stylesheet and runtime binaries are dynamically loaded on-demand ONLY when the fallback condition triggers. No script tags or imports are executed on successful Google Maps initialization, keeping initial NGO bundle size clean.
* **Strict Coordinate Validation (Zero Fabricated Coordinates Policy):** Both rendering pipelines validate all incoming incidents using strict telemetry filters:
  ```typescript
  const isValid = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
  ```
  Any record with invalid, undefined, or fallback-placeholder coordinates is automatically purged from the viewport list to prevent system crashes.
