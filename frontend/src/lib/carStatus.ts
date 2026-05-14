// frontend/src/lib/carStatus.ts

export type CarMarketStatus =
  | "AVAILABLE"
  | "SOLD_PENDING_REMOVAL"
  | "REMOVED_AFTER_SALE";

export type CarStatusLike = {
  paymentStatus?: string | null;
  marketStatus?: CarMarketStatus | string | null;
  soldAt?: string | null;
  removalScheduledAt?: string | null;
  visuallyRemovedAt?: string | null;
};

export function isCarAvailable(car?: CarStatusLike | null) {
  if (!car) return false;

  return car.marketStatus === "AVAILABLE" && !car.visuallyRemovedAt;
}

export function isCarSoldPendingRemoval(car?: CarStatusLike | null) {
  if (!car) return false;

  return (
    car.marketStatus === "SOLD_PENDING_REMOVAL" ||
    car.paymentStatus === "SOLD"
  ) && !car.visuallyRemovedAt;
}

export function isCarRemovedAfterSale(car?: CarStatusLike | null) {
  if (!car) return false;

  return (
    car.marketStatus === "REMOVED_AFTER_SALE" ||
    !!car.visuallyRemovedAt
  );
}

export function isCarSold(car?: CarStatusLike | null) {
  if (!car) return false;

  return (
    car.marketStatus === "SOLD_PENDING_REMOVAL" ||
    car.marketStatus === "REMOVED_AFTER_SALE" ||
    car.paymentStatus === "SOLD" ||
    !!car.soldAt ||
    !!car.visuallyRemovedAt
  );
}

export function getCarStatusLabel(car?: CarStatusLike | null) {
  if (!car) return "Non disponibile";

  if (isCarRemovedAfterSale(car)) {
    return "Rimossa dopo vendita";
  }

  if (isCarSoldPendingRemoval(car)) {
    return "Venduta · rimozione a breve";
  }

  return "Disponibile";
}

export function getRemovalDateLabel(car?: CarStatusLike | null) {
  if (!car?.removalScheduledAt) return null;

  const d = new Date(car.removalScheduledAt);

  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getSoldDateLabel(car?: CarStatusLike | null) {
  if (!car?.soldAt) return null;

  const d = new Date(car.soldAt);

  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}