import React, { useState, useEffect, useCallback, useMemo } from "react";
import { GoogleMap, useJsApiLoader, Marker, Circle, MarkerClusterer } from "@react-google-maps/api";
import { collection, onSnapshot, query, orderBy, where, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./AuthProvider";
import { normalizeSeverity, getSeverityColor } from "../lib/severityHelper";
import { AlertTriangle, Users, User, Phone, Brain, CloudRain, ShieldAlert, Sparkles, Clock, CheckCircle2, Truck, Package, FileWarning, ChevronDown, ChevronUp, Radio } from "lucide-react";
import { normalizeCrisis } from "../lib/normalizeCrisis";
import { resolveCrisisCoordinates } from "../lib/displayUtils";
import { DataQualityLayer, calculateDataIntegrity } from "./DataQualityLayer";
import { normalizeNGORecord } from "../lib/normalizeNGORecord";
import { resolveCrisis, isSyntheticText, isSyntheticCrisis } from "../lib/safeCrisisResolver";

// Map constraints for cost optimization
const mapContainerStyle = { width: "100%", height: "100%" };
const DEFAULT_MAP_CENTER = { lat: 24.8607, lng: 67.0011 };
// CrisisNexus Truth Rule: No synthetic, estimated, or fallback data is allowed. Missing Firestore data must remain missing.
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  styles: [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [{ color: "#d59563" }],
    },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  ],
};

const SVG_MARKERS = {
  danger: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
  aid: "M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z",
  queue: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
};

type MapLoadErrorKind = "missing_key" | "invalid_key" | "api_target_blocked" | "referer_not_allowed" | "billing_not_enabled" | "load_failed";

const getMapErrorMessage = (kind: MapLoadErrorKind): string => {
  switch (kind) {
    case "missing_key":
      return "Google Maps is unavailable because the API key is missing.";
    case "invalid_key":
      return "Google Maps is unavailable because the API key is invalid.";
    case "api_target_blocked":
      return "Google Maps is currently unavailable due to API authorization restrictions.";
    case "referer_not_allowed":
      return "Google Maps is currently unavailable because this domain is not allowed for the configured API key.";
    case "billing_not_enabled":
      return "Google Maps is currently unavailable because billing is not enabled for this project.";
    case "load_failed":
    default:
      return "Google Maps failed to load. Please check your network or API configuration.";
  }
};

interface MapItemRecord {
  [key: string]: any;
  key: string;
  markerType: "crisis" | "relief" | "queue";
  crisisId?: string;
  id?: string;
  eventId?: string;
  ciroIntelligenceId?: string;
  userId?: string;
  title?: string;
  subType?: string;
  eventType?: string;
  status?: string;
  severity?: string | number;
  severityString?: string;
  priorityScore?: number;
  radiusKm?: number;
  location?: { lat?: number; lng?: number; name?: string };
  payload?: { location?: { lat?: number; lng?: number; name?: string } };
  aiSummary?: string;
  notes?: string;
  description?: string;
  history?: Array<{ action?: string; status?: string; time?: string; createdAt?: string; timestamp?: string }>;
  affectedPopulation?: number;
  confidence?: number;
  dataSources?: string[];
  assignedRoles?: string[];
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const getMapLoadErrorKind = (message: string): MapLoadErrorKind => {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalidkeymaperror") || normalized.includes("api key") && normalized.includes("invalid")) return "invalid_key";
  if (normalized.includes("apitargetblockedmaperror") || normalized.includes("api target blocked")) return "api_target_blocked";
  if (normalized.includes("referernotallowedmaperror") || normalized.includes("referer")) return "referer_not_allowed";
  if (normalized.includes("billingnotenabledmaperror") || normalized.includes("billing")) return "billing_not_enabled";
  return "load_failed";
};

interface OsmMapViewportProps {
  mapCenter: { lat: number; lng: number };
  clusteredMarkers: MapItemRecord[];
  unlocatedIncidents: Array<Record<string, unknown> & { id?: string; crisisId?: string; eventId?: string; title?: string; subType?: string; type?: string; eventType?: string; severity?: string | number; markerType: string }>;
  crises: Array<Record<string, unknown> & { crisisId?: string; id?: string; severity?: string | number; radiusKm?: number }>; 
  onMarkerClick: (item: MapItemRecord) => void;
}

const OsmMapViewport: React.FC<OsmMapViewportProps> = ({ mapCenter, clusteredMarkers, unlocatedIncidents, crises, onMarkerClick }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<any>(null);
  const markersGroupRef = React.useRef<any>(null);
  const circlesGroupRef = React.useRef<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lazy-load Leaflet on trigger
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }

