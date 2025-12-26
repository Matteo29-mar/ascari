import React, { useState, useEffect } from "react";
import "./search.css";

type Brand = {
  name: string;
  logo: string; // URL immagine
  models: string[];
};

const brands: Brand[] = [
  {
    name: "Bugatti",
    logo: "/logos/bugatti.png",
    models: ["Chiron", "Veyron", "Divo"],
  },
  {
    name: "Ferrari",
    logo: "/logos/ferrari.png",
    models: ["458", "488", "F8", "SF90"],
  },
  {
    name: "Ascari",
    logo: "/logos/logocut.png",
    models: ["3000", "A10"],
  },
  {
    name: "Audi",
    logo: "/logos/audi.png",
    models: ["TT", "R8", "A3", "A4"],
  },
  {
  name: "BMW",
  logo: "/logos/bmw.png",
  models: ["serie1", "serie3", "serie5"], // o quello che vuoi
  },
  {
  name: "FIAT",
  logo: "/logos/fiat.png",
  models: ["serie1", "serie3", "serie5"], // o quello che vuoi
  },
  {
  name: "PORSCHE",
  logo: "/logos/porsche.png",
  models: ["serie1", "serie3", "serie5"], // o quello che vuoi
},
{
  name: "FORD",
  logo: "/logos/ford.png",
  models: ["serie1", "serie3", "serie5"], // o quello che vuoi
},
{
  name: "TOYOTA",
  logo: "/logos/toyota.png",
  models: ["serie1", "serie3", "serie5"], // o quello che vuoi
},





];

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
