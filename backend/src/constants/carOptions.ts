export const CAR_BRANDS = [
  { key: 'bugatti', label: 'Bugatti', icon: '/logos/bugatti.png' },
  { key: 'ferrari', label: 'Ferrari', icon: '/logos/ferrari.png' },
  { key: 'ascari', label: 'Ascari', icon: '/logos/logocut.png' },
  { key: 'audi', label: 'Audi', icon: '/logos/audi.png' },
  { key: 'bmw', label: 'BMW', icon: '/logos/bmw.png' },
  { key: 'fiat', label: 'FIAT', icon: '/logos/fiat.png' },
  { key: 'porsche', label: 'Porsche', icon: '/logos/porsche.png' },
  { key: 'ford', label: 'Ford', icon: '/logos/ford.png' },
  { key: 'toyota', label: 'Toyota', icon: '/logos/toyota.png' },
];

export const FUEL_TYPES = [
  { key: 'benzina', label: 'Benzina', icon: '/fuel/benzina.jpeg' },
  { key: 'diesel', label: 'Diesel', icon: '/fuel/diesel.jpeg' },
  { key: 'elettrico', label: 'Elettrico', icon: '/fuel/elettrico.jpeg' },
  { key: 'gpl', label: 'Metano / GPL', icon: '/fuel/gpl.jpeg' },
  { key: 'idrogeno', label: 'Idrogeno', icon: '/fuel/idro.jpeg' },
];

// ✅ MODELLI per marca (chiave = key della marca)
export const CAR_MODELS_BY_BRAND_KEY: Record<string, string[]> = {
  bugatti: ['Chiron', 'Veyron', 'Divo'],
  ferrari: ['458', '488', 'F8', 'SF90'],
  ascari: ['3000', 'A10'],
  audi: ['TT', 'R8', 'A3', 'A4'],
  bmw: ['Serie 1', 'Serie 3', 'Serie 5'],
  fiat: ['Panda', '500', 'Punto'],
  porsche: ['911', 'Cayenne', 'Taycan'],
  ford: ['Fiesta', 'Focus', 'Mustang'],
  toyota: ['Yaris', 'Corolla', 'Supra'],
};