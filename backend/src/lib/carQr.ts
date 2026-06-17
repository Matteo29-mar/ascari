import crypto from "crypto";
import { prisma } from "../prisma";

export function createCarQrToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function buildBackendPublicUrl() {
  const configuredUrl = process.env.BACKEND_PUBLIC_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BACKEND_PUBLIC_URL non configurata in produzione. " +
        "Imposta BACKEND_PUBLIC_URL=https://api.myascari.com"
    );
  }

  return "http://localhost:4002";
}

export function buildFrontendPublicUrl() {
  const configuredUrl =
    process.env.FRONTEND_URL?.trim() ||
    process.env.CORS_ORIGIN?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FRONTEND_URL non configurata in produzione. " +
        "Imposta FRONTEND_URL=https://myascari.com"
    );
  }

  return "http://localhost:5173";
}

export function buildCarQrUrl(qrToken: string) {
  return `${buildBackendPublicUrl()}/qr/${qrToken}`;
}

export function buildCarPublicUrl(carId: number) {
  return `${buildFrontendPublicUrl()}/cars/${carId}?source=qr`;
}

export async function ensureCarQrToken(carId: number) {
  const car = await prisma.car.findUnique({
    where: { id: carId },
    select: {
      id: true,
      qrToken: true,
      qrCodeCreatedAt: true,
    },
  });

  if (!car) return null;

  if (car.qrToken) {
    return car.qrToken;
  }

  const qrToken = createCarQrToken();

  const updated = await prisma.car.update({
    where: { id: carId },
    data: {
      qrToken,
      qrCodeCreatedAt: new Date(),
    },
    select: {
      qrToken: true,
    },
  });

  return updated.qrToken;
}

export function getVisitorHash(rawVisitorId: string) {
  const secret = process.env.QR_TRACKING_SECRET || "ascari-local-secret";

  return crypto
    .createHash("sha256")
    .update(`${rawVisitorId}:${secret}`)
    .digest("hex");
}

export function createVisitorId() {
  return crypto.randomBytes(24).toString("hex");
}