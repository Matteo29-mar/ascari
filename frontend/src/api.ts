// frontend/src/api.ts
import axios from "axios";

// URL base del backend
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4002";

// Client Axios base
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4002/api",
});

// Ping
export async function ping() {
  const res = await http.get("/ping");
  return res.data;
}

// Tutte le auto
export async function getAllCars() {
  const res = await http.get("/cars");
  return res.data;
}

// Crea una nuova auto
export async function createCar(data: any, token: string) {
  const res = await http.post("/cars", data, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

// Il mio garage
export async function getMyGarage(token: string) {
  const res = await http.get("/cars/my-garage", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

// Mi piace
export async function likeCar(carId: number, token: string) {
  const res = await http.post(`/cars/${carId}/like`, null, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

// Togli like
export async function unlikeCar(carId: number, token: string) {
  const res = await http.delete(`/cars/${carId}/like`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

// Conteggio chat non lette
export async function getUnreadChatCount(token: string): Promise<number> {
  const res = await http.get("/chat/unread/count", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const count = Number(res?.data?.count ?? 0);
  return Number.isFinite(count) ? count : 0;
}

// =========================
// STRIPE / PAGAMENTI
// =========================

export async function getStripeAccountStatus(token: string) {
  const res = await http.get("/stripe/account/status", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function createStripeOnboardingLink(token: string) {
  const res = await http.post(
    "/stripe/account/onboarding-link",
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res.data;
}

export async function refreshStripeOnboardingLink(token: string) {
  const res = await http.post(
    "/stripe/account/refresh-link",
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res.data;
}

export async function configureCarPayment(
  carId: number,
  payload: {
    salePriceEur: number;
  },
  token: string
) {
  const res = await http.post(`/stripe/cars/${carId}/configure`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function createCarPaymentIntent(carId: number, token: string) {
  const res = await http.post(
    `/stripe/cars/${carId}/create-payment-intent`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res.data;
}

export async function getPaymentStatus(paymentId: number, token: string) {
  const res = await http.get(`/stripe/payments/${paymentId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function refundPayment(paymentId: number, token: string) {
  const res = await http.post(
    `/stripe/payments/${paymentId}/refund`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res.data;
}

export async function getCarQrCode(carId: number, token: string) {
  const res = await http.get(`/cars/${carId}/qr`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.data;
}

export async function getCarQrStats(carId: number, token: string) {
  const res = await http.get(`/cars/${carId}/qr-stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.data;
}