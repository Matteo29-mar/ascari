type Option = {
  key: string;
  label: string;
};

type Props = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
};

export default function SelectableGrid({ value, options, onChange }: Props) {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
      {options.map(opt => {
        const selected = value === opt.label;

        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.label)}
            className="btn"
            style={{
              border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: selected ? 'rgba(0,255,200,0.08)' : 'transparent'
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
