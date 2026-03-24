import { useState } from 'react';

type Option = {
  key: string;
  label: string;
  icon?: string;
};

type Props = {
  label: string;
  value: string;          // <-- ora value è la KEY selezionata
  options: Option[];
  onChange: (value: string) => void; // <-- ritorna la KEY
  disabled?: boolean;     // <-- (opzionale) utile per Modello
};

export default function SelectableDropdown({
  label,
  value,
  options,
  onChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = options.find(o => o.key === value);

  return (
    <div className="card" style={{ padding: 10, opacity: disabled ? 0.6 : 1 }}>
      {/* HEADER */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className="row space"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div className="row" style={{ gap: 8 }}>
          {selected?.icon && (
            <img src={selected.icon} alt="" style={{ width: 20, height: 20 }} />
          )}
          <strong>{label}</strong>
          <span className="muted">
            {selected ? selected.label : 'Seleziona'}
          </span>
        </div>

        <span className="muted">{open ? '▲' : '▼'}</span>
      </button>

      {/* CONTENUTO */}
      {open && !disabled && (
        <div
          className="grid"
          style={{
            marginTop: 10,
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 8,
          }}
        >
          {options.map(opt => {
            const isSelected = value === opt.key;

            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  onChange(opt.key);   // ✅ salva la KEY
                  setOpen(false);
                }}
                className="btn secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: isSelected ? '2px solid var(--accent)' : undefined,
                }}
              >
                {opt.icon && (
                  <img
                    src={opt.icon}
                    alt={opt.label}
                    style={{ width: 18, height: 18 }}
                  />
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}