import { PrismaClient } from "@prisma/client";
import {
  ArvePricingInput,
  ArvePricingResult,
} from "../../types/arvePricing";
import { normalizeAndValidateArveResult } from "./arvePricingValidator";
import { localFallbackAnalysis } from "./localPricingFallback";
import { analyzeWithOpenAI } from "./openAiPricingService";
import { findPrivateDatasetMatches } from "./privateDatasetService";

export function buildArvePricingInputFromCar(car: any): ArvePricingInput {
  return {
    carId: car.id,
    title: car.title,
    make: car.make,
    model: car.model,
    year: car.year,
    mileageKm: car.mileageKm ?? null,
    fuelType: car.fuelType,
    transmission: car.transmission,
    horsepower: car.horsepower ?? null,
    engine: car.engine ?? null,
    trimLevel: car.trimLevel ?? null,
    color: car.color ?? null,
    drivetrain: car.drivetrain ?? null,
    city: car.city,
    isPeriziata: Boolean(car.isPeriziata),
    priceEur: car.priceEur ?? null,
    originalOfferPrice1: car.offerPrice1,
    originalOfferPrice2: car.offerPrice2,
    originalOfferPrice3: car.offerPrice3,
    coverUrl: car.coverUrl ?? car.photos?.[0] ?? null,
  };
}

function errorReason(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error || "Errore sconosciuto").slice(0, 500);
}

async function persistAnalysis(
  prisma: PrismaClient,
  input: ArvePricingInput,
  result: ArvePricingResult,
  analysisError: string | null
) {
  const data = {
    originalOfferPrice1: input.originalOfferPrice1,
    originalOfferPrice2: input.originalOfferPrice2,
    originalOfferPrice3: input.originalOfferPrice3,
    quickSalePrice: result.quickSalePrice,
    reservePrice: result.reservePrice,
    democraticPrice: result.democraticPrice,
    marketMin: result.marketMin,
    marketMax: result.marketMax,
    marketMedian: result.marketMedian,
    recommendation: result.recommendation,
    message: result.message,
    confidence: result.confidence,
    evidenceLevel: result.evidenceLevel,
    comparableItems: result.comparableItems as any,
    privateMatchesCount: result.privateMatchesCount,
    sourceType: result.sourceType,
    modelUsed: result.modelUsed,
    promptVersion: result.promptVersion,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    totalTokens: result.totalTokens,
    rawResponseJson: result.rawResponseJson
      ? (result.rawResponseJson as any)
      : undefined,
    analysisError,
    userDecision: "PENDING",
    appliedOfferPrice1: null,
    appliedOfferPrice2: null,
    appliedOfferPrice3: null,
    decidedAt: null,
  };

  return prisma.arvePricingAnalysis.upsert({
    where: { carId: input.carId },
    create: {
      carId: input.carId,
      ...data,
    },
    update: data,
  });
}

export async function analyzeHybridPrice(
  prisma: PrismaClient,
  input: ArvePricingInput
): Promise<ArvePricingResult> {
  const privateMatches = await findPrivateDatasetMatches(
    prisma,
    input,
    input.carId
  );

  let result: ArvePricingResult;
  let analysisError: string | null = null;

  const arveEnabled =
    String(process.env.ARVE_ENABLED || "true").toLowerCase() !== "false";

  if (!arveEnabled) {
    analysisError = "ARVE disabilitato da configurazione";
    result = localFallbackAnalysis(input, privateMatches, analysisError);
  } else {
    try {
      result = await analyzeWithOpenAI({ input, privateMatches });
      result = normalizeAndValidateArveResult(input, result);
    } catch (error) {
      analysisError = errorReason(error);
      console.error(
        `[ARVE] carId=${input.carId} OpenAI non disponibile, uso fallback:`,
        analysisError
      );
      result = normalizeAndValidateArveResult(
        input,
        localFallbackAnalysis(input, privateMatches, analysisError)
      );
    }
  }

  await persistAnalysis(prisma, input, result, analysisError);

  console.log(
    `[ARVE] carId=${input.carId} source=${result.sourceType} matches=${result.privateMatchesCount} model=${result.modelUsed || "local"} tokens=${result.totalTokens ?? 0} confidence=${result.confidence.toFixed(2)}`
  );

  return result;
}
