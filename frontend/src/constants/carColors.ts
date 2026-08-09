export type CarColorShade = {
  key: string;
  label: string;
  hex: string;
};

export type CarColorFamily = {
  key: string;
  label: string;
  previewHex: string;
  shades: CarColorShade[];
};

export type CarColorOption = CarColorShade & {
  familyKey: string;
  familyLabel: string;
};

export const CAR_COLOR_FAMILIES: CarColorFamily[] = [
  {
    key: 'bianco',
    label: 'Bianco',
    previewHex: '#f8fafc',
    shades: [
      { key: 'bianco', label: 'Bianco', hex: '#f8fafc' },
      { key: 'bianco-ghiaccio', label: 'Bianco ghiaccio', hex: '#eaf4f4' },
      { key: 'bianco-perla', label: 'Bianco perla', hex: '#f2eee3' },
      { key: 'avorio', label: 'Avorio', hex: '#f4e9cd' },
    ],
  },
  {
    key: 'nero',
    label: 'Nero',
    previewHex: '#111827',
    shades: [
      { key: 'nero', label: 'Nero', hex: '#111827' },
      { key: 'nero-metallizzato', label: 'Nero metallizzato', hex: '#252b34' },
      { key: 'nero-opaco', label: 'Nero opaco', hex: '#171717' },
    ],
  },
  {
    key: 'grigio',
    label: 'Grigio',
    previewHex: '#6b7280',
    shades: [
      { key: 'grigio-chiaro', label: 'Grigio chiaro', hex: '#cbd5e1' },
      { key: 'grigio', label: 'Grigio', hex: '#6b7280' },
      { key: 'grigio-antracite', label: 'Grigio antracite', hex: '#374151' },
      { key: 'grigio-scuro', label: 'Grigio scuro', hex: '#1f2937' },
    ],
  },
  {
    key: 'argento',
    label: 'Argento',
    previewHex: '#a8b0ba',
    shades: [
      { key: 'argento-chiaro', label: 'Argento chiaro', hex: '#d5d9de' },
      { key: 'argento', label: 'Argento', hex: '#a8b0ba' },
      { key: 'argento-scuro', label: 'Argento scuro', hex: '#737b86' },
    ],
  },
  {
    key: 'blu',
    label: 'Blu',
    previewHex: '#2563eb',
    shades: [
      { key: 'azzurro', label: 'Azzurro', hex: '#38bdf8' },
      { key: 'blu', label: 'Blu', hex: '#2563eb' },
      { key: 'blu-elettrico', label: 'Blu elettrico', hex: '#155eef' },
      { key: 'blu-scuro', label: 'Blu scuro', hex: '#1e3a8a' },
      { key: 'blu-notte', label: 'Blu notte', hex: '#111d4a' },
    ],
  },
  {
    key: 'rosso',
    label: 'Rosso',
    previewHex: '#dc2626',
    shades: [
      { key: 'rosso', label: 'Rosso', hex: '#dc2626' },
      { key: 'rosso-corsa', label: 'Rosso corsa', hex: '#ef1b1b' },
      { key: 'rosso-scuro', label: 'Rosso scuro', hex: '#991b1b' },
      { key: 'bordeaux', label: 'Bordeaux', hex: '#6f1d32' },
    ],
  },
  {
    key: 'verde',
    label: 'Verde',
    previewHex: '#16a34a',
    shades: [
      { key: 'verde-chiaro', label: 'Verde chiaro', hex: '#65a30d' },
      { key: 'verde', label: 'Verde', hex: '#16a34a' },
      { key: 'verde-oliva', label: 'Verde oliva', hex: '#65733a' },
      { key: 'verde-scuro', label: 'Verde scuro', hex: '#14532d' },
    ],
  },
  {
    key: 'giallo',
    label: 'Giallo',
    previewHex: '#facc15',
    shades: [
      { key: 'giallo', label: 'Giallo', hex: '#facc15' },
      { key: 'giallo-pastello', label: 'Giallo pastello', hex: '#fde68a' },
      { key: 'giallo-oro', label: 'Giallo oro', hex: '#d9a404' },
    ],
  },
  {
    key: 'arancione',
    label: 'Arancione',
    previewHex: '#f97316',
    shades: [
      { key: 'arancione', label: 'Arancione', hex: '#f97316' },
      { key: 'arancione-scuro', label: 'Arancione scuro', hex: '#c2410c' },
      { key: 'rame', label: 'Rame', hex: '#b66a3c' },
    ],
  },
  {
    key: 'marrone',
    label: 'Marrone / Beige',
    previewHex: '#8b5e3c',
    shades: [
      { key: 'beige', label: 'Beige', hex: '#d6c6a5' },
      { key: 'marrone-chiaro', label: 'Marrone chiaro', hex: '#a47449' },
      { key: 'marrone', label: 'Marrone', hex: '#7c4a2d' },
      { key: 'testa-di-moro', label: 'Testa di moro', hex: '#3f2a20' },
    ],
  },
  {
    key: 'viola',
    label: 'Viola',
    previewHex: '#7e22ce',
    shades: [
      { key: 'lilla', label: 'Lilla', hex: '#c4a7e7' },
      { key: 'viola', label: 'Viola', hex: '#7e22ce' },
      { key: 'viola-scuro', label: 'Viola scuro', hex: '#4c1d95' },
    ],
  },
  {
    key: 'oro-bronzo',
    label: 'Oro / Bronzo',
    previewHex: '#b8860b',
    shades: [
      { key: 'oro', label: 'Oro', hex: '#c6a15b' },
      { key: 'bronzo', label: 'Bronzo', hex: '#a97142' },
      { key: 'bronzo-scuro', label: 'Bronzo scuro', hex: '#765134' },
    ],
  },
];

export const CAR_COLOR_OPTIONS: CarColorOption[] = CAR_COLOR_FAMILIES.flatMap(
  (family) =>
    family.shades.map((shade) => ({
      ...shade,
      familyKey: family.key,
      familyLabel: family.label,
    }))
);

function normalizeColorText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getCarColorOption(value?: string | null): CarColorOption | null {
  if (!value) return null;

  const normalizedValue = normalizeColorText(value);
  const exact = CAR_COLOR_OPTIONS.find(
    (option) => normalizeColorText(option.label) === normalizedValue
  );

  if (exact) return exact;

  const byContainedLabel = [...CAR_COLOR_OPTIONS]
    .sort((a, b) => b.label.length - a.label.length)
    .find((option) => normalizedValue.includes(normalizeColorText(option.label)));

  if (byContainedLabel) return byContainedLabel;

  const family = CAR_COLOR_FAMILIES.find((item) => {
    if (normalizedValue.includes(normalizeColorText(item.label))) return true;

    return item.shades.some((shade) => {
      const firstWord = normalizeColorText(shade.label).split(' ')[0];
      return firstWord.length > 3 && normalizedValue.includes(firstWord);
    });
  });

  if (!family) return null;

  const defaultShade = family.shades[0];
  return {
    ...defaultShade,
    familyKey: family.key,
    familyLabel: family.label,
  };
}

export function getCarColorHex(value?: string | null): string | null {
  return getCarColorOption(value)?.hex ?? null;
}
