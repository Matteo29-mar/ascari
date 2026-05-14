// backend/src/lib/carSaleLifecycle.ts

import { PrismaClient, CarMarketStatus } from "@prisma/client";

export const SOLD_CAR_REMOVAL_DAYS = 5;

export function getSoldCarRemovalDate(fromDate = new Date()) {
  const removalDate = new Date(fromDate);
  removalDate.setDate(removalDate.getDate() + SOLD_CAR_REMOVAL_DAYS);
  return removalDate;
}

export function isCarAvailable(car: any) {
  return car?.marketStatus === CarMarketStatus.AVAILABLE && !car?.visuallyRemovedAt;
}

export function isCarSoldPendingRemoval(car: any) {
  return car?.marketStatus === CarMarketStatus.SOLD_PENDING_REMOVAL;
}

export function isCarRemovedAfterSale(car: any) {
  return (
    car?.marketStatus === CarMarketStatus.REMOVED_AFTER_SALE ||
    !!car?.visuallyRemovedAt
  );
}

export function isCarSold(car: any) {
  return (
    car?.marketStatus === CarMarketStatus.SOLD_PENDING_REMOVAL ||
    car?.marketStatus === CarMarketStatus.REMOVED_AFTER_SALE ||
    car?.paymentStatus === "SOLD"
  );
}

export function getCarSaleStatus(car: any) {
  if (!car) return "NOT_FOUND";

  if (isCarRemovedAfterSale(car)) {
    return "REMOVED_AFTER_SALE";
  }

  if (isCarSoldPendingRemoval(car) || car?.paymentStatus === "SOLD") {
    return "SOLD_PENDING_REMOVAL";
  }

  return "AVAILABLE";
}

export function getAvailableCarWhere() {
  return {
    marketStatus: CarMarketStatus.AVAILABLE,
    paymentStatus: {
      not: "SOLD",
    },
    soldAt: null,
    visuallyRemovedAt: null,
  };
}

export function getGarageVisibleCarWhere() {
  return {
    marketStatus: {
      in: [
        CarMarketStatus.AVAILABLE,
        CarMarketStatus.SOLD_PENDING_REMOVAL,
      ],
    },
    visuallyRemovedAt: null,
  };
}

export async function markCarAsSoldPendingRemoval(params: {
  prisma: PrismaClient | any;
  carId: number;
  paymentId?: number | null;
  saleHistoryId?: number | null;
  soldAt?: Date;
}) {
  const soldAt = params.soldAt ?? new Date();
  const removalScheduledAt = getSoldCarRemovalDate(soldAt);

  return params.prisma.car.update({
    where: {
      id: params.carId,
    },
    data: {
      paymentStatus: "SOLD",
      paymentEnabled: false,

      marketStatus: CarMarketStatus.SOLD_PENDING_REMOVAL,
      soldAt,
      removalScheduledAt,
      visuallyRemovedAt: null,

      soldByPaymentId: params.paymentId ?? null,
      soldBySaleHistoryId: params.saleHistoryId ?? null,
    },
  });
}

export async function markCarAsRemovedAfterSale(params: {
  prisma: PrismaClient | any;
  carId: number;
  visuallyRemovedAt?: Date;
}) {
  const visuallyRemovedAt = params.visuallyRemovedAt ?? new Date();

  return params.prisma.car.update({
    where: {
      id: params.carId,
    },
    data: {
      marketStatus: CarMarketStatus.REMOVED_AFTER_SALE,
      visuallyRemovedAt,
      paymentEnabled: false,
    },
  });
}

export async function runSoldCarsVisualCleanup(prisma: PrismaClient | any) {
  const now = new Date();

  const result = await prisma.car.updateMany({
    where: {
      marketStatus: CarMarketStatus.SOLD_PENDING_REMOVAL,
      removalScheduledAt: {
        lte: now,
      },
      visuallyRemovedAt: null,
    },
    data: {
      marketStatus: CarMarketStatus.REMOVED_AFTER_SALE,
      visuallyRemovedAt: now,
      paymentEnabled: false,
    },
  });

  return {
    ok: true,
    removedCount: result.count,
    executedAt: now,
  };
}

export function buildCarAvailabilityResponse(params: {
  car: any;
  alternatives?: any[];
}) {
  const { car, alternatives = [] } = params;

  if (!car) {
    return {
      ok: false,
      available: false,
      status: "NOT_FOUND",
      car: null,
      alternatives,
    };
  }

  const status = getCarSaleStatus(car);

  return {
    ok: true,
    available: status === "AVAILABLE",
    status,
    car: {
      id: car.id,
      make: car.make,
      model: car.model,
      title: car.title,
      year: car.year,
      paymentStatus: car.paymentStatus,
      marketStatus: car.marketStatus,
      soldAt: car.soldAt,
      removalScheduledAt: car.removalScheduledAt,
      visuallyRemovedAt: car.visuallyRemovedAt,
    },
    alternatives,
  };
}