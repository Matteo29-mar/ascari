// frontend/src/api.ts
import axios from "axios";

// URL base del backend
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4002";

// Client Axios base
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4002/api",
});

// --- ESEMPI DI CHIAMATE ---

// Ping
export async function ping() {
  const res = await http.get("/ping");
  return res.data;
}

// Tutte le auto (pagina pubblica)
export async function getAllCars() {
  const res = await http.get("/cars");
  return res.data;
}

// Crea una nuova auto (richiede token Clerk)
export async function createCar(data: any, token: string) {
  const res = await http.post("/cars", data, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

// Il mio garage (auto mie + piaciute)
export async function getMyGarage(token: string) {
  const res = await http.get("/cars/my-garage", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

// Metti "mi piace"
export async function likeCar(carId: number, token: string) {
  const res = await http.post(`/cars/${carId}/like`, null, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

// Togli "mi piace"
export async function unlikeCar(carId: number, token: string) {
  const res = await http.delete(`/cars/${carId}/like`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

// Conteggio messaggi chat non letti
export async function getUnreadChatCount(token: string): Promise<number> {
  const res = await http.get("/chat/unread/count", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const count = Number(res?.data?.count ?? 0);
  return Number.isFinite(count) ? count : 0;
}