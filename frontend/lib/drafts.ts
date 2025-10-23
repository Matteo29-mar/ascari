// frontend/src/lib/drafts.ts
export type DraftCar = {
  id: string;                  // uuid locale
  createdAt: number;
  make: string;
  model: string;
  year: number;
  fuelType?: string;
  horsepower?: number;
  mileageKm?: number;
  photos: string[];            // può contenere dataURL base64
  coverUrl?: string;           // può essere anch’essa dataURL
  description?: string;
  latitude?: number;
  longitude?: number;
};

const KEY = 'ascari.drafts';

export function loadDrafts(): DraftCar[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function saveDrafts(list: DraftCar[]) { localStorage.setItem(KEY, JSON.stringify(list)); }
export function addDraft(d: DraftCar) { const all = loadDrafts(); all.unshift(d); saveDrafts(all); }
export function removeDraft(id: string) { saveDrafts(loadDrafts().filter(d => d.id !== id)); }
export function getDraft(id: string): DraftCar | null {
  return loadDrafts().find(d => d.id === id) || null;
}
export function upsertDraft(d: DraftCar) {
  const all = loadDrafts();
  const i = all.findIndex(x => x.id === d.id);
  if (i >= 0) all[i] = d; else all.unshift(d);
  saveDrafts(all);
}
export function clearDrafts() { localStorage.removeItem(KEY); }