    try {
      // 1. Inject Leaflet CSS
      const linkId = "leaflet-css-fallback";
      if (!document.getElementById(linkId)) {
        const link = document.createElement("link");
        link.id = linkId;
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.crossOrigin = "";
        document.head.appendChild(link);
      }

      // 2. Inject Leaflet JS Script
      const scriptId = "leaflet-js-fallback";
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.crossOrigin = "";
        script.onload = () => setLeafletLoaded(true);
        script.onerror = () => setLoadError("Failed to lazy load OpenStreetMap dependencies.");
        document.body.appendChild(script);
      } else {
        const checkL = setInterval(() => {
          if ((window as any).L) {
            setLeafletLoaded(true);
            clearInterval(checkL);
          }
        }, 100);
        return () => clearInterval(checkL);
      }
    } catch (err: any) {
      setLoadError(err.message || "Failed to initialize Leaflet script injection.");
    }
  }, []);

  // Pre-filter and validate crises dataset (Zero Fabricated Coordinates Policy)
  const safeCrises = useMemo(() => {
    return (crises || []).map(c => {
      const normalized = normalizeNGORecord(c, 'crisis');
      return {
        ...c,
        resolvedLat: normalized.lat,
        resolvedLng: normalized.lng,
        safeForMap: normalized.safeForMap,
      };
    }).filter(c => 
      c &&
      c.safeForMap &&
      typeof c.resolvedLat === "number" &&
      typeof c.resolvedLng === "number" &&
      Number.isFinite(c.resolvedLat) &&
      Number.isFinite(c.resolvedLng)
    );
  }, [crises]);

  // Pre-filter clustered markers dataset
  const safeClusteredMarkers = useMemo(() => {
    return (clusteredMarkers || []).map(item => {
      const normalized = item.markerType === "crisis"
        ? resolveCrisis(item)
        : normalizeNGORecord(
            item,
            item.markerType === "relief" ? "relief" : "event"
          );
      return {
        ...item,
        resolvedLat: normalized.lat ?? undefined,
        resolvedLng: normalized.lng ?? undefined,
      };
    }).filter(m => 
      m && 
      typeof m.resolvedLat === "number" && 
      typeof m.resolvedLng === "number" && 
      Number.isFinite(m.resolvedLat) && 
      Number.isFinite(m.resolvedLng)
    );
  }, [clusteredMarkers]);

  // Initialize Map
  useEffect(() => {
    if (!leafletLoaded || !containerRef.current || mapInstanceRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    try {
      // Create Leaflet Map instance
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([mapCenter.lat, mapCenter.lng], 12);

      // Add CartoDB Dark Matter tile layer for aesthetic dark-mode satellite matching
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 20,
        subdomains: "abcd",
      }).addTo(map);

      // Groups for markers & circles
      markersGroupRef.current = L.featureGroup().addTo(map);
      circlesGroupRef.current = L.featureGroup().addTo(map);

      mapInstanceRef.current = map;
    } catch (err: any) {
      setLoadError("Failed to initialize OpenStreetMap Canvas viewport: " + err.message);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersGroupRef.current = null;
        circlesGroupRef.current = null;
      }
    };
  }, [leafletLoaded]);

  // Pan to center dynamically when mapCenter updates
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setView([mapCenter.lat, mapCenter.lng], mapInstanceRef.current.getZoom());
  }, [mapCenter]);

  // Redraw layers when safe datasets or markers update
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = (window as any).L;
    if (!map || !L || !markersGroupRef.current || !circlesGroupRef.current) return;

    try {
      markersGroupRef.current.clearLayers();
      circlesGroupRef.current.clearLayers();

      // Render Crises circles representing threat impact range
      safeCrises.forEach(crisis => {
        const norm = normalizeSeverity(crisis.severity);
        const radiusMeters = typeof crisis.radiusKm === 'number' && isFinite(crisis.radiusKm) && !isNaN(crisis.radiusKm) ? crisis.radiusKm * 1000 : 1000;
        const color = getSeverityColor(norm);

        const circle = L.circle([crisis.resolvedLat, crisis.resolvedLng], {
          color: color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 2,
          opacity: 0.8,
          radius: radiusMeters,
        }).addTo(circlesGroupRef.current);

        circle.on("click", () => {
          onMarkerClick({ ...crisis, markerType: "crisis", key: `crisis-${crisis.crisisId || crisis.id}` });
        });
      });

      // Render custom SVGs for active EOC Telemetry Markers
      safeClusteredMarkers.forEach(item => {
        let path = SVG_MARKERS.danger;
        let fillColor = "#ef4444";

        if (item.markerType === "relief") {
          path = SVG_MARKERS.aid;
          fillColor = "#3b82f6";
        } else if (item.markerType === "queue") {
          path = SVG_MARKERS.queue;
          fillColor = "#eab308";
        } else if (item.markerType === "crisis") {
          fillColor = getSeverityColor(normalizeSeverity(item.severity ?? item.severityString));
        }

        const customIcon = L.divIcon({
          html: `
            <div style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; cursor: pointer;">
              <svg viewBox="0 0 24 24" width="28" height="28" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.55));">
                <path d="${path}" fill="${fillColor}" stroke="#ffffff" stroke-width="1.5" />
              </svg>
            </div>
          `,
          className: "custom-osm-marker-container",
          iconSize: [30, 30],
          iconAnchor: [15, 30],
        });

        const marker = L.marker([item.resolvedLat, item.resolvedLng], {
          icon: customIcon,
        }).addTo(markersGroupRef.current);

        marker.on("click", () => {
          onMarkerClick(item);
        });
      });
    } catch (err: any) {
      console.error("OSM Layer drawing error:", err);
    }
  }, [safeCrises, safeClusteredMarkers, leafletLoaded, onMarkerClick]);

  if (loadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 p-6 text-center bg-zinc-950 rounded-xl border border-zinc-800">
        <AlertTriangle className="w-8 h-8 text-amber-500 mb-3 animate-bounce" />
        <p className="text-sm font-bold uppercase tracking-wider text-amber-500">Osm Mapping Failure</p>
        <p className="text-xs text-zinc-500 mt-2 max-w-sm font-mono leading-relaxed">{loadError}</p>
      </div>
    );
  }

  if (!leafletLoaded) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 p-6 text-center bg-zinc-950 rounded-xl border border-zinc-800">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black font-mono">Loading OpenStreetMap Fallback...</p>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full bg-zinc-950" style={{ zIndex: 1 }} />;
};

interface MapViewportProps {
  apiKey: string;
  mapCenter: { lat: number; lng: number };
  clusteredMarkers: MapItemRecord[];
  unlocatedIncidents: Array<Record<string, unknown> & { id?: string; crisisId?: string; eventId?: string; title?: string; subType?: string; type?: string; eventType?: string; severity?: string | number; markerType: string }>;
  crises: Array<Record<string, unknown> & { crisisId?: string; id?: string; severity?: string | number; radiusKm?: number }>; 
  onMarkerClick: (item: MapItemRecord) => void;
}

