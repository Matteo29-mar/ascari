// frontend/src/api.ts
import axios from "axios";
import type { ArveDecisionResponse, ArvePricingAnalysis } from "./types/arve";
import { getDealerDeviceLabel, getOrCreateDealerDeviceId } from "./utils/dealerDevice";

// URL base del backend
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4002";

// Client Axios base
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4002/api",
});

// Ogni browser ASCARI invia un identificativo locale. Il backend lo usa solo
// quando l'account è una concessionaria, per applicare il limite dispositivi.
http.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    config.headers = config.headers || {};
    config.headers["X-Ascari-Device-Id"] = getOrCreateDealerDeviceId();
    config.headers["X-Ascari-Device-Label"] = getDealerDeviceLabel();
  }
  return config;
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

// Analizza la nuova auto con ARVE
export async function analyzeCarWithArve(
  carId: number,
  token: string
): Promise<ArvePricingAnalysis> {
  const res = await http.post(
    `/arve/cars/${carId}/analyze`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 35_000,
    }
  );

  return res.data;
}

// Accetta i prezzi ARVE oppure conserva quelli originali
export async function saveArvePricingDecision(
  carId: number,
  acceptSuggestedPrice: boolean,
  token: string
): Promise<ArveDecisionResponse> {
  const res = await http.post(
    `/arve/cars/${carId}/decision`,
    { acceptSuggestedPrice },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return res.data;
}

// Recupera l'ultima analisi ARVE della propria auto
export async function getCarArveAnalysis(
  carId: number,
  token: string
): Promise<ArvePricingAnalysis> {
  const res = await http.get(`/arve/cars/${carId}`, {
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
// =========================
// CONCESSIONARIA / ABBONAMENTI
// =========================

export async function getDealerSubscription(token: string) {
  const res = await http.get("/dealer-subscriptions/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function createDealerSubscriptionCheckout(
  plan: "STARTER" | "ADVANCED",
  token: string
) {
  const res = await http.post(
    "/dealer-subscriptions/checkout",
    { plan },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

export async function confirmDealerSubscriptionCheckout(
  sessionId: string,
  token: string
) {
  const res = await http.post(
    "/dealer-subscriptions/confirm-checkout",
    { sessionId },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

export async function changeDealerSubscriptionPlan(
  plan: "STARTER" | "ADVANCED",
  token: string
) {
  const res = await http.post(
    "/dealer-subscriptions/change-plan",
    { plan },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

export async function createDealerSubscriptionPortal(token: string) {
  const res = await http.post(
    "/dealer-subscriptions/portal",
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

export async function getDealerSubscriptionStats(token: string) {
  const res = await http.get("/dealer-subscriptions/stats", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function getDealerDevices(token: string) {
  const res = await http.get("/dealer-subscriptions/devices", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function registerDealerDevice(
  payload: { deviceId: string; label?: string | null; userAgent?: string | null },
  token: string
) {
  const res = await http.post("/dealer-subscriptions/devices/register", payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function revokeDealerDevice(deviceId: string, token: string) {
  const res = await http.delete(`/dealer-subscriptions/devices/${deviceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}
