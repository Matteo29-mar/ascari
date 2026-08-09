import {
  ArveComparableItem,
  ArvePricingInput,
  ArvePricingResult,
} from "../../types/arvePricing";

function roundToNearest50(value: number): number {
  return Math.max(50, Math.round(value / 50) * 50);
}

function weightedMedian(items: ArveComparableItem[]): number | null {
  if (!items.length) return null;

  const rows = items
    .map((item) => ({
      price: item.observedPriceEur,
      weight: Math.max(0.01, item.evidenceWeight * Math.max(0.15, item.similarityScore)),
    }))
    .filter((item) => Number.isFinite(item.price) && item.price > 0)
    .sort((a, b) => a.price - b.price);

  if (!rows.length) return null;

  const totalWeight = rows.reduce((sum, item) => sum + item.weight, 0);
  let cumulative = 0;

  for (const item of rows) {
    cumulative += item.weight;
    if (cumulative >= totalWeight / 2) return item.price;
  }

  return rows[rows.length - 1].price;
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * fraction))
  );
  return sorted[index];
}

function getOriginalReference(input: ArvePricingInput): number {
  const original = [
    input.originalOfferPrice1,
    input.originalOfferPrice2,
    input.originalOfferPrice3,
  ]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  return input.priceEur && input.priceEur > 0
    ? input.priceEur
    : original[Math.floor(original.length / 2)] || 1;
}

function recommendationFor(reference: number, suggested: number) {
  const difference = (suggested - reference) / Math.max(1, reference);
  if (difference > 0.08) return "RAISE" as const;
  if (difference < -0.08) return "LOWER" as const;
  return "KEEP" as const;
}

export function localFallbackAnalysis(
  input: ArvePricingInput,
  privateMatches: ArveComparableItem[],
  reason?: string
): ArvePricingResult {
  const originalReference = getOriginalReference(input);
  const datasetMedian = weightedMedian(privateMatches);
  const basePrice = datasetMedian ?? originalReference;

  const inspectionFactor = input.isPeriziata ? 1.015 : 1;
  const democraticPrice = roundToNearest50(basePrice * inspectionFactor);
  const reservePrice = roundToNearest50(democraticPrice * 0.92);
  const quickSalePrice = roundToNearest50(democraticPrice * 0.84);

  const comparablePrices = privateMatches.map((item) => item.observedPriceEur);
  const marketMin = roundToNearest50(
    comparablePrices.length ? percentile(comparablePrices, 0.2) : quickSalePrice * 0.95
  );
  const marketMax = roundToNearest50(
    comparablePrices.length ? percentile(comparablePrices, 0.8) : democraticPrice * 1.08
  );

  const realSales = privateMatches.filter(
    (item) => item.evidenceType === "REAL_SALE"
  ).length;

  const confidence = Math.min(
    0.78,
    0.24 + privateMatches.length * 0.035 + realSales * 0.06
  );

  const evidenceLevel =
    realSales >= 3 ? 4 : realSales >= 1 ? 3 : privateMatches.length >= 4 ? 2 : 1;

  const sourceType = privateMatches.length
    ? "PRIVATE_DATASET_FALLBACK"
    : "LOCAL_FALLBACK";

  const message = privateMatches.length
    ? `ARVE ha stimato i prezzi usando ${privateMatches.length} auto comparabili presenti nel dataset Ascari. La stima è prudente e dà più peso alle vendite realmente concluse.${
        reason ? ` Motivo fallback AI: ${reason}.` : ""
      }`
    : `ARVE non ha ancora abbastanza auto comparabili nel dataset. La prima stima parte dai prezzi inseriti e verrà resa più precisa dalle future vendite reali.${
        reason ? ` Motivo fallback AI: ${reason}.` : ""
      }`;

  return {
    quickSalePrice,
    reservePrice: Math.max(reservePrice, quickSalePrice + 50),
    democraticPrice: Math.max(democraticPrice, reservePrice + 50),
    marketMin: Math.min(marketMin, quickSalePrice),
    marketMax: Math.max(marketMax, democraticPrice),
    marketMedian: democraticPrice,
    recommendation: recommendationFor(originalReference, democraticPrice),
    message,
    confidence,
    evidenceLevel,
    privateMatchesCount: privateMatches.length,
    sourceType,
    modelUsed: null,
    promptVersion: process.env.ARVE_PROMPT_VERSION || "ascari-arve-v1",
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    comparableItems: privateMatches,
    rawResponseJson: reason ? { fallbackReason: reason } : null,
  };
}
