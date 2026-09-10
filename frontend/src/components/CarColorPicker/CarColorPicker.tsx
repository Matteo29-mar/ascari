import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CAR_COLOR_FAMILIES,
  getCarColorOption,
} from '../../constants/carColors';
import './CarColorPicker.css';

type CarColorPickerProps = {
  value?: string;
  onChange: (value: string) => void;
};

export default function CarColorPicker({
  value = '',
  onChange,
}: CarColorPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentOption = useMemo(() => getCarColorOption(value), [value]);
  const [open, setOpen] = useState(false);
  const [selectedFamilyKey, setSelectedFamilyKey] = useState<string | null>(
    currentOption?.familyKey ?? null
  );

  const selectedFamily = useMemo(
    () =>
      CAR_COLOR_FAMILIES.find((family) => family.key === selectedFamilyKey) ??
      null,
    [selectedFamilyKey]
  );

  useEffect(() => {
    if (currentOption?.familyKey) {
      setSelectedFamilyKey(currentOption.familyKey);
    }
  }, [currentOption?.familyKey]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function chooseShade(label: string) {
    onChange(label);
    setOpen(false);
  }

  function clearSelection() {
    onChange('');
    setSelectedFamilyKey(null);
    setOpen(false);
  }

  return (
    <div className="ascari-color-picker" ref={rootRef}>
      <button
        type="button"
        className={`ascari-color-picker-trigger ${open ? 'is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="ascari-color-picker-trigger-value">
          {value ? (
            <>
              <span
                className="ascari-color-swatch"
                style={{ backgroundColor: currentOption?.hex ?? '#94a3b8' }}
                aria-hidden="true"
              />
              <span>{value}</span>
            </>
          ) : (
            <span className="ascari-color-picker-placeholder">
              Seleziona colore e tonalità
            </span>
          )}
        </span>

        <span className="ascari-color-picker-chevron" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div
          className="ascari-color-picker-panel"
          role="dialog"
          aria-label="Seleziona il colore dell'auto"
        >
          <div className="ascari-color-picker-head">
            <div>
              <strong>Colore principale</strong>
              <p>Scegli prima la famiglia di colore.</p>
            </div>

            {value && (
              <button
                type="button"
                className="ascari-color-picker-clear"
                onClick={clearSelection}
              >
                Rimuovi
              </button>
            )}
          </div>

          <div className="ascari-color-family-grid">
            {CAR_COLOR_FAMILIES.map((family) => {
              const selected = selectedFamilyKey === family.key;

              return (
                <button
                  key={family.key}
                  type="button"
                  className={`ascari-color-family ${selected ? 'is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => setSelectedFamilyKey(family.key)}
                >
                  <span
                    className="ascari-color-family-swatch"
                    style={{ backgroundColor: family.previewHex }}
                    aria-hidden="true"
                  />
                  <span>{family.label}</span>
                </button>
              );
            })}
          </div>

          <div className="ascari-color-shades-section">
            <strong>Tonalità</strong>

            {selectedFamily ? (
              <div className="ascari-color-shade-grid">
                {selectedFamily.shades.map((shade) => {
                  const selected = value === shade.label;

                  return (
                    <button
                      key={shade.key}
                      type="button"
                      className={`ascari-color-shade ${selected ? 'is-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => chooseShade(shade.label)}
                    >
                      <span
                        className="ascari-color-shade-swatch"
                        style={{ backgroundColor: shade.hex }}
                        aria-hidden="true"
                      />
                      <span>{shade.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="ascari-color-picker-help">
                Seleziona un colore principale per visualizzare le tonalità.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
