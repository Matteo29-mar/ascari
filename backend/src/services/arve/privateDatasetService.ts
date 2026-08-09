import { PrismaClient } from "@prisma/client";
import {
  ArveComparableItem,
  ArvePricingInput,
} from "../../types/arvePricing";

function normalize(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSimilarity(left: string, right: string): number {
  const a = new Set(normalize(left).split(" ").filter(Boolean));
  const b = new Set(normalize(right).split(" ").filter(Boolean));

  if (!a.size || !b.size) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }

  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

function proximityScore(left: number | null, right: number | null, tolerance: number): number {
  if (left == null || right == null || tolerance <= 0) return 0;
  const distance = Math.abs(left - right);
  return Math.max(0, 1 - distance / tolerance);
}

function calculateSimilarity(input: ArvePricingInput, car: any): number {
  const sameMake = normalize(input.make) === normalize(car.make);
  const sameModel = normalize(input.model) === normalize(car.model);

  let score = 0;
  score += sameMake ? 0.2 : 0;
  score += sameModel ? 0.35 : tokenSimilarity(input.model, car.model) * 0.1;
  score += proximityScore(input.year, car.year, 8) * 0.15;
  score += proximityScore(input.mileageKm, car.mileageKm, 150_000) * 0.1;
  score += normalize(input.fuelType) === normalize(car.fuelType) ? 0.05 : 0;
  score += normalize(input.transmission) === normalize(car.transmission) ? 0.05 : 0;
  score += proximityScore(input.horsepower, car.horsepower, 180) * 0.05;
  score += normalize(input.city) === normalize(car.city) ? 0.03 : 0;
  score += input.isPeriziata === Boolean(car.isPeriziata) ? 0.02 : 0;

  return Math.min(1, Math.max(0, score));
}

function averagePositive(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(
    (value): value is number => Number.isFinite(value) && Number(value) > 0
  );

  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function resolveEvidence(car: any): {
  observedPriceEur: number | null;
  evidenceType: ArveComparableItem["evidenceType"];
  evidenceWeight: number;
  soldAt: Date | null;
} {
  const analysis = car.arvePricingAnalysis;
  const latestSale = car.saleHistories?.[0] ?? null;

  const realSalePrice =
    analysis?.actualSoldPriceEur ??
    latestSale?.amountEur ??
    (car.soldAt ? car.salePriceEur : null);

  if (Number(realSalePrice) > 0) {
    return {
      observedPriceEur: Number(realSalePrice),
      evidenceType: "REAL_SALE",
      evidenceWeight: 1,
      soldAt: analysis?.actualSoldAt ?? latestSale?.soldAt ?? car.soldAt ?? null,
    };
  }

  if (analysis?.userDecision === "ACCEPTED") {
    return {
      observedPriceEur:
        averagePositive([
          car.offerPrice1,
          car.offerPrice2,
          car.offerPrice3,
        ]) ?? analysis.democraticPrice,
      evidenceType: "ARVE_ACCEPTED",
      evidenceWeight: 0.65,
      soldAt: null,
    };
  }

  if (analysis?.userDecision === "REJECTED") {
    return {
      observedPriceEur:
        averagePositive([
          analysis.originalOfferPrice1,
          analysis.originalOfferPrice2,
          analysis.originalOfferPrice3,
        ]) ?? analysis.democraticPrice,
      evidenceType: "ARVE_REJECTED",
      evidenceWeight: 0.35,
      soldAt: null,
    };
  }

  if (analysis) {
    return {
      observedPriceEur: analysis.democraticPrice,
      evidenceType: "ARVE_PENDING",
      evidenceWeight: 0.25,
      soldAt: null,
    };
  }

  return {
    observedPriceEur:
      car.priceEur ??
      averagePositive([car.offerPrice1, car.offerPrice2, car.offerPrice3]),
    evidenceType: "ACTIVE_LISTING",
    evidenceWeight: 0.2,
    soldAt: null,
  };
}

function daysBetween(start: Date | null | undefined, end: Date | null | undefined): number | null {
  if (!start || !end) return null;
  const milliseconds = end.getTime() - start.getTime();
  if (milliseconds < 0) return null;
  return Math.max(0, Math.round(milliseconds / 86_400_000));
}

const comparableInclude = {
  arvePricingAnalysis: true,
  saleHistories: {
    orderBy: { soldAt: "desc" as const },
    take: 1,
    select: {
      amountEur: true,
      soldAt: true,
    },
  },
};

export async function findPrivateDatasetMatches(
  prisma: PrismaClient,
  input: ArvePricingInput,
  excludeCarId: number
): Promise<ArveComparableItem[]> {
  const limit = Math.min(
    30,
    Math.max(3, Number(process.env.ARVE_PRIVATE_DATASET_LIMIT || 12))
  );

  const sameMakeRows = await prisma.car.findMany({
    where: {
      id: { not: excludeCarId },
      make: { equals: input.make, mode: "insensitive" },
    },
    include: comparableInclude,
    orderBy: { createdAt: "desc" },
    take: 120,
  });

  let rows: any[] = sameMakeRows;

  if (rows.length < limit) {
    const remaining = limit * 4 - rows.length;
    const broadRows = await prisma.car.findMany({
      where: {
        id: {
          notIn: [excludeCarId, ...rows.map((row) => row.id)],
        },
        year: {
          gte: input.year - 5,
          lte: input.year + 5,
        },
        fuelType: { equals: input.fuelType, mode: "insensitive" },
      },
      include: comparableInclude,
      orderBy: { createdAt: "desc" },
      take: Math.max(0, remaining),
    });

    rows = [...rows, ...broadRows];
  }

  return rows
    .map((car) => {
      const evidence = resolveEvidence(car);
      if (!evidence.observedPriceEur || evidence.observedPriceEur <= 0) {
        return null;
      }

      const similarityScore = calculateSimilarity(input, car);
      const rankingScore = similarityScore * 0.75 + evidence.evidenceWeight * 0.25;

      return {
        carId: car.id,
        title: car.title,
        make: car.make,
        model: car.model,
        year: car.year,
        mileageKm: car.mileageKm,
        fuelType: car.fuelType,
        transmission: car.transmission,
        horsepower: car.horsepower,
        city: car.city,
        isPeriziata: car.isPeriziata,
        observedPriceEur: Math.round(evidence.observedPriceEur),
        evidenceType: evidence.evidenceType,
        evidenceWeight: evidence.evidenceWeight,
        similarityScore: Number(similarityScore.toFixed(4)),
        rankingScore: Number(rankingScore.toFixed(4)),
        soldAt: evidence.soldAt?.toISOString() ?? null,
        daysToSell: daysBetween(car.createdAt, evidence.soldAt),
      } satisfies ArveComparableItem;
    })
    .filter((row): row is ArveComparableItem => Boolean(row))
    .filter((row) => row.similarityScore >= 0.18 || row.evidenceType === "REAL_SALE")
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, limit);
}
