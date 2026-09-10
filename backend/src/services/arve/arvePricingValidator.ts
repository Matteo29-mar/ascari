import { ArvePricingInput, ArvePricingResult } from "../../types/arvePricing";

function roundToNearest50(value: number): number {
  return Math.max(50, Math.round(value / 50) * 50);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeAndValidateArveResult(
  input: ArvePricingInput,
  result: ArvePricingResult
): ArvePricingResult {
  const originalPrices = [
    input.originalOfferPrice1,
    input.originalOfferPrice2,
    input.originalOfferPrice3,
  ]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const originalReference =
    input.priceEur && input.priceEur > 0
      ? input.priceEur
      : originalPrices[Math.floor(originalPrices.length / 2)] || 1;

  const hardMin = Math.max(500, originalReference * 0.35);
  const hardMax = Math.max(hardMin + 100, originalReference * 2.5);

  let quickSalePrice = roundToNearest50(
    clamp(Number(result.quickSalePrice), hardMin, hardMax)
  );
  let reservePrice = roundToNearest50(
    clamp(Number(result.reservePrice), hardMin, hardMax)
  );
  let democraticPrice = roundToNearest50(
    clamp(Number(result.democraticPrice), hardMin, hardMax)
  );

  const ordered = [quickSalePrice, reservePrice, democraticPrice].sort(
    (a, b) => a - b
  );

  quickSalePrice = ordered[0];
  reservePrice = Math.max(ordered[1], quickSalePrice + 50);
  democraticPrice = Math.max(ordered[2], reservePrice + 50);

  let marketMin = roundToNearest50(
    Number.isFinite(Number(result.marketMin))
      ? Number(result.marketMin)
      : quickSalePrice
  );
  let marketMax = roundToNearest50(
    Number.isFinite(Number(result.marketMax))
      ? Number(result.marketMax)
      : democraticPrice
  );
  let marketMedian = roundToNearest50(
    Number.isFinite(Number(result.marketMedian))
      ? Number(result.marketMedian)
      : democraticPrice
  );

  marketMin = Math.min(marketMin, quickSalePrice);
  marketMax = Math.max(marketMax, democraticPrice);
  marketMedian = clamp(marketMedian, marketMin, marketMax);

  const confidence = clamp(Number(result.confidence) || 0, 0, 1);
  const evidenceLevel = Math.round(
    clamp(Number(result.evidenceLevel) || 1, 1, 4)
  );

  if (
    !Number.isFinite(quickSalePrice) ||
    !Number.isFinite(reservePrice) ||
    !Number.isFinite(democraticPrice) ||
    quickSalePrice <= 0 ||
    reservePrice <= quickSalePrice ||
    democraticPrice <= reservePrice
  ) {
    throw new Error("ARVE ha restituito una struttura prezzi non valida");
  }

  return {
    ...result,
    quickSalePrice,
    reservePrice,
    democraticPrice,
    marketMin,
    marketMax,
    marketMedian,
    confidence,
    evidenceLevel,
    message: String(result.message || "").trim().slice(0, 900),
  };
}
