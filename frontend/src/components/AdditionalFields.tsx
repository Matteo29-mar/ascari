// src/components/AdditionalFields.tsx
import React, { useState } from 'react';

type AdditionalFieldsProps = {
  data: {
    color?: string;
    torqueNm?: number | '';
    drivetrain?: string;
    transmission?: string;
    seats?: number | '';
    doors?: number | '';
    priceEur?: number | '';
    engine?: string;
    trimLevel?: string;
  };
  setData: (data: {
    color?: string;
    torqueNm?: number | '';
    drivetrain?: string;
    transmission?: string;
    seats?: number | '';
    doors?: number | '';
    priceEur?: number | '';
    engine?: string;
    trimLevel?: string;
  }) => void;
};

export default function AdditionalFields({ data, setData }: AdditionalFieldsProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div
        className="card-body"
        style={{ cursor: 'pointer', paddingBottom: open ? 0 : 12 }}
        onClick={() => setOpen(!open)}
      >
        <div className="row space" style={{ alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Informazioni aggiuntive</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            (facoltative) {open ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {open && (
        <div className="card-body" style={{ paddingTop: 8 }}>
          <div className="grid" style={{ gap: 12 }}>
            <input
              className="input"
              placeholder="Motore (es. 2.0 TFSI)"
              value={data.engine || ''}
              onChange={(e) => setData({ ...data, engine: e.target.value })}
            />

            <input
              className="input"
              placeholder="Livello allestimento (es. Sport, Premium)"
              value={data.trimLevel || ''}
              onChange={(e) => setData({ ...data, trimLevel: e.target.value })}
            />

            <input
              className="input"
              placeholder="Colore"
              value={data.color || ''}
              onChange={(e) => setData({ ...data, color: e.target.value })}
            />

            <input
              className="input"
              type="number"
              placeholder="Prezzo (€)"
              value={data.priceEur ?? ''}
              onChange={(e) =>
                setData({
                  ...data,
                  priceEur: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
            />

            <input
              className="input"
              placeholder="Trazione (es. AWD, RWD)"
              value={data.drivetrain || ''}
              onChange={(e) => setData({ ...data, drivetrain: e.target.value })}
            />

            <input
              className="input"
              placeholder="Cambio (es. Manuale, Automatico)"
              value={data.transmission || ''}
              onChange={(e) =>
                setData({ ...data, transmission: e.target.value })
              }
            />

            <input
              className="input"
              type="number"
              placeholder="Coppia (Nm)"
              value={data.torqueNm ?? ''}
              onChange={(e) =>
                setData({
                  ...data,
                  torqueNm: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
            />

            <input
              className="input"
              type="number"
              placeholder="Posti"
              value={data.seats ?? ''}
              onChange={(e) =>
                setData({
                  ...data,
                  seats: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
            />

            <input
              className="input"
              type="number"
              placeholder="Porte"
              value={data.doors ?? ''}
              onChange={(e) =>
                setData({
                  ...data,
                  doors: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}
