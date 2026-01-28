import React, { useState, useEffect } from "react";
import "./search.css";
import { CAR_BRANDS, CAR_MODELS_BY_BRAND_KEY } from "../../../../backend/src/constants/carOptions";

type Brand = {
  name: string;
  logo: string; // URL immagine
  models: string[];
};




const brands = CAR_BRANDS.map((b) => ({
  name: b.label,
  logo: b.icon,
  models: CAR_MODELS_BY_BRAND_KEY[b.key] ?? [],
  key: b.key,
}));

export default function SearchBar({ onSearch }: { onSearch: (filters: any) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand)
        ? prev.filter((b) => b !== brand)
        : [...prev, brand]
    );
  };

  const toggleModel = (model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model)
        ? prev.filter((m) => m !== model)
        : [...prev, model]
    );
  };

  const search = () => {
    onSearch({
      brands: selectedBrands,
      models: selectedModels
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

          {/* Mostra i modelli delle marche selezionate */}
          {selectedBrands.length > 0 && (
            <>
              <h3>Modelli</h3>
              <div className="model-grid">
                {brands
                  .filter((b) => selectedBrands.includes(b.name))
                  .flatMap((b) => b.models)
                  .map((m) => (
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
        </div>
      )}
    </div>
  );
}
