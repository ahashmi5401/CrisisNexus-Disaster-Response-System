# CrisisNexus NGO Dashboard — Map Fallback Before/After Logs

This document tracks the code-level change logs mapping the original map structure to the high-reliability dual-map dynamic failover implementation.

---

## 1. Map Render Controller Structure

### Before Configuration
The dashboard map component was strictly dependent on the `@react-google-maps/api` package. If any loading or runtime error occurred, the system rendered a static warning overlay card, completely blocking the EOC coordinator from viewing active crisis coordinates:

```typescript
// Original implementation in MapOpsLayer.tsx
if (!apiKey.trim() || activeMapError) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 p-6 text-center bg-zinc-950 rounded-xl border border-zinc-800">
      <AlertTriangle className="w-8 h-8 text-amber-400 mb-3" />
      <p className="text-sm font-bold uppercase tracking-wider text-amber-500">Map Authentication Restriction</p>
      <p className="text-xs text-zinc-400 mt-2 max-w-md">
        {activeMapError || "Please configure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY..."}
      </p>
    </div>
  );
}
```

### After Configuration
The map controller checks for load errors or async authentication events. If triggered, it dynamically shifts the map state to render `OsmMapViewport` using dynamically loaded Leaflet assets, ensuring zero downtime:

```typescript
// Upgraded dual-map control logic in MapOpsLayer.tsx
const [useOsmFallback, setUseOsmFallback] = useState(false);

// Trigger failover on load error or async gm_authFailure
useEffect(() => {
  if (activeMapError) {
    console.warn("Triggering OpenStreetMap fallback due to Google Maps error:", activeMapError);
    setUseOsmFallback(true);
  }
}, [activeMapError]);

// Dynamic Rendering Switch
if (useOsmFallback) {
  return (
    <div className="w-full h-full relative">
      <OsmMapViewport
        mapCenter={mapCenter}
        clusteredMarkers={clusteredMarkers}
        crises={crises}
        onMarkerClick={onMarkerClick}
      />
      {/* Sleek top-right operational banner */}
      <div className="absolute top-3 right-3 bg-zinc-950/90 backdrop-blur border border-amber-500/50 rounded-lg px-3 py-1.5 shadow-lg z-[1000] flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
        <span className="text-[10px] font-mono font-bold text-amber-400 tracking-wider">
          🌐 OpenStreetMap Fallback Active (Google Maps Restricted)
        </span>
      </div>
    </div>
  );
}
```

---

## 2. Dynamic Asset Injections
* **Before:** No secondary map dependencies or dynamic asset loaders existed in the dashboard layers.
* **After:** Self-contained client-side dynamic loader injects Leaflet's standard CSS and JS binaries into the DOM strictly when `useOsmFallback` evaluates to `true`. This guarantees no hydration warnings or Next.js server-side crashes:
  ```typescript
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }
    
    // Inject Leaflet CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    // Inject Leaflet JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setLeafletLoaded(true);
    document.body.appendChild(script);
  }, []);
  ```

---

## 3. High-Fidelity OSM Render Layer
* **Before:** Custom SVGs and circles were bound to Google Map components (`<Circle>`, `<Marker>`).
* **After:** Handled natively in Leaflet with custom DOM icons (`L.divIcon`) holding the identical path dimensions and custom CSS styles to perfectly mimic premium Google Maps custom vectors, maintaining EOC operator layout confidence.
