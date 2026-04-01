import React, { useEffect, useRef, useState } from 'react';

type MapboxContextItem = {
  id: string;
  text: string;
  short_code?: string;
};

type MapboxFeature = {
  id: string;
  place_name: string;
  text: string;
  center?: [number, number];
  context?: MapboxContextItem[];
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (payload: {
    locationText: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  }) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function extractCity(feature: MapboxFeature): string | undefined {
  const ctx = feature.context ?? [];

  const place = ctx.find((c) => c.id.startsWith('place'));
  const locality = ctx.find((c) => c.id.startsWith('locality'));
  const district = ctx.find((c) => c.id.startsWith('district'));
  const region = ctx.find((c) => c.id.startsWith('region'));

  return place?.text || locality?.text || district?.text || region?.text;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Indirizzo (es. Via Roma 10)',
  disabled = false,
  className = '',
}: Props) {
  const [items, setItems] = useState<MapboxFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const searchSuggestions = async (query: string) => {
    const trimmed = query.trim();

    if (!MAPBOX_TOKEN || trimmed.length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }

    try {
      setLoading(true);

      const url = new URL(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json`
      );

      url.searchParams.set('access_token', MAPBOX_TOKEN);
      url.searchParams.set('autocomplete', 'true');
      url.searchParams.set('limit', '5');
      url.searchParams.set('language', 'it');
      url.searchParams.set('country', 'it');
      url.searchParams.set('types', 'address,place,locality');

      const res = await fetch(url.toString());
      const data = await res.json();

      const features = Array.isArray(data?.features) ? data.features : [];
      setItems(features);
      setOpen(features.length > 0);
    } catch (err) {
      console.error('Errore autocomplete indirizzo:', err);
      setItems([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const debouncedSearchRef = useRef(
    debounce((q: string) => {
      searchSuggestions(q);
    }, 350)
  );

  useEffect(() => {
    debouncedSearchRef.current(value);
  }, [value]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  const canShowNoResults =
    !loading && value.trim().length >= 3 && open && items.length === 0;

  const inputClassName = ['input', className].filter(Boolean).join(' ');

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
      }}
    >
      <input
        className={inputClassName}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          if (items.length > 0) setOpen(true);
        }}
      />

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 999,
            background: '#151922',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 12,
            boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}
        >
          {loading && (
            <div
              style={{
                padding: '12px 14px',
                color: 'var(--muted)',
                fontSize: 14,
              }}
            >
              Cerco suggerimenti...
            </div>
          )}

          {canShowNoResults && (
            <div
              style={{
                padding: '12px 14px',
                color: 'var(--muted)',
                fontSize: 14,
              }}
            >
              Nessun suggerimento trovato
            </div>
          )}

          {!loading &&
            items.map((item, index) => {
              const isLast = index === items.length - 1;

              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();

                    const city = extractCity(item);

                    onChange(item.place_name);
                    onSelect({
                      locationText: item.place_name,
                      city,
                      latitude: item.center?.[1],
                      longitude: item.center?.[0],
                    });

                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    border: 'none',
                    borderBottom: isLast
                      ? 'none'
                      : '1px solid rgba(255,255,255,0.06)',
                    background: 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  {item.place_name}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}