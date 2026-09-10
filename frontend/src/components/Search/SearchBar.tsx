import React, { useMemo, useState } from "react";
import "./search.css";
import {
  CAR_BRANDS,
  CAR_MODELS_BY_BRAND_KEY,
  TRANSMISSION_TYPES,
  FUEL_TYPES,
} from "../../constants/carOptions";

const brands = CAR_BRANDS.map((b) => ({
  name: b.label,
  logo: b.icon,
  models: CAR_MODELS_BY_BRAND_KEY[b.key] ?? [],
  key: b.key,
}));


type SearchFilters = {
  brands: string[];
  models: string[];
  fuelTypes: string[];
  transmissions: string[];
  yearMin?: number;
  yearMax?: number;
  mileageMin?: number;
  mileageMax?: number;
  horsepowerMin?: number;
  horsepowerMax?: number;
};

export default function SearchBar({
  onSearch,
}: {
  onSearch: (filters: SearchFilters) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedFuelTypes, setSelectedFuelTypes] = useState<string[]>([]);
  const [selectedTransmissions, setSelectedTransmissions] = useState<string[]>([]);

  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");

  const [mileageMin, setMileageMin] = useState("");
  const [mileageMax, setMileageMax] = useState("");

  const [horsepowerMin, setHorsepowerMin] = useState("");
  const [horsepowerMax, setHorsepowerMax] = useState("");

  const availableModels = useMemo(() => {
    const models = brands
      .filter((b) => selectedBrands.includes(b.name))
      .flatMap((b) => b.models);

    return Array.from(new Set(models)).sort((a, b) => a.localeCompare(b));
  }, [selectedBrands]);

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) => {
      const next = prev.includes(brand)
        ? prev.filter((b) => b !== brand)
        : [...prev, brand];

      if (prev.includes(brand)) {
        const remainingModels = brands
          .filter((b) => next.includes(b.name))
          .flatMap((b) => b.models);

        setSelectedModels((current) =>
          current.filter((m) => remainingModels.includes(m))
        );
      }

      return next;
    });
  };

  const toggleModel = (model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model]
    );
  };

  const toggleFuelType = (fuelLabel: string) => {
    setSelectedFuelTypes((prev) =>
      prev.includes(fuelLabel)
        ? prev.filter((f) => f !== fuelLabel)
        : [...prev, fuelLabel]
    );
  };

  const toggleTransmission = (transmissionLabel: string) => {
    setSelectedTransmissions((prev) =>
      prev.includes(transmissionLabel)
        ? prev.filter((t) => t !== transmissionLabel)
        : [...prev, transmissionLabel]
    );
  };

  const toOptionalNumber = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  };

  const search = () => {
    onSearch({
      brands: selectedBrands,
      models: selectedModels,
      fuelTypes: selectedFuelTypes,
      transmissions: selectedTransmissions,
      yearMin: toOptionalNumber(yearMin),
      yearMax: toOptionalNumber(yearMax),
      mileageMin: toOptionalNumber(mileageMin),
      mileageMax: toOptionalNumber(mileageMax),
      horsepowerMin: toOptionalNumber(horsepowerMin),
      horsepowerMax: toOptionalNumber(horsepowerMax),
    });
  };

  const resetFilters = () => {
    setSelectedBrands([]);
    setSelectedModels([]);
    setSelectedFuelTypes([]);
    setSelectedTransmissions([]);
    setYearMin("");
    setYearMax("");
    setMileageMin("");
    setMileageMax("");
    setHorsepowerMin("");
    setHorsepowerMax("");

    onSearch({
      brands: [],
      models: [],
      fuelTypes: [],
      transmissions: [],
    });
  };

  return (
    <div className="search-box">
      <div className="search-header">
        <button className="btn primary" onClick={search}>
          Cerca
        </button>

        <button className="btn secondary" onClick={() => setIsOpen(!isOpen)}>
          Filtri avanzati ▾
        </button>
      </div>

      {isOpen && (
        <div className="dropdown-panel">
          <h3>Marca</h3>
          <div className="brand-grid">
            {brands.map((b) => (
              <label key={b.name} className="brand-item">
                <input
                  type="checkbox"
                  checked={selectedBrands.includes(b.name)}
                  onChange={() => toggleBrand(b.name)}
                />
                <img src={b.logo} alt={b.name} className="brand-logo" />
                <span>{b.name}</span>
              </label>
            ))}
          </div>

          {selectedBrands.length > 0 && (
            <>
              <h3>Modelli</h3>
              <div className="model-grid">
                {availableModels.map((m) => (
                  <label key={m} className="model-item">
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(m)}
                      onChange={() => toggleModel(m)}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </>
          )}

          <h3>Carburante</h3>
          <div className="brand-grid">
            {FUEL_TYPES.map((fuel) => (
              <label key={fuel.label} className="brand-item">
                <input
                  type="checkbox"
                  checked={selectedFuelTypes.includes(fuel.label)}
                  onChange={() => toggleFuelType(fuel.label)}
                />
                <img src={fuel.icon} alt={fuel.label} className="brand-logo" />
                <span>{fuel.label}</span>
              </label>
            ))}
          </div>

          <h3>Cambio</h3>
          <div className="brand-grid">
            {TRANSMISSION_TYPES.map((transmission) => (
              <label key={transmission.label} className="brand-item">
                <input
                  type="checkbox"
                  checked={selectedTransmissions.includes(transmission.label)}
                  onChange={() => toggleTransmission(transmission.label)}
                />
                <img src={transmission.icon} alt={transmission.label} className="brand-logo transmission-logo" />
                <span>{transmission.label}</span>
              </label>
            ))}
          </div>

          <div className="advanced-specs-row">
            <section className="spec-card">
              <div className="spec-card-header">
                <span className="spec-card-icon">📅</span>
                <h3>Anno</h3>
              </div>

              <div className="range-grid">
                <div className="range-field">
                  <label>Da</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Es. 2018"
                    value={yearMin}
                    onChange={(e) => setYearMin(e.target.value)}
                  />
                </div>

                <div className="range-field">
                  <label>A</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Es. 2024"
                    value={yearMax}
                    onChange={(e) => setYearMax(e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="spec-card">
              <div className="spec-card-header">
                <span className="spec-card-icon">🏁</span>
                <h3>Kilometraggio</h3>
              </div>

              <div className="range-grid">
                <div className="range-field">
                  <label>Da</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Es. 10000"
                    value={mileageMin}
                    onChange={(e) => setMileageMin(e.target.value)}
                  />
                </div>

                <div className="range-field">
                  <label>A</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Es. 80000"
                    value={mileageMax}
                    onChange={(e) => setMileageMax(e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="spec-card">
              <div className="spec-card-header">
                <span className="spec-card-icon">⚡</span>
                <h3>Potenza (CV)</h3>
              </div>

              <div className="range-grid">
                <div className="range-field">
                  <label>Da</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Es. 150"
                    value={horsepowerMin}
                    onChange={(e) => setHorsepowerMin(e.target.value)}
                  />
                </div>

                <div className="range-field">
                  <label>A</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Es. 400"
                    value={horsepowerMax}
                    onChange={(e) => setHorsepowerMax(e.target.value)}
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="search-actions-centered">
            <button className="btn primary" onClick={search}>
              Applica filtri
            </button>

            <button className="btn secondary" onClick={resetFilters}>
              Reset filtri
            </button>
          </div>
        </div>
      )}
    </div>
  );
}