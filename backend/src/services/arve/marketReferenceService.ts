import { PrismaClient } from "@prisma/client";
import {
  ArveMarketReferenceItem,
  ArvePricingInput,
} from "../../types/arvePricing";

export function normalizeArveKey(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSimilarity(left: string, right: string): number {
  const a = new Set(normalizeArveKey(left).split(" ").filter(Boolean));
  const b = new Set(normalizeArveKey(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / new Set([...a, ...b]).size;
}

export function marketQualityWeight(
  quality: ArveMarketReferenceItem["quality"]
): number {
  switch (quality) {
    case "VERIFIED":
      return 1;
    case "AGGREGATED":
      return 0.72;
    case "MODEL_ESTIMATE":
      return 0.38;
    case "TO_VALIDATE":
    default:
      return 0.12;
  }
}

function yearScore(inputYear: number, referenceYear: number): number {
  const distance = Math.abs(inputYear - referenceYear);
  return Math.max(0.1, 1 - distance / 10);
}

function mileageScore(
  mileageKm: number | null,
  kmMin: number | null,
  kmMax: number | null
): number {
  if (mileageKm == null || kmMin == null || kmMax == null) return 0.55;
  if (mileageKm >= kmMin && mileageKm <= kmMax) return 1;

  const distance =
    mileageKm < kmMin ? kmMin - mileageKm : mileageKm - kmMax;
  const span = Math.max(30_000, kmMax - kmMin);
  return Math.max(0.15, 1 - distance / (span * 1.5));
}

function trimScore(inputTrim: string | null, referenceTrim: string | null): number {
  if (!inputTrim || !referenceTrim) return 0.5;
  const normalizedInput = normalizeArveKey(inputTrim);
  if (!normalizedInput) return 0.5;
  if (normalizeArveKey(referenceTrim).includes(normalizedInput)) return 1;
  return Math.max(0.35, tokenSimilarity(inputTrim, referenceTrim));
}

function weightedMedian(rows: ArveMarketReferenceItem[]): number | null {
  if (!rows.length) return null;
  const ordered = rows
    .map((row) => ({
      value: row.priceMid,
      weight: Math.max(0.01, row.rankingScore),
    }))
    .sort((a, b) => a.value - b.value);

  const total = ordered.reduce((sum, row) => sum + row.weight, 0);
  let cumulative = 0;
  for (const row of ordered) {
    cumulative += row.weight;
    if (cumulative >= total / 2) return row.value;
  }
  return ordered[ordered.length - 1]?.value ?? null;
}

export function summarizeMarketReferences(rows: ArveMarketReferenceItem[]) {
  if (!rows.length) {
    return {
      count: 0,
      quality: 0,
      median: null as number | null,
    };
  }

  const totalWeight = rows.reduce((sum, row) => sum + row.rankingScore, 0);
  const quality =
    totalWeight > 0
      ? rows.reduce(
          (sum, row) => sum + row.qualityWeight * row.rankingScore,
          0
        ) / totalWeight
      : 0;

  return {
    count: rows.length,
    quality: Number(Math.min(1, Math.max(0, quality)).toFixed(4)),
    median: weightedMedian(rows),
  };
}

export async function findMarketReferenceMatches(
  prisma: PrismaClient,
  input: ArvePricingInput
): Promise<ArveMarketReferenceItem[]> {
  const limit = Math.min(
    16,
    Math.max(3, Number(process.env.ARVE_MARKET_REFERENCE_LIMIT || 8))
  );

  const makeNormalized = normalizeArveKey(input.make);
  const modelNormalized = normalizeArveKey(input.model);
  const fuelNormalized = normalizeArveKey(input.fuelType);

  let rows = await prisma.arveMarketReference.findMany({
    where: {
      makeNormalized,
      modelNormalized,
      fuelNormalized,
      priceMin: { gt: 0 },
      priceMax: { gt: 0 },
    },
    orderBy: [{ referenceYear: "desc" }, { updatedAt: "desc" }],
  });

  // Fallback controllato: stesso marchio/modello, fuel differente, ma con penalità.
  // Serve solo per non lasciare ARVE completamente senza baseline quando il foglio
  // non ha ancora una riga fuel-specifica affidabile.
  let exactFuel = true;
  if (!rows.length) {
    exactFuel = false;
    rows = await prisma.arveMarketReference.findMany({
      where: {
        makeNormalized,
        modelNormalized,
        priceMin: { gt: 0 },
        priceMax: { gt: 0 },
        quality: { not: "TO_VALIDATE" },
      },
      orderBy: [{ referenceYear: "desc" }, { updatedAt: "desc" }],
      take: 20,
    });
  }

  const nearestYears = Array.from(
    new Set(rows.map((row) => row.referenceYear))
  )
    .sort(
      (left, right) =>
        Math.abs(left - input.year) - Math.abs(right - input.year)
    )
    .slice(0, 2);

  rows = rows.filter((row) => nearestYears.includes(row.referenceYear));

  return rows
    .map((row) => {
      const quality = row.quality as ArveMarketReferenceItem["quality"];
      const qualityWeight = marketQualityWeight(quality);
      const modelSimilarity =
        row.modelNormalized === modelNormalized
          ? 1
          : tokenSimilarity(input.model, row.model);
      const fuelScore =
        row.fuelNormalized === fuelNormalized ? 1 : exactFuel ? 0 : 0.32;

      const similarityScore =
        modelSimilarity * 0.38 +
        yearScore(input.year, row.referenceYear) * 0.27 +
        mileageScore(input.mileageKm, row.kmMin, row.kmMax) * 0.18 +
        trimScore(input.trimLevel, row.trimLevel) * 0.09 +
        fuelScore * 0.08;

      const rankingScore =
        similarityScore * 0.62 +
        qualityWeight * 0.32 +
        fuelScore * 0.06;

      return {
        id: row.id,
        make: row.make,
        model: row.model,
        trimLevel: row.trimLevel,
        fuelType: row.fuelType,
        referenceYear: row.referenceYear,
        kmMin: row.kmMin,
        kmMax: row.kmMax,
        priceMin: row.priceMin,
        priceMax: row.priceMax,
        priceMid: Math.round((row.priceMin + row.priceMax) / 2),
        quality,
        qualityWeight,
        qualityNote: row.qualityNote,
        similarityScore: Number(similarityScore.toFixed(4)),
        rankingScore: Number(rankingScore.toFixed(4)),
        sourceVersion: row.sourceVersion,
      } satisfies ArveMarketReferenceItem;
    })
    .filter((row) => row.similarityScore >= 0.28)
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, limit);
}
