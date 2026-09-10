export type ArveRecommendation = "LOWER" | "RAISE" | "KEEP";

export type ArveSourceType =
  | "OPENAI_HYBRID_DATASET"
  | "OPENAI_MARKET_REFERENCE"
  | "OPENAI_PRIVATE_DATASET"
  | "OPENAI_NO_PRIVATE_MATCHES"
  | "HYBRID_FALLBACK"
  | "MARKET_REFERENCE_FALLBACK"
  | "PRIVATE_DATASET_FALLBACK"
  | "LOCAL_FALLBACK";

export type ArveUserDecision = "PENDING" | "ACCEPTED" | "REJECTED";

export type ArvePricingInput = {
  carId: number;
  title: string;
  make: string;
  model: string;
  year: number;
  mileageKm: number | null;
  fuelType: string;
  transmission: string;
  horsepower: number | null;
  engine: string | null;
  trimLevel: string | null;
  color: string | null;
  drivetrain: string | null;
  city: string;
  isPeriziata: boolean;
  priceEur: number | null;
  originalOfferPrice1: number;
  originalOfferPrice2: number;
  originalOfferPrice3: number;
  coverUrl: string | null;
};

export type ArveComparableItem = {
  carId: number;
  title: string;
  make: string;
  model: string;
  year: number;
  mileageKm: number | null;
  fuelType: string;
  transmission: string;
  horsepower: number | null;
  city: string;
  isPeriziata: boolean;
  observedPriceEur: number;
  evidenceType:
    | "REAL_SALE"
    | "OFFER_ACCEPTED"
    | "ACTIVE_LISTING";
  evidenceWeight: number;
  similarityScore: number;
  rankingScore: number;
  soldAt: string | null;
  daysToSell: number | null;
};

export type ArveMarketReferenceItem = {
  id: number;
  make: string;
  model: string;
  trimLevel: string | null;
  fuelType: string;
  referenceYear: number;
  kmMin: number | null;
  kmMax: number | null;
  priceMin: number;
  priceMax: number;
  priceMid: number;
  quality: "VERIFIED" | "AGGREGATED" | "MODEL_ESTIMATE" | "TO_VALIDATE";
  qualityWeight: number;
  qualityNote: string | null;
  similarityScore: number;
  rankingScore: number;
  sourceVersion: string;
};

export type ArvePricingResult = {
  quickSalePrice: number;
  reservePrice: number;
  democraticPrice: number;
  marketMin: number;
  marketMax: number;
  marketMedian: number;
  recommendation: ArveRecommendation;
  message: string;
  confidence: number;
  evidenceLevel: number;
  privateMatchesCount: number;
  marketReferenceMatchesCount: number;
  marketReferenceQuality: number;
  marketReferenceMedian: number | null;
  sourceType: ArveSourceType;
  modelUsed: string | null;
  promptVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  comparableItems: ArveComparableItem[];
  marketReferenceItems: ArveMarketReferenceItem[];
  rawResponseJson: Record<string, unknown> | null;
};