const MapViewport: React.FC<MapViewportProps> = ({ apiKey, mapCenter, clusteredMarkers, unlocatedIncidents, crises, onMarkerClick }) => {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
  });
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [useOsmFallback, setUseOsmFallback] = useState(false);

  // Global listener for async maps authentication failures (e.g. ApiTargetBlockedMapError)
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).gm_authFailure = () => {
        console.error("Google Maps API Authentication Failure (gm_authFailure).");
        setMapError(
          "Google Maps is currently unavailable due to API authorization restrictions (ApiTargetBlockedMapError/RefererNotAllowed). Please verify that the Maps JavaScript API is enabled in your Google Cloud Console and that local HTTP referrers are permitted."
        );
      };
    }
  }, []);

  const loadErrorKind = useMemo<MapLoadErrorKind | null>(() => {
    if (!loadError?.message) return null;
    return getMapLoadErrorKind(loadError.message);
  }, [loadError]);

  const activeMapError = mapError ?? (loadErrorKind ? getMapErrorMessage(loadErrorKind) : null);

  useEffect(() => {
    if (!loadError?.message) return;
    const kind = getMapLoadErrorKind(loadError.message);
    const message = getMapErrorMessage(kind);
    if (message !== mapError) {
      queueMicrotask(() => setMapError(message));
    }
  }, [loadError, mapError]);

  // Automatically switch to OSM if key is blank or Google Maps triggers authentication error
  useEffect(() => {
    if (!apiKey || !apiKey.trim() || activeMapError || loadError) {
      setUseOsmFallback(true);
    }
  }, [apiKey, activeMapError, loadError]);

  // Pre-filter and validate crises dataset (Zero Fabricated Coordinates Policy)
  const safeCrises = useMemo(() => {
    return (crises || []).map(c => {
      const normalized = normalizeNGORecord(c, 'crisis');
      return {
        ...c,
        resolvedLat: normalized.lat,
        resolvedLng: normalized.lng,
        safeForMap: normalized.safeForMap,
      };
    }).filter(c => 
      c &&
      c.safeForMap &&
      typeof c.resolvedLat === "number" &&
      typeof c.resolvedLng === "number" &&
      Number.isFinite(c.resolvedLat) &&
      Number.isFinite(c.resolvedLng)
    );
  }, [crises]);

  // Pre-filter and validate clustered markers dataset (Prevent MarkerClusterer lat/lng crashes)
  const safeClusteredMarkers = useMemo(() => {
    return (clusteredMarkers || []).map(item => {
      const normalized = item.markerType === "crisis"
        ? resolveCrisis(item)
        : normalizeNGORecord(
            item,
            item.markerType === "relief" ? "relief" : "event"
          );
      return {
        ...item,
        resolvedLat: normalized.lat ?? undefined,
        resolvedLng: normalized.lng ?? undefined,
      };
    }).filter(m => 
      m && 
      typeof m.resolvedLat === "number" && 
      typeof m.resolvedLng === "number" && 
      Number.isFinite(m.resolvedLat) && 
      Number.isFinite(m.resolvedLng)
    );
  }, [clusteredMarkers]);

  // Safe Fallback: If no valid map data (crises or markers) exist, do NOT load maps
  if (safeClusteredMarkers.length === 0 && safeCrises.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 p-6 text-center bg-zinc-950 rounded-xl border border-zinc-800">
        <AlertTriangle className="w-8 h-8 text-amber-400 mb-3 animate-pulse" />
        <p className="text-sm font-bold uppercase tracking-wider">No Active Map Telemetry</p>
        <p className="text-xs text-zinc-500 mt-2 max-w-xs leading-relaxed font-mono">
          No incidents with valid, finite GPS coordinates are currently active.
        </p>
        <p className="text-[10px] text-zinc-600 mt-3 font-mono">
          Waiting for telemetry beacon...
        </p>
      </div>
    );
  }

  // Seamless switch to OpenStreetMap if Google Maps is restricted/unavailable
  if (useOsmFallback) {
    return (
      <div className="w-full h-full relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
        <OsmMapViewport
          mapCenter={mapCenter}
          clusteredMarkers={clusteredMarkers}
          unlocatedIncidents={unlocatedIncidents}
          crises={crises}
          onMarkerClick={onMarkerClick}
        />
        <div className="absolute top-3 right-3 bg-zinc-950/90 backdrop-blur border border-amber-500/50 rounded-lg px-3 py-1.5 shadow-lg z-[1000] flex items-center gap-2 font-mono pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
          <span className="text-[10px] font-bold text-amber-400 tracking-wider">
            🌐 OpenStreetMap Fallback Active (Google Maps Restricted)
          </span>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="w-full h-full flex items-center justify-center text-zinc-500 bg-zinc-950">Initializing Satellite Layer...</div>;
  }

  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={mapCenter}
        zoom={12}
        options={mapOptions}
        onIdle={() => setMapReady(true)}
      >
        {mapReady && (
          <>
            {safeCrises.map(crisis => {
              const norm = normalizeSeverity(crisis.severity);
              const crisisId = crisis.crisisId || crisis.id;
              const radiusMeters = typeof crisis.radiusKm === 'number' && isFinite(crisis.radiusKm) && !isNaN(crisis.radiusKm) ? crisis.radiusKm * 1000 : 1000;
              return (
                <Circle
                  key={`crisis-circle-${crisisId}`}
                  center={{ lat: crisis.resolvedLat!, lng: crisis.resolvedLng! }}
                  radius={radiusMeters}
                  options={{
                    fillColor: getSeverityColor(norm),
                    fillOpacity: 0.15,
                    strokeColor: getSeverityColor(norm),
                    strokeOpacity: 0.8,
                    strokeWeight: 2,
                  }}
                  onClick={() => onMarkerClick({ ...crisis, markerType: "crisis", key: `crisis-${crisisId}` })}
                />
              );
            })}

            {safeClusteredMarkers.length > 0 && (
              <MarkerClusterer options={{ maxZoom: 15 }}>
                {(clusterer) => (
                  <>
                    {safeClusteredMarkers.map(item => (
                      <MemoizedMarker
                        key={item.key}
                        item={item}
                        clusterer={clusterer}
                        onClick={onMarkerClick}
                      />
                    ))}
                  </>
                )}
              </MarkerClusterer>
            )}
          </>
        )}
      </GoogleMap>

      {/* ── Unlocated Incidents Panel ─────────────────────────────────────────
           Shows incidents rejected from the map due to missing/invalid GPS.
           Strictly truth-only: never renders 0,0 or NA coordinate fallbacks. */}
      {unlocatedIncidents.length > 0 && (
        <div className="absolute bottom-3 left-3 z-[500] max-w-[260px] bg-zinc-950/95 backdrop-blur-sm border border-amber-500/30 rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60 bg-amber-500/5">
            <FileWarning className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
              Unlocated Incidents ({unlocatedIncidents.length})
            </span>
          </div>
          <ul className="max-h-[180px] overflow-y-auto divide-y divide-zinc-800/40 custom-scrollbar">
            {unlocatedIncidents.map(item => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                <AlertTriangle className="w-3 h-3 text-amber-500/70 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-zinc-200 truncate" title={item.title}>
                    {item.title}
                  </p>
                  {item.severity && !isSyntheticText(item.severity) && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                      {item.severity}
                    </span>
                  )}
                </div>
                <span className="ml-auto text-[8px] font-black uppercase text-zinc-600 tracking-wider shrink-0">NO GPS</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// Memoized Marker Component to prevent re-renders
const MemoizedMarker = React.memo(({ item, clusterer, onClick }: { item: MapItemRecord & { resolvedLat?: number; resolvedLng?: number }; clusterer: any; onClick: (item: MapItemRecord) => void }) => {
  let path = SVG_MARKERS.danger;
  let fillColor = "#ef4444";
  let scale = 1.2;

  if (item.markerType === "relief") {
    path = SVG_MARKERS.aid;
    fillColor = "#3b82f6";
    scale = 1.1;
  } else if (item.markerType === "queue") {
    path = SVG_MARKERS.queue;
    fillColor = "#eab308";
    scale = 1.0;
  } else if (item.markerType === "crisis") {
    fillColor = getSeverityColor(normalizeSeverity(item.severity ?? item.severityString));
  }

  const lat = typeof item.resolvedLat === "number" ? item.resolvedLat : null;
  const lng = typeof item.resolvedLng === "number" ? item.resolvedLng : null;

  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return (
    <Marker
      position={{ lat: lat, lng: lng }}
      clusterer={clusterer}
      icon={{
        path: path,
        fillColor: fillColor,
        fillOpacity: 1,
        strokeWeight: 1,
        strokeColor: "#ffffff",
        scale: scale,
        anchor: typeof window !== "undefined" && window.google?.maps?.Point 
          ? new window.google.maps.Point(12, 24) 
          : undefined,
      }}
      onClick={() => onClick(item)}
    />
  );
});

MemoizedMarker.displayName = "MemoizedMarker";

export const MapOpsLayer = () => {
  const { operatorProfile, authState } = useAuth();
  const mapsApiKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();

  const [crises, setCrises] = useState<any[]>([]);
  const [reliefRequests, setReliefRequests] = useState<any[]>([]);
  const [eventQueue, setEventQueue] = useState<any[]>([]);
  
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelData, setPanelData] = useState<any>({});
  const [showUnlocated, setShowUnlocated] = useState(false);

  // Real-time Listeners
  useEffect(() => {
    if (authState !== "authenticated") return;

    // 1. Crises — same collection + crisisId binding as Live Feed
    const crisesRef = collection(db, "crises");
    const qCrises = query(crisesRef, orderBy("time", "desc"));
    let unsubFallback: (() => void) | null = null;
    const unsubCrises = onSnapshot(qCrises, (snap) => {
      setCrises(snap.docs.map(doc => normalizeCrisis({ crisisId: doc.id, ...doc.data() })));
    }, (error) => {
      console.warn("MapOpsLayer: orderBy(time) failed, using unordered crises snapshot:", error);
      if (!unsubFallback) {
        unsubFallback = onSnapshot(crisesRef, (snap) => {
          setCrises(snap.docs.map(doc => normalizeCrisis({ crisisId: doc.id, ...doc.data() })));
        });
      }
    });

    // 2. Relief Requests
    const reliefRef = collection(db, "relief_requests");
    const qRelief = query(reliefRef, orderBy("createdAt", "desc"));
    const unsubRelief = onSnapshot(qRelief, (snap) => {
      setReliefRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 3. Pending Event Queue
    const queueRef = collection(db, "event_queue");
    const qQueue = query(queueRef, where("status", "==", "pending"));
    const unsubQueue = onSnapshot(qQueue, (snap) => {
      setEventQueue(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubCrises();
      unsubFallback?.();
      unsubRelief();
      unsubQueue();
    };
  }, [authState]);

  const getSeverityRadius = useCallback((radiusKm: number, sev: string | number) => {
    if (radiusKm) return radiusKm * 1000;
    const norm = normalizeSeverity(sev);
    if (norm === "CRITICAL") return 5000;
    if (norm === "HIGH") return 3000;
    if (norm === "MEDIUM") return 1500;
    return 800;
  }, []);

  // Memoize marker datasets for clustering and unlocated incidents list
  const { clusteredMarkers, unlocatedIncidents, isOverloadMode, prioritizedCrisis } = useMemo(() => {
    const list: any[] = [];
    const unlocated: any[] = [];

    // 1. Active Crises — severity-colored pins; coords from location or payload
    crises.forEach(c => {
      const crisisId = c.crisisId || c.id;
      const data = resolveCrisis(c);
      const normalizedCrisis = {
        ...data,
        crisisId,
        id: data.id || crisisId,
        ciroIntelligenceId: c.ciroIntelligenceId,
        userId: c.userId,
        eventId: c.eventId,
        markerType: "crisis",
      };
      if (data.safeForMap && data.lat !== null && data.lng !== null && !data.isSynthetic) {
        list.push({
          ...normalizedCrisis,
          location: { lat: data.lat, lng: data.lng, name: c.location?.name || c.payload?.location?.name },
          key: `crisis-${crisisId}`,
        });
      } else {
        unlocated.push({
          ...normalizedCrisis,
          key: `unlocated-crisis-${crisisId}`,
        });
      }
    });

    // 2. Relief Requests (Blue)
    reliefRequests.forEach(r => {
      const normalized = normalizeNGORecord(r, 'relief');
      if (normalized.safeForMap && !normalized.isSynthetic) {
        list.push({
          ...normalized,
          location: { ...(r.location ?? {}), lat: normalized.lat, lng: normalized.lng },
          markerType: "relief",
          key: `relief-${normalized.id || r.id}`
        });
      } else {
        unlocated.push({
          ...normalized,
          markerType: "relief",
          key: `unlocated-relief-${normalized.id || r.id}`
        });
      }
    });

    // 3. Pending Event Queue (Yellow)
    eventQueue.forEach(e => {
      const normalized = normalizeNGORecord(e, 'event');
      if (normalized.safeForMap && !normalized.isSynthetic) {
        list.push({
          ...normalized,
          location: { ...(e.location ?? {}), lat: normalized.lat, lng: normalized.lng },
          markerType: "queue",
          key: `queue-${normalized.id || e.id}`
        });
      } else {
        unlocated.push({
          ...normalized,
          markerType: "queue",
          key: `unlocated-queue-${normalized.id || e.id}`
        });
      }
    });

    // Check Multi-Crisis Overload Mode (Rule 4)
    const activeCrisesCount = crises.length;
    const hasHighSeverityCluster = crises.some(c => normalizeSeverity(c.severity) === "CRITICAL" || normalizeSeverity(c.severity) === "HIGH");
    const isOverloadMode = activeCrisesCount >= 3 || hasHighSeverityCluster;

    // Prioritize highest priorityScore crisis
    let prioritizedCrisis = null;
    if (crises.length > 0) {
      prioritizedCrisis = [...crises].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))[0];
    }

    return { clusteredMarkers: list, unlocatedIncidents: unlocated, isOverloadMode, prioritizedCrisis };
  }, [crises, reliefRequests, eventQueue]);

  const handleMarkerClick = useCallback(async (item: any) => {
    setSelectedItem(item);
    setPanelLoading(true);
    const enriched: any = {};

    try {
      if (item.markerType === "crisis") {
        // Fetch Linked Intelligence if ciroIntelligenceId exists
        const intelId = item.ciroIntelligenceId || item.crisisId;
        if (intelId) {
          const intelSnap = await getDoc(doc(db, "ciro_intelligence", intelId));
          if (intelSnap.exists()) {
            enriched.intelligence = intelSnap.data();
          }

          // Fetch ciro_intelligence_history (REQUIRED ADDITION)
          const historySnap = await getDoc(doc(db, "ciro_intelligence_history", intelId));
          if (historySnap.exists()) {
            const hData = historySnap.data();
            enriched.intelligenceHistory = hData.history || hData.entries || hData.logs || [hData];
          } else {
            const qSnap = await getDocs(collection(db, "ciro_intelligence_history"));
            const matches: any[] = [];
            qSnap.forEach(d => {
              const data = d.data();
              if (data.linkedCrisisId === item.crisisId || d.id === intelId) {
                matches.push({ id: d.id, ...data });
              }
            });
            if (matches.length > 0) {
              enriched.intelligenceHistory = matches;
            } else {
              enriched.intelligenceHistory = null;
            }
          }
        }
      } else if (item.markerType === "relief") {
        const uid = item.userId;
        if (uid) {
          // Fetch User Info
          const userSnap = await getDoc(doc(db, "users", uid));
          if (userSnap.exists()) enriched.citizen = userSnap.data();

          // Fetch Dependents
          const memSnap = await getDocs(collection(db, "family_profiles", uid, "members"));
          const memList: any[] = [];
          memSnap.forEach(m => memList.push({ id: m.id, ...m.data() }));
          enriched.dependents = memList;
        }
      }
    } catch (err) {
      console.error("Failed to fetch panel intelligence:", err);
    } finally {
      setPanelData(enriched);
      setPanelLoading(false);
    }
  }, []);

  const updateReliefStatus = async (requestId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "relief_requests", requestId), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      setSelectedItem((prev: any) => prev ? { ...prev, status: newStatus } : null);
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const renderReliefButtons = (req: any) => {
    const normStatus = req.status?.toUpperCase() || "PENDING";
    if (operatorProfile?.role === "coordinator") {
      if (normStatus === "PENDING" || normStatus === "VERIFIED") {
        return <button onClick={() => updateReliefStatus(req.id, "APPROVED")} className="rounded bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-500/30">Approve</button>;
      }
    }
    if (operatorProfile?.role === "medical_team" && normStatus === "PENDING") {
      return <button onClick={() => updateReliefStatus(req.id, "VERIFIED")} className="rounded bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/30">Verify Medical</button>;
    }
    if (operatorProfile?.role === "logistics" && normStatus === "APPROVED") {
      return <button onClick={() => updateReliefStatus(req.id, "DISPATCHED")} className="rounded bg-orange-500/20 px-3 py-1 text-xs font-medium text-orange-400 hover:bg-orange-500/30">Dispatch Team</button>;
    }
    if (operatorProfile?.role === "logistics" && normStatus === "DISPATCHED") {
      return <button onClick={() => updateReliefStatus(req.id, "DELIVERED")} className="rounded bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/30">Mark Delivered</button>;
    }
    if (operatorProfile?.role === "coordinator" && normStatus === "DELIVERED") {
      return <button onClick={() => updateReliefStatus(req.id, "CLOSED")} className="rounded bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-600">Close Request</button>;
    }
    return null;
  };
  const mapCenter = useMemo(() => {
    const validMarker = clusteredMarkers.find(
      (m) =>
        m.location &&
        typeof m.location.lat === "number" &&
        isFinite(m.location.lat) &&
        !isNaN(m.location.lat) &&
        typeof m.location.lng === "number" &&
        isFinite(m.location.lng) &&
        !isNaN(m.location.lng)
    );
    return validMarker ? { lat: validMarker.location.lat, lng: validMarker.location.lng } : DEFAULT_MAP_CENTER;
  }, [clusteredMarkers]);



  const hasPriorityBoost = panelData.dependents?.some((d: any) => d.type?.toLowerCase() === "child" || d.type?.toLowerCase() === "elderly" || Number(d.age) > 65 || Number(d.age) < 12);

  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden border border-zinc-800">
      <MapViewport
        apiKey={mapsApiKey}
        mapCenter={mapCenter}
        clusteredMarkers={clusteredMarkers}
        unlocatedIncidents={unlocatedIncidents}
        crises={crises}
        onMarkerClick={handleMarkerClick}
      />

      {/* EOC OVERLOAD MODE BANNER */}
      {isOverloadMode && (
        <div className="absolute top-4 left-4 right-4 bg-rose-600/90 backdrop-blur-md border border-rose-400 rounded-xl p-4 shadow-2xl z-40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-pulse ring-2 ring-white/20 font-mono">
          <div className="flex items-center gap-3">
            <Radio className="w-8 h-8 text-white shrink-0 animate-bounce" />
            <div>
              <span className="font-black text-white text-base tracking-wider uppercase block">🚨 EOC OVERLOAD MODE ACTIVE</span>
              <span className="text-xs text-rose-100 block">≥3 Active Crises / High Severity Cluster detected. Secondary panels collapsed. Map clustering animations disabled.</span>
            </div>
          </div>
          {prioritizedCrisis && (
            <div className="bg-rose-950/80 border border-rose-400/50 rounded-lg p-2.5 flex items-center gap-3 shrink-0">
              <div>
                <span className="text-[10px] text-rose-300 block uppercase font-bold">Highest Priority Incident</span>
                <span className="text-xs text-white font-bold block">
                  {(resolveCrisis(prioritizedCrisis).title || prioritizedCrisis.eventType || "").toUpperCase()}{" "}
                  {prioritizedCrisis.priorityScore != null ? ` (Score: ${prioritizedCrisis.priorityScore.toFixed(2)})` : ""}
                </span>
              </div>
              <button onClick={() => handleMarkerClick({ ...prioritizedCrisis, markerType: "crisis" })} className="bg-white text-rose-600 px-3 py-1 rounded text-xs font-bold hover:bg-rose-100 transition-colors">
                Focus Priority
              </button>
            </div>
          )}
        </div>
      )}

      {/* UNLOCATED INCIDENTS LIST */}
      {unlocatedIncidents.length > 0 && (
        <div className="absolute bottom-4 left-4 w-80 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl z-40 font-mono text-xs overflow-hidden ring-1 ring-white/10">
          <div onClick={() => setShowUnlocated(!showUnlocated)} className="bg-zinc-900 px-4 py-3 flex justify-between items-center cursor-pointer border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-white uppercase tracking-wider text-xs">Unlocated Incidents ({unlocatedIncidents.length})</span>
            </div>
            {showUnlocated ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronUp className="w-4 h-4 text-zinc-400" />}
          </div>
          {showUnlocated && (
            <div className="p-3 space-y-2 max-h-60 overflow-y-auto custom-scrollbar bg-zinc-950/50">
              <div className="text-[10px] text-zinc-500 italic px-1 pb-1 border-b border-zinc-800/60">
                Missing GPS Coordinates. Map markers suppressed.
              </div>
              {unlocatedIncidents.map(inc => (
                <div key={inc.key} onClick={() => handleMarkerClick(inc)} className="bg-zinc-900/60 border border-zinc-800/80 hover:border-blue-500/50 rounded-lg p-2.5 cursor-pointer flex justify-between items-center transition-all">
                  <div>
                    <span className="font-bold text-white block text-xs truncate max-w-[180px]">{inc.title || inc.subType || inc.type || inc.eventType || "Unlocated Incident"}</span>
                    <span className="text-[10px] text-zinc-500 uppercase block">{inc.markerType} • ID: {(inc.id || inc.crisisId || inc.eventId)?.slice(0, 8)}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase ${inc.markerType === 'crisis' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : inc.markerType === 'relief' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>
                    {inc.markerType}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clickable Intelligence Panel */}
      {selectedItem && (
        <div className="absolute top-4 right-4 w-96 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl p-6 text-white z-50 max-h-[90%] overflow-y-auto ring-1 ring-white/10 custom-scrollbar">
          <div className="flex justify-between items-start mb-6 pb-4 border-b border-zinc-800">
            <div>
              <h3 className={`font-black uppercase tracking-wider text-sm ${
                selectedItem.markerType === "crisis" ? "text-rose-500" : selectedItem.markerType === "relief" ? "text-blue-400" : "text-amber-400"
              }`}>
                {selectedItem.markerType === "crisis" ? "Active Crisis Triage" : selectedItem.markerType === "relief" ? "Relief Request Ops" : ""}
              </h3>
              <span className="text-[10px] text-zinc-500 font-mono">{selectedItem.crisisId || selectedItem.eventId ? `ID: ${selectedItem.crisisId || selectedItem.eventId}` : ""}</span>
            </div>
            <button onClick={() => setSelectedItem(null)} className="text-zinc-400 hover:text-white p-1 bg-zinc-900 rounded-lg">✕</button>
          </div>

          {panelLoading ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Fetching Live Telemetry...</span>
            </div>
          ) : selectedItem.markerType === "crisis" ? (
            <div className="space-y-6 text-xs text-zinc-300">
              {/* Data Quality Layer */}
              <DataQualityLayer metadata={calculateDataIntegrity(selectedItem, 'crisis')} itemType="Crisis Object" />

              {/* Crisis Overview */}
              <div className="space-y-3">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Incident Overview</span>
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-white text-sm uppercase block">{selectedItem.subType || selectedItem.title || "Disaster Event"}</span>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded font-bold text-[9px] uppercase border ${
                        selectedItem.status === 'VERIFIED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                        selectedItem.status === 'NEEDS_VERIFICATION' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                        'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                      }`}>
                        {selectedItem.status === 'VERIFIED' ? '🟢 VERIFIED' : selectedItem.status === 'NEEDS_VERIFICATION' ? '🔴 NEEDS VERIFICATION' : '🟡 PARTIAL'}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700">{normalizeSeverity(selectedItem.severity)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/60 font-mono text-zinc-400">
                    {selectedItem.affectedPopulation != null && <div>Affected Pop: <span className="text-white font-bold">{selectedItem.affectedPopulation}</span></div>}
                    {selectedItem.confidence != null && <div>Confidence: <span className="text-blue-400 font-bold">{Number(selectedItem.confidence) <= 1 ? `${Math.round(Number(selectedItem.confidence) * 100)}%` : `${Math.round(Number(selectedItem.confidence))}%`}</span></div>}
                    {selectedItem.priorityScore != null && <div>Priority Score: <span className="text-amber-400 font-bold">{Number(selectedItem.priorityScore).toFixed(2)}</span></div>}
                    {selectedItem.dataSources?.length ? <div>Data Sources: <span className="text-white">{selectedItem.dataSources.length}</span></div> : null}
                  </div>
                </div>
              </div>

              {/* Intelligence Drawer Enrichment */}
              {panelData.intelligence ? (
                <div className="space-y-3">
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5"><Brain className="w-3.5 h-3.5 text-blue-400" /> AI Crisis Intelligence Drawer</span>
                  <DataQualityLayer metadata={calculateDataIntegrity(panelData.intelligence, 'intelligence')} itemType="AI Intelligence" />
                  <div className="bg-zinc-900/80 border border-blue-500/30 rounded-xl p-4 space-y-3 shadow-lg">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-800 font-mono">
                      {panelData.intelligence.analysis?.confidence != null ? <span className="text-zinc-400">Confidence: <strong className="text-white">{`${Math.round(Number(panelData.intelligence.analysis.confidence) * 100)}%`}</strong></span> : <span className="text-zinc-400" />}
                      {panelData.intelligence.analysis?.severity != null ? <span className="text-zinc-400">Severity: <strong className="text-blue-400">{panelData.intelligence.analysis.severity}</strong></span> : <span className="text-zinc-400" />}
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px] uppercase mb-1">AI Explanation & Key Evidence</span>
                      <p className="text-zinc-300 leading-relaxed font-mono bg-zinc-950/50 p-2.5 rounded border border-zinc-800/80">{typeof panelData.intelligence.analysis === "string" ? panelData.intelligence.analysis : (panelData.intelligence.analysis?.explanation || panelData.intelligence.analysis?.summary || panelData.intelligence.keyEvidence || "")}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800 font-mono text-[10px]">
                      <div className="bg-zinc-950/40 p-2 rounded border border-zinc-800/50">
                        <span className="text-zinc-500 block uppercase">Weather / Env</span>
                        <span className="text-white font-bold">{(() => {
                          const w = panelData.intelligence.inputs?.weather;
                          if (!w) return "";
                          if (typeof w === "string") return w;
                          const desc = w.description || w.main || "";
                          const tempC = w.temp ? `${Math.round(Number(w.temp) - 273.15)}°C` : "";
                          const hum = w.humidity != null ? `Humidity: ${w.humidity}%` : "";
                          const wind = w.wind_speed != null ? `Wind: ${Number(w.wind_speed).toFixed(1)} km/h` : "";
                          const parts = [desc, tempC, hum, wind].filter(Boolean);
                          return parts.length > 0 ? parts.join(", ") : "";
                        })()}</span>
                      </div>
                      <div className="bg-zinc-950/40 p-2 rounded border border-zinc-800/50">
                        <span className="text-zinc-500 block uppercase">Recommended Deployment</span>
                        <span className="text-emerald-400 font-bold">{typeof panelData.intelligence.rawDecision?.crises?.[0]?.simulatedImpact?.action === "string" ? panelData.intelligence.rawDecision.crises[0].simulatedImpact.action : ""}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-4 text-center text-zinc-500 italic font-mono"></div>
              )}

              {/* Crisis Intelligence History (REQUIRED ADDITION) */}
              <div className="space-y-3">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Crisis Intelligence History</span>
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 font-mono text-zinc-400 space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                  {panelData.intelligenceHistory ? (
                    (() => {
                      const list = [...panelData.intelligenceHistory];
                      const hasTimestamp = list.some(h => h.timestamp || h.time || h.createdAt);
                      if (hasTimestamp) {
                        list.sort((a, b) => {
                          const tA = a.timestamp || a.time || a.createdAt;
                          const tB = b.timestamp || b.time || b.createdAt;
                          return new Date(tA).getTime() - new Date(tB).getTime();
                        });
                      }
                      return (
                        <div className="space-y-3">
                          {!hasTimestamp && <div className="text-[10px] text-amber-500 border-b border-zinc-800 pb-1 mb-2 font-bold"></div>}
                          {list.map((h: any, idx: number) => (
                            <div key={idx} className="text-[11px] border-b border-zinc-800/40 pb-2 last:border-none space-y-1">
                              <div className="flex justify-between text-white font-bold">
                                <span>{h.action || h.event || h.status || h.log || ""}</span>
                                {hasTimestamp && <span className="text-zinc-500 text-[10px]">{h.timestamp || h.time || h.createdAt ? new Date(h.timestamp || h.time || h.createdAt).toLocaleString() : ""}</span>}
                              </div>
                              <pre className="text-zinc-400 text-[10px] bg-zinc-950 p-1.5 rounded overflow-x-auto custom-scrollbar"></pre>
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="text-zinc-500 italic text-center py-2">No intelligence history available</div>
                  )}
                </div>
              </div>

              {/* Response History */}
              <div className="space-y-3">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Response History</span>
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 font-mono text-zinc-400 space-y-1.5">
                  {selectedItem.history?.length ? (
                    selectedItem.history.map((h: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-[10px] border-b border-zinc-800/40 pb-1 last:border-none">
                        <span className="text-zinc-300">{h.action || h.status || "Update"}</span>
                        <span className="text-zinc-500">{h.time ? new Date(h.time).toLocaleTimeString() : ""}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-zinc-500 italic text-center"></div>
                  )}
                </div>
              </div>
            </div>
          ) : selectedItem.markerType === "relief" ? (
            <div className="space-y-6 text-xs text-zinc-300">
              {/* Data Quality Layer */}
              <DataQualityLayer metadata={calculateDataIntegrity(selectedItem, 'relief')} itemType="Relief Request" />

              {/* Priority Boost Escalation Alert */}
              {hasPriorityBoost && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3 animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-rose-400 uppercase tracking-wider block text-xs">Priority Escalation Active</span>
                    <p className="text-rose-300/90 mt-0.5 leading-relaxed">Vulnerable dependents (elderly or children) detected in household. Immediate relief dispatch strongly recommended.</p>
                  </div>
                </div>
              )}

              {/* Citizen Details */}
              <div className="space-y-3">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Citizen Primary Identity</span>
                {panelData.citizen && <DataQualityLayer metadata={calculateDataIntegrity(panelData.citizen, 'user')} itemType="Citizen Profile" />}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-zinc-800 rounded-lg text-zinc-300"><User className="w-4 h-4" /></div>
                    <div>
                      <span className="font-bold text-white block text-sm">{panelData.citizen?.name || "Unregistered Citizen"}</span>
                      <span className="text-zinc-500 font-mono text-[10px]">{panelData.citizen ? `UID: ${selectedItem.userId}` : "No Firebase Profile Found"}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-zinc-800/60 flex justify-between items-center text-zinc-400 font-mono">
                    {panelData.citizen?.phone ? <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-zinc-500" /> {panelData.citizen.phone}</span> : <span className="flex items-center gap-1.5" />}
                    {panelData.citizen?.riskScore != null ? <span className="font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">Risk Score: {panelData.citizen.riskScore}</span> : <span className="font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20" />}
                  </div>
                </div>
              </div>

              {/* Dependents Roster */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Dependents Registry ({panelData.dependents?.length || 0})</span>
                  <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-bold">Subcollection</span>
                </div>
                {!panelData.dependents?.length ? (
                  <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-xl p-6 text-center text-zinc-500 italic">
                    No dependents logged in family profile subcollection.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {panelData.dependents.map((dep: any) => (
                      <div key={dep.id} className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-3 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white block">{dep.name || "Dependent"}</span>
                          <span className="text-zinc-500 text-[10px] uppercase">{dep.relation || ""}{dep.relation && dep.age != null ? " • " : ""}{dep.age != null ? `Age ${dep.age}` : ""}</span>
                        </div>
                        {dep.type && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            dep.type.toLowerCase() === "child" || dep.type.toLowerCase() === "elderly" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "bg-zinc-800 text-zinc-400"
                          }`}>
                            {dep.type}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Exact Request Notes */}
              <div className="space-y-3">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Exact Request Notes & Specs</span>
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-zinc-300 leading-relaxed font-mono text-xs">
                  {selectedItem.notes || selectedItem.description || "No specific operational notes provided."}
                </div>
              </div>

              {/* Status Actions */}
              <div className="space-y-3 pt-2">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Operator Action</span>
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 flex flex-wrap gap-2 items-center justify-between">
                  <span className="text-zinc-400 font-semibold uppercase">Current: {selectedItem.status}</span>
                  <div>{renderReliefButtons(selectedItem)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-xs text-zinc-300">
              {/* Data Quality Layer */}
              <DataQualityLayer metadata={calculateDataIntegrity(selectedItem, 'event')} itemType="Event Queue" />

              {/* Queue Marker Payload */}
              <div className="space-y-3">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Raw Incoming Event Payload</span>
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 font-mono text-[11px] text-amber-300 overflow-x-auto custom-scrollbar">
                  <pre></pre>
                </div>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 flex justify-between items-center font-mono">
                <span className="text-zinc-400 uppercase">Queue Type: {selectedItem.type || selectedItem.eventType || "INCOMPLETE EVENT"}</span>
                <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-bold uppercase border border-yellow-500/30">{selectedItem.status || "INCOMPLETE EVENT"}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
