import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  ArveComparableItem,
  ArvePricingInput,
  ArvePricingResult,
} from "../../types/arvePricing";

const arveResponseSchema = z.object({
  quickSalePrice: z.number().positive(),
  reservePrice: z.number().positive(),
  democraticPrice: z.number().positive(),
  marketMin: z.number().positive(),
  marketMax: z.number().positive(),
  marketMedian: z.number().positive(),
  recommendation: z.enum(["LOWER", "RAISE", "KEEP"]),
  message: z.string().min(20).max(900),
  confidence: z.number().min(0).max(1),
  evidenceLevel: z.number().int().min(1).max(4),
});

type OpenAiArveParsed = {
  quickSalePrice: number;
  reservePrice: number;
  democraticPrice: number;
  marketMin: number;
  marketMax: number;
  marketMedian: number;
  recommendation: "LOWER" | "RAISE" | "KEEP";
  message: string;
  confidence: number;
  evidenceLevel: number;
};

function compactComparable(item: ArveComparableItem) {
  return {
    carId: item.carId,
    make: item.make,
    model: item.model,
    year: item.year,
    mileageKm: item.mileageKm,
    fuelType: item.fuelType,
    transmission: item.transmission,
    horsepower: item.horsepower,
    city: item.city,
    isPeriziata: item.isPeriziata,
    observedPriceEur: item.observedPriceEur,
    evidenceType: item.evidenceType,
    evidenceWeight: item.evidenceWeight,
    similarityScore: item.similarityScore,
    daysToSell: item.daysToSell,
  };
}

function buildProductPayload(input: ArvePricingInput) {
  return {
    carId: input.carId,
    title: input.title,
    make: input.make,
    model: input.model,
    year: input.year,
    mileageKm: input.mileageKm,
    fuelType: input.fuelType,
    transmission: input.transmission,
    horsepower: input.horsepower,
    engine: input.engine,
    trimLevel: input.trimLevel,
    color: input.color,
    drivetrain: input.drivetrain,
    city: input.city,
    isPeriziata: input.isPeriziata,
    publishedPriceEur: input.priceEur,
    originalOfferPricesEur: [
      input.originalOfferPrice1,
      input.originalOfferPrice2,
      input.originalOfferPrice3,
    ],
  };
}

export async function analyzeWithOpenAI(params: {
  input: ArvePricingInput;
  privateMatches: ArveComparableItem[];
}): Promise<ArvePricingResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurata");
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
  const promptVersion = process.env.ARVE_PROMPT_VERSION || "ascari-arve-v1";
  const timeoutMs = Math.max(
    5_000,
    Number(process.env.ARVE_ANALYSIS_TIMEOUT_MS || 25_000)
  );
  const visionEnabled =
    String(process.env.OPENAI_VISION_ENABLED || "true").toLowerCase() !== "false";

  const client = new OpenAI({ apiKey });

  const content: any[] = [
    {
      type: "input_text",
      text: JSON.stringify(
        {
          currency: "EUR",
          product: buildProductPayload(params.input),
          privateComparables: params.privateMatches.map(compactComparable),
          promptVersion,
        },
        null,
        2
      ),
    },
  ];

  if (
    visionEnabled &&
    params.input.coverUrl &&
    /^https?:\/\//i.test(params.input.coverUrl)
  ) {
    content.push({
      type: "input_image",
      image_url: params.input.coverUrl,
      detail: "low",
    });
  }

  const response = await client.responses.parse(
    {
      model,
      instructions: [
        "Sei ARVE, Automotive Real Value Engine di Ascari.",
        "Devi stimare tre prezzi in euro per un'auto usata: quickSalePrice è il prezzo più basso per vendita rapida; reservePrice è il minimo prudente per il venditore; democraticPrice è il prezzo equilibrato e competitivo.",
        "Usa esclusivamente i dati dell'auto e i comparabili forniti. Non dichiarare di aver consultato siti, annunci o database esterni.",
        "Una vendita reale (REAL_SALE) è la prova più affidabile. Un suggerimento ARVE accettato è meno affidabile; una stima non accettata o pendente ha peso basso.",
        "Correggi mentalmente le differenze di anno, chilometri, alimentazione, cambio, potenza, allestimento, città e presenza di perizia.",
        "Mantieni sempre quickSalePrice < reservePrice < democraticPrice e marketMin <= quickSalePrice <= democraticPrice <= marketMax.",
        "La motivazione deve essere breve, trasparente, comprensibile e non deve promettere certezza di vendita.",
      ].join("\n"),
      input: [
        {
          role: "user",
          content,
        },
      ],
      text: {
        format: zodTextFormat(arveResponseSchema, "ascari_arve_pricing"),
      },
      max_output_tokens: 3000,
    } as any,
    { timeout: timeoutMs }
  );

  const parsed = response.output_parsed as OpenAiArveParsed | null;
  if (!parsed) {
    throw new Error("OpenAI non ha restituito un output ARVE strutturato");
  }

  const usage = response.usage as any;

  return {
    ...parsed,
    privateMatchesCount: params.privateMatches.length,
    sourceType: params.privateMatches.length
      ? "OPENAI_PRIVATE_DATASET"
      : "OPENAI_NO_PRIVATE_MATCHES",
    modelUsed: model,
    promptVersion,
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
    comparableItems: params.privateMatches,
    rawResponseJson: {
      responseId: response.id,
      status: response.status,
      parsed,
    },
  };
}
