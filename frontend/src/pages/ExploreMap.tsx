// frontend/src/pages/ExploreMap.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Popup } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";
import debounce from "lodash.debounce";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";

import {
  CAR_BRANDS,
  FUEL_TYPES,
  CAR_MODELS_BY_BRAND_KEY,
} from "../constants/carOptions";

type CarPin = {
  id: number;
  make: string;
  model: string;
  title: string;
  year: number;
  coverUrl?: string | null;
  photos?: string[] | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  fuelType?: string | null;
  mileageKm?: number | null;
};

const MILAN = { lat: 45.4642, lng: 9.19 };
const MOBILE_BREAKPOINT = 640;

export default function ExploreMap() {
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string;

  const [center, setCenter] = useState<{ lat: number; lng: number }>(MILAN);
  const [askedGeo, setAskedGeo] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);

  const [radiusKm, setRadiusKm] = useState(5);

  const [makeKey, setMakeKey] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [fuelKey, setFuelKey] = useState<string>("");
  const [mileageMax, setMileageMax] = useState<number | "">("");

  const [cars, setCars] = useState<CarPin[]>([]);
  const [selected, setSelected] = useState<CarPin | null>(null);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT : false
  );
  const [filtersOpen, setFiltersOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > MOBILE_BREAKPOINT : true
  );

  const geocoderContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    setModel("");
  }, [makeKey]);

  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

  useEffect(() => {
    const onResize = () => {
      const mobileNow = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobileNow);
      setFiltersOpen(!mobileNow);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (askedGeo) return;
    setAskedGeo(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(c);
      },
      () => {
        setGeoDenied(true);
        setCenter(MILAN);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, [askedGeo]);

  const loadCars = async (lat: number, lng: number) => {
    try {
      // const token = await getToken();

      const params: any = { lat, lon: lng, radius: radiusKm };

      const selectedBrand = CAR_BRANDS.find((b) => b.key === makeKey);
      const selectedFuel = FUEL_TYPES.find((f) => f.key === fuelKey);

      if (selectedBrand) params.make = selectedBrand.label;
      if (model.trim()) params.model = model.trim();
      if (selectedFuel) params.fuelType = selectedFuel.label;
      if (mileageMax !== "") params.mileageMax = mileageMax;

      const { data } = await http.get("/cars/nearby", {
        params,
      });

      const loadedCars = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : [];

      console.log("cars/nearby response:", data);
      console.log("cars loaded:", loadedCars);

      setCars(loadedCars);
    } catch (e) {
      console.error("Errore cars/nearby", e);
      setCars([]);
    }
  };

  const debouncedLoad = useMemo(
    () =>
      debounce((lat: number, lng: number) => {
        loadCars(lat, lng);
      }, 350),
    [radiusKm, makeKey, model, fuelKey, mileageMax]
  );

  useEffect(() => {
    debouncedLoad(center.lat, center.lng);
    return () => debouncedLoad.cancel();
  }, [center.lat, center.lng, radiusKm, makeKey, model, fuelKey, mileageMax, debouncedLoad]);

  useEffect(() => {
    if (!geocoderContainerRef.current) return;
    if (!mapRef.current) return;

    geocoderContainerRef.current.innerHTML = "";

    const mapImpl =
      (mapRef.current as any).getMap ? (mapRef.current as any).getMap() : null;

    const geocoder = new MapboxGeocoder({
      accessToken: mapboxToken,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapboxgl: mapImpl ? mapImpl.constructor : undefined,
      marker: false,
      placeholder: "Cerca una città...",
      types: "place,locality,postcode",
      language: "it",
    });

    geocoder.addTo(geocoderContainerRef.current);

    const onResult = (e: any) => {
      const [lng, lat] = e.result.center;
      setCenter({ lat, lng });
      setSelected(null);
      if (isMobile) {
        setFiltersOpen(false);
      }
    };

    geocoder.on("result", onResult);

    return () => {
      geocoder.off("result", onResult);
    };
  }, [mapboxToken, isMobile]);

  const coverFor = (c: CarPin) => {
    if (c.coverUrl) return c.coverUrl;
    const first = c.photos?.[0];
    return first || "/placeholder.jpg";
  };

  const filteredCars = useMemo(() => {
    const selectedBrand = CAR_BRANDS.find((b) => b.key === makeKey);
    const brandLabel = selectedBrand?.label ?? "";

    const selectedFuel = FUEL_TYPES.find((f) => f.key === fuelKey);
    const fuelLabel = selectedFuel?.label ?? "";

    return cars.filter((c) => {
      if (brandLabel && norm(c.make) !== norm(brandLabel)) return false;
      if (model && norm(c.model) !== norm(model)) return false;
      if (fuelLabel && c.fuelType != null && norm(c.fuelType) !== norm(fuelLabel)) return false;
      if (mileageMax !== "" && c.mileageKm != null && Number(c.mileageKm) > Number(mileageMax)) return false;
      return true;
    });
  }, [cars, makeKey, model, fuelKey, mileageMax]);

  const modelsForSelectedBrand = useMemo(() => {
    return makeKey ? CAR_MODELS_BY_BRAND_KEY[makeKey] ?? [] : [];
  }, [makeKey]);

  const POPUP_W = 260;
  const POPUP_IMG_H = 150;

  const clamp1: React.CSSProperties = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const handleRefresh = () => {
    loadCars(center.lat, center.lng);
    if (isMobile) {
      setFiltersOpen(false);
    }
  };

  return (
    <div className="explore-map-page">
      <div className="explore-map-toolbar">
        <div className="explore-map-toolbar-shell">
          {isMobile && (
            <button
              type="button"
              className="explore-mobile-toggle"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              <span>Filtri mappa</span>
              <span aria-hidden className={`explore-mobile-toggle-arrow ${filtersOpen ? "open" : ""}`}>
                ▾
              </span>
            </button>
          )}

          {filtersOpen && (
            <div className="explore-map-toolbar-row">
              <div className="explore-geocoder-wrap">
                <div ref={geocoderContainerRef} className="explore-geocoder" />
              </div>

              <select
                value={makeKey}
                onChange={(e) => setMakeKey(e.target.value)}
                className="explore-control"
              >
                <option value="">Marca (tutte)</option>
                {CAR_BRANDS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>

              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="explore-control"
                disabled={!makeKey}
                title={!makeKey ? "Seleziona prima la marca" : "Seleziona modello"}
              >
                <option value="">
                  {makeKey ? "Modello (tutti)" : "Seleziona prima la marca"}
                </option>
                {modelsForSelectedBrand.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={fuelKey}
                onChange={(e) => setFuelKey(e.target.value)}
                className="explore-control"
              >
                <option value="">Carburante (tutti)</option>
                {FUEL_TYPES.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder="Km auto max"
                value={mileageMax}
                onChange={(e) => setMileageMax(e.target.value === "" ? "" : Number(e.target.value))}
                className="explore-control explore-control-small"
              />

              <div className="explore-radius-group">
                <span className="explore-radius-label">Raggio</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="explore-control explore-radius-input"
                />
                <span className="explore-radius-unit">km</span>
              </div>

              <button
                onClick={handleRefresh}
                className="btn explore-refresh-btn"
              >
                Aggiorna
              </button>
            </div>
          )}
        </div>
      </div>

      <Map
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        initialViewState={{
          latitude: center.lat,
          longitude: center.lng,
          zoom: 11,
        }}
        onMove={() => {}}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: "100%", height: "100%" }}
      >
        {filteredCars.map((c) => (
          <Marker key={c.id} latitude={c.latitude} longitude={c.longitude} anchor="bottom">
            <button
              onClick={() => setSelected(c)}
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                border: "2px solid white",
                background: "#34f5c5",
                boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
                cursor: "pointer",
              }}
              title={`${c.title} • ${c.distanceKm.toFixed(1)} km`}
            />
          </Marker>
        ))}

        {selected && (
          <Popup
            latitude={selected.latitude}
            longitude={selected.longitude}
            closeOnClick={false}
            onClose={() => setSelected(null)}
            anchor="top"
            closeButton={false}
            offset={18}
            className="ascari-popup"
          >
            <div className="ascari-popup__inner">
              <div
                className="ascari-popup__card"
                style={{
                  width: POPUP_W,
                  position: "relative",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "rgba(15,18,22,0.98)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
                }}
              >
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Chiudi"
                  title="Chiudi"
                  style={{
                    position: "absolute",
                    zIndex: 5,
                    top: 10,
                    right: 10,
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.35)",
                    background: "rgba(0,0,0,0.55)",
                    color: "white",
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 18,
                    lineHeight: 0,
                    boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
                  }}
                >
                  ✕
                </button>

                <div
                  style={{
                    width: "100%",
                    height: POPUP_IMG_H,
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  <img
                    src={coverFor(selected)}
                    alt={selected.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                    loading="lazy"
                  />
                </div>

                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, ...clamp1 }}>
                    {selected.make} {selected.model}
                  </div>

                  <div style={{ opacity: 0.85, fontSize: 13, ...clamp1 }}>
                    {selected.title}
                  </div>

                  <div style={{ opacity: 0.75, fontSize: 12 }}>
                    {selected.distanceKm.toFixed(1)} km • {selected.year}
                  </div>

                  <div style={{ height: 8 }} />

                  <button
                    onClick={() => navigate(`/cars/${selected.id}`)}
                    style={{
                      width: "100%",
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.10)",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Dettaglio
                  </button>
                </div>
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {!geoDenied && askedGeo && (
        <div className="explore-geo-overlay-wrap">
          <div className="explore-geo-overlay">
            Se hai negato la posizione, la mappa parte da Milano.
          </div>
        </div>
      )}
    </div>
  );
}