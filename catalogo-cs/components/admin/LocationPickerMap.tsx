"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import {
  Search,
  MapPin,
  X,
  Loader2,
  Navigation,
  ExternalLink,
  Check,
  Compass,
} from "lucide-react";
import type { GeocodePlaceResult } from "@/app/api/geocode/search/route";

interface LocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number, formattedAddress?: string) => void;
  address?: string;
  onAddressChange?: (address: string) => void;
  heightClass?: string;
  defaultZoom?: number;
}

// Icono personalizado dorado con animación
const customPinIcon = L.divIcon({
  html: `
    <div style="position: relative; width: 32px; height: 32px; transform: translate(-50%, -100%);">
      <div style="position: absolute; inset: -6px; border-radius: 999px; background: #C5A55A; opacity: 0.35; animation: ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="
        background: #C5A55A;
        width: 32px;
        height: 32px;
        border-radius: 999px 999px 0 999px;
        transform: rotate(45deg);
        border: 2.5px solid #ffffff;
        box-shadow: 0 4px 14px rgba(197, 165, 90, 0.6), 0 2px 6px rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="width: 10px; height: 10px; background: #000000; border-radius: 999px; transform: rotate(-45deg);"></div>
      </div>
    </div>
  `,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// Componente para capturar clics en el mapa
function MapClickHandler({
  onLocationSelect,
}: {
  onLocationSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Componente para animar el vuelo suave hacia nuevas coordenadas
function MapFlyController({ position, zoom }: { position: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (position && !Number.isNaN(position[0]) && !Number.isNaN(position[1])) {
      map.flyTo(position, zoom ?? 16, { duration: 1.2 });
    }
  }, [position, zoom, map]);
  return null;
}

export default function LocationPickerMap({
  latitude,
  longitude,
  onChange,
  address = "",
  onAddressChange,
  heightClass = "h-80",
  defaultZoom = 15,
}: LocationPickerMapProps) {
  // Coordenadas por defecto (CDMX / Polanco o fallback seguro)
  const defaultLat = 19.4326;
  const defaultLng = -99.1332;

  const currentLat = latitude ?? defaultLat;
  const currentLng = longitude ?? defaultLng;
  const hasValidCoords = latitude !== null && longitude !== null && !Number.isNaN(latitude) && !Number.isNaN(longitude);

  const [searchQuery, setSearchQuery] = useState(address);
  const [searchResults, setSearchResults] = useState<GeocodePlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [detectedAddress, setDetectedAddress] = useState<string | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Función para buscar en API de geocodificación
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const results: GeocodePlaceResult[] = await res.json();
        setSearchResults(results);
        setIsDropdownOpen(results.length > 0);
      }
    } catch (err) {
      console.error("Error geocoding search:", err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Búsqueda con debounce al escribir
  const handleQueryChange = (val: string) => {
    setSearchQuery(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (val.trim().length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        performSearch(val);
      }, 350);
    } else {
      setSearchResults([]);
      setIsDropdownOpen(false);
    }
  };

  // Seleccionar resultado del buscador
  const handleSelectPlace = (place: GeocodePlaceResult) => {
    setIsDropdownOpen(false);
    setSearchQuery(place.displayName);
    onChange(place.lat, place.lng, place.displayName);

    if (onAddressChange) {
      // Extraer dirección limpia si está disponible o nombre completo
      const cleanAddr = [place.road, place.city, place.state]
        .filter(Boolean)
        .join(", ");
      onAddressChange(cleanAddr || place.displayName);
    }
  };

  // Reversa geocodificación al hacer clic en el mapa
  const handleLocationSelect = async (lat: number, lng: number) => {
    onChange(lat, lng);
    setIsReverseGeocoding(true);
    try {
      const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
      if (res.ok) {
        const data = await res.json();
        if (data.recommendedAddress) {
          setDetectedAddress(data.recommendedAddress);
        }
      }
    } catch (e) {
      console.error("Reverse geocoding error:", e);
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  // Usar la dirección detectada en el formulario
  const handleApplyDetectedAddress = () => {
    if (detectedAddress) {
      setSearchQuery(detectedAddress);
      if (onAddressChange) {
        onAddressChange(detectedAddress);
      }
    }
  };

  // Obtener ubicación GPS actual del dispositivo
  const handleGetGpsLocation = () => {
    if (!navigator.geolocation) {
      alert("La geolocalización no está soportada por tu navegador");
      return;
    }
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGettingGps(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        handleLocationSelect(lat, lng);
      },
      (err) => {
        setIsGettingGps(false);
        console.warn("GPS error:", err.message);
        alert(`No se pudo obtener la ubicación GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Copiar coordenadas al portapapeles
  const handleCopyCoords = () => {
    if (hasValidCoords) {
      navigator.clipboard.writeText(`${currentLat}, ${currentLng}`);
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Buscador Integrado de Dirección */}
      <div ref={searchContainerRef} className="relative z-30 w-full">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#C5A55A] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setIsDropdownOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  performSearch(searchQuery);
                }
              }}
              placeholder="Escribe una dirección, colonia, calle o lugar (ej. Polanco, CDMX)..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950/90 py-2.5 pl-10 pr-10 text-xs text-white placeholder:text-zinc-500 focus:border-[#C5A55A] focus:outline-none focus:ring-1 focus:ring-[#C5A55A]/50 transition-all shadow-inner"
            />
            {isSearching ? (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[#C5A55A]" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  setIsDropdownOpen(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5"
                title="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => performSearch(searchQuery)}
            disabled={isSearching || !searchQuery.trim()}
            className="flex items-center gap-1.5 rounded-xl border border-[#C5A55A]/60 bg-[#C5A55A]/10 px-3.5 py-2.5 text-xs font-bold text-[#C5A55A] hover:bg-[#C5A55A] hover:text-black disabled:opacity-40 transition-all shrink-0"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Buscar</span>
          </button>

          <button
            type="button"
            onClick={handleGetGpsLocation}
            disabled={isGettingGps}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-[#C5A55A]/50 disabled:opacity-40 transition-all shrink-0"
            title="Ubicar mi posición actual"
          >
            {isGettingGps ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#C5A55A]" />
            ) : (
              <Navigation className="h-4 w-4 text-[#C5A55A]" />
            )}
            <span className="hidden sm:inline">Mi GPS</span>
          </button>
        </div>

        {/* Dropdown de Sugerencias de Geocodificación */}
        {isDropdownOpen && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-zinc-800 bg-[#080808]/95 backdrop-blur-md shadow-2xl p-1.5 flex flex-col gap-1 z-50">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-900 flex items-center justify-between">
              <span>Resultados encontrados ({searchResults.length})</span>
              <span className="text-zinc-600">Haz clic para centrar en el mapa</span>
            </div>
            {searchResults.map((place) => (
              <button
                key={`${place.placeId}-${place.lat}-${place.lng}`}
                type="button"
                onClick={() => handleSelectPlace(place)}
                className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-zinc-900/90 text-zinc-300 hover:text-white transition-colors group"
              >
                <div className="mt-0.5 p-1 rounded bg-[#C5A55A]/10 text-[#C5A55A] group-hover:bg-[#C5A55A] group-hover:text-black transition-colors shrink-0">
                  <MapPin className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-100 group-hover:text-[#E8D5A3] truncate">
                    {place.name || place.displayName}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {place.displayName}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contenedor del Mapa */}
      <div className={`relative ${heightClass} w-full rounded-2xl overflow-hidden border border-zinc-800 shadow-xl bg-zinc-950`}>
        <MapContainer
          center={[currentLat, currentLng]}
          zoom={defaultZoom}
          style={{ width: "100%", height: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Controlador de Animación de Vuelo */}
          <MapFlyController position={[currentLat, currentLng]} zoom={16} />

          {/* Capturador de clics en el mapa */}
          <MapClickHandler onLocationSelect={handleLocationSelect} />

          {/* Marcador del punto seleccionado */}
          {hasValidCoords && (
            <Marker position={[currentLat, currentLng]} icon={customPinIcon} />
          )}
        </MapContainer>

        {/* Overlay con instrucciones de clic */}
        <div className="absolute top-2.5 right-2.5 z-[1000] pointer-events-none">
          <span className="rounded-lg bg-black/80 backdrop-blur-md px-2.5 py-1 text-[10px] font-medium text-zinc-300 border border-zinc-800/80 shadow-md flex items-center gap-1.5">
            <Compass className="h-3 w-3 text-[#C5A55A]" />
            Haz clic en el mapa para mover el pin
          </span>
        </div>

        {/* Notificación flotante de dirección detectada por clic */}
        {detectedAddress && (
          <div className="absolute bottom-3 inset-x-3 z-[1000] bg-black/90 backdrop-blur-md border border-[#C5A55A]/50 p-2.5 rounded-xl shadow-2xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-[#C5A55A] shrink-0" />
              <div className="truncate">
                <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
                  Ubicación seleccionada:
                </p>
                <p className="text-xs text-white font-medium truncate">
                  {detectedAddress}
                </p>
              </div>
            </div>
            {onAddressChange && (
              <button
                type="button"
                onClick={handleApplyDetectedAddress}
                className="rounded-lg bg-[#C5A55A] px-3 py-1.5 text-[11px] font-bold text-black hover:bg-[#E8D5A3] transition-colors shrink-0 flex items-center gap-1"
              >
                <Check className="h-3 w-3" />
                Usar dirección
              </button>
            )}
          </div>
        )}
      </div>

      {/* Barra de Coordenadas y Enlaces Externos */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 bg-zinc-950/60 border border-zinc-900 px-3 py-2 rounded-xl">
        <div className="flex items-center gap-2 font-mono">
          <span className="text-zinc-500 font-sans text-[11px]">Coordenadas:</span>
          {hasValidCoords ? (
            <span className="font-semibold text-zinc-200">
              {currentLat.toFixed(6)}, {currentLng.toFixed(6)}
            </span>
          ) : (
            <span className="text-amber-500/90 text-[11px]">Sin marcar en el mapa</span>
          )}
          {hasValidCoords && (
            <button
              type="button"
              onClick={handleCopyCoords}
              className="text-[10px] text-[#C5A55A] hover:underline flex items-center gap-0.5 ml-1"
            >
              {copiedCoords ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                "Copiar"
              )}
            </button>
          )}
        </div>

        {hasValidCoords && (
          <div className="flex items-center gap-3">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${currentLat},${currentLng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[#C5A55A] hover:text-[#E8D5A3] flex items-center gap-1 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Google Maps
            </a>
            <a
              href={`https://waze.com/ul?ll=${currentLat},${currentLng}&navigate=yes`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Waze
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
