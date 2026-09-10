import { PrismaClient } from "@prisma/client";

type ObservationType =
  | "LISTING_CREATED"
  | "OFFER_RECEIVED"
  | "OFFER_ACCEPTED"
  | "REAL_SALE";

export async function recordArveMarketObservation(
  prisma: PrismaClient | any,
  params: {
    type: ObservationType;
    externalKey: string;
    car: any;
    amountEur?: number | null;
    metadata?: Record<string, unknown> | null;
    occurredAt?: Date;
  }
) {
  const car = params.car;
  if (!car?.id || !car?.make || !car?.model || !car?.year || !car?.fuelType) {
    return null;
  }

  return prisma.arveMarketObservation.upsert({
    where: { externalKey: params.externalKey },
    create: {
      carId: car.id,
      type: params.type,
      externalKey: params.externalKey,
      make: String(car.make),
      model: String(car.model),
      year: Number(car.year),
      mileageKm: car.mileageKm == null ? null : Number(car.mileageKm),
      fuelType: String(car.fuelType),
      transmission: car.transmission ? String(car.transmission) : null,
      trimLevel: car.trimLevel ? String(car.trimLevel) : null,
      amountEur:
        params.amountEur == null ? null : Math.round(Number(params.amountEur)),
      offerPrice1:
        car.offerPrice1 == null ? null : Math.round(Number(car.offerPrice1)),
      offerPrice2:
        car.offerPrice2 == null ? null : Math.round(Number(car.offerPrice2)),
      offerPrice3:
        car.offerPrice3 == null ? null : Math.round(Number(car.offerPrice3)),
      metadata: params.metadata ? (params.metadata as any) : undefined,
      occurredAt: params.occurredAt ?? new Date(),
    },
    update: {
      amountEur:
        params.amountEur == null ? undefined : Math.round(Number(params.amountEur)),
      metadata: params.metadata ? (params.metadata as any) : undefined,
      occurredAt: params.occurredAt ?? new Date(),
    },
  });
}

export async function safeRecordArveMarketObservation(
  prisma: PrismaClient | any,
  params: Parameters<typeof recordArveMarketObservation>[1]
) {
  try {
    return await recordArveMarketObservation(prisma, params);
  } catch (error) {
    console.error(
      `[ARVE_OBSERVATION] type=${params.type} key=${params.externalKey} failed:`,
      error
    );
    return null;
  }
}
