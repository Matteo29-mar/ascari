// frontend/src/lib/drafts.ts
export type DraftCar = {
  id: string;
  createdAt: number;

  // campi principali
  make: string;
  model: string;
  title?: string;
  year: number;
  fuelType?: string;
  horsepower?: number;
  mileageKm?: number;
  description?: string;
  coverUrl?: string;
  photos?: string[];

  offerPrice1?: number;
  offerPrice2?: number;
  offerPrice3?: number;
  locationText?: string;
  city?: string;

  // campi aggiuntivi opzionali
  color?: string;
  torqueNm?: number;
  drivetrain?: string;
  transmission?: string;
  seats?: number;
  doors?: number;
  priceEur?: number;
  engine?: string;
  trimLevel?: string;
  latitude?: number;
  longitude?: number;

  // campi di supporto UI
  missingRequiredFields?: string[];
};

const KEY = 'ascari.drafts';

export function loadDrafts(): DraftCar[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveDrafts(list: DraftCar[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addDraft(d: DraftCar) {
  const all = loadDrafts();
  all.unshift(d);
  saveDrafts(all);
}

export function removeDraft(id: string) {
  saveDrafts(loadDrafts().filter((d) => d.id !== id));
}

export function getDraft(id: string): DraftCar | null {
  return loadDrafts().find((d) => d.id === id) || null;
}

export function upsertDraft(d: DraftCar) {
  const all = loadDrafts();
  const i = all.findIndex((x) => x.id === d.id);
  if (i >= 0) all[i] = d;
  else all.unshift(d);
  saveDrafts(all);
}

export function clearDrafts() {
  localStorage.removeItem(KEY);
}