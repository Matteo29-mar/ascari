import {
  ArveComparableItem,
  ArveMarketReferenceItem,
  ArvePricingInput,
  ArvePricingResult,
} from "../../types/arvePricing";
import { summarizeMarketReferences } from "./marketReferenceService";

function roundToNearest50(value: number): number {
  return Math.max(50, Math.round(value / 50) * 50);
}

function weightedMedianPrivate(items: ArveComparableItem[]): number | null {
  if (!items.length) return null;

  const rows = items
    .map((item) => ({
      price: item.observedPriceEur,
      weight: Math.max(
        0.01,
        item.evidenceWeight * Math.max(0.15, item.similarityScore)
      ),
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

function privateStrength(items: ArveComparableItem[]): number {
  const score = items.reduce(
    (sum, item) => sum + item.evidenceWeight * item.similarityScore,
    0
  );
  return Math.min(0.78, score / 4);
}

function marketStrength(items: ArveMarketReferenceItem[]): number {
  const score = items.reduce(
    (sum, item) => sum + item.qualityWeight * item.similarityScore,
    0
  );
  return Math.min(0.78, score / 2.6);
}

function sourceTypeFor(
  hasPrivate: boolean,
  hasMarket: boolean
): ArvePricingResult["sourceType"] {
  if (hasPrivate && hasMarket) return "HYBRID_FALLBACK";
  if (hasMarket) return "MARKET_REFERENCE_FALLBACK";
  if (hasPrivate) return "PRIVATE_DATASET_FALLBACK";
  return "LOCAL_FALLBACK";
}

export function localFallbackAnalysis(
  input: ArvePricingInput,
  privateMatches: ArveComparableItem[],
  marketReferences: ArveMarketReferenceItem[],
  reason?: string
): ArvePricingResult {
  const originalReference = getOriginalReference(input);
  const privateMedian = weightedMedianPrivate(privateMatches);
  const marketSummary = summarizeMarketReferences(marketReferences);
  const marketMedian = marketSummary.median;

  const pStrength = privateMedian ? privateStrength(privateMatches) : 0;
  const mStrength = marketMedian ? marketStrength(marketReferences) : 0;
  const sourceStrength = pStrength + mStrength;

  let basePrice = originalReference;
  if (privateMedian && marketMedian && sourceStrength > 0) {
    basePrice =
      (privateMedian * pStrength + marketMedian * mStrength) / sourceStrength;
  } else if (privateMedian) {
    basePrice = privateMedian;
  } else if (marketMedian) {
    basePrice = marketMedian;
  }

  const inspectionFactor = input.isPeriziata ? 1.015 : 1;
  const democraticPrice = roundToNearest50(basePrice * inspectionFactor);
  const reservePrice = roundToNearest50(democraticPrice * 0.92);
  const quickSalePrice = roundToNearest50(democraticPrice * 0.84);

  const privatePrices = privateMatches.map((item) => item.observedPriceEur);
  const referenceMins = marketReferences.map((item) => item.priceMin);
  const referenceMaxs = marketReferences.map((item) => item.priceMax);

  const lowCandidates = [
    ...(privatePrices.length ? [percentile(privatePrices, 0.2)] : []),
    ...(referenceMins.length ? [percentile(referenceMins, 0.35)] : []),
  ];
  const highCandidates = [
    ...(privatePrices.length ? [percentile(privatePrices, 0.8)] : []),
    ...(referenceMaxs.length ? [percentile(referenceMaxs, 0.65)] : []),
  ];

  const marketMin = roundToNearest50(
    lowCandidates.length
      ? Math.min(...lowCandidates)
      : quickSalePrice * 0.95
  );
  const marketMax = roundToNearest50(
    highCandidates.length
      ? Math.max(...highCandidates)
      : democraticPrice * 1.08
  );

  const realSales = privateMatches.filter(
    (item) => item.evidenceType === "REAL_SALE"
  ).length;
  const acceptedOffers = privateMatches.filter(
    (item) => item.evidenceType === "OFFER_ACCEPTED"
  ).length;
  const verifiedRefs = marketReferences.filter(
    (item) => item.quality === "VERIFIED"
  ).length;

  const confidence = Math.min(
    0.9,
    0.18 +
      privateMatches.length * 0.015 +
      realSales * 0.09 +
      acceptedOffers * 0.035 +
      verifiedRefs * 0.055 +
      marketSummary.quality * 0.18
  );

  const evidenceLevel =
    realSales >= 3
      ? 4
      : realSales >= 1 || verifiedRefs >= 2
        ? 3
        : privateMatches.length >= 3 || marketReferences.length >= 2
          ? 2
          : 1;

  const sourceType = sourceTypeFor(
    privateMatches.length > 0,
    marketReferences.length > 0
  );

  const pieces: string[] = [];
  if (marketReferences.length) {
    pieces.push(
      `base prezzi ARVE (${marketReferences.length} riferimenti Excel, qualità ${Math.round(
        marketSummary.quality * 100
      )}%)`
    );
  }
  if (privateMatches.length) {
    pieces.push(
      `${privateMatches.length} comparabili ASCARI, con priorità a vendite e offerte accettate`
    );
  }

  const message = pieces.length
    ? `ARVE ha stimato il valore combinando ${pieces.join(
        " e "
      )}. Le previsioni ARVE precedenti non vengono trattate come vendite reali.${
        reason ? ` Motivo fallback AI: ${reason}.` : ""
      }`
    : `ARVE non dispone ancora di riferimenti di mercato sufficienti: la stima parte dai tre prezzi inseriti e verrà affinata importando il foglio prezzi e raccogliendo dati reali ASCARI.${
        reason ? ` Motivo fallback AI: ${reason}.` : ""
      }`;

  return {
    quickSalePrice,
    reservePrice: Math.max(reservePrice, quickSalePrice + 50),
    democraticPrice: Math.max(democraticPrice, reservePrice + 50),
    marketMin: Math.min(marketMin, quickSalePrice),
    marketMax: Math.max(marketMax, democraticPrice),
    marketMedian: roundToNearest50(basePrice),
    recommendation: recommendationFor(originalReference, democraticPrice),
    message,
    confidence,
    evidenceLevel,
    privateMatchesCount: privateMatches.length,
    marketReferenceMatchesCount: marketReferences.length,
    marketReferenceQuality: marketSummary.quality,
    marketReferenceMedian: marketSummary.median,
    sourceType,
    modelUsed: null,
    promptVersion: process.env.ARVE_PROMPT_VERSION || "ascari-arve-v2",
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    comparableItems: privateMatches,
    marketReferenceItems: marketReferences,
    rawResponseJson: reason ? { fallbackReason: reason } : null,
  };
}
