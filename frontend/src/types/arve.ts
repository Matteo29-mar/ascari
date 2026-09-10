export type ArveRecommendation = 'LOWER' | 'RAISE' | 'KEEP';

export type ArveSourceType =
  | 'OPENAI_HYBRID_DATASET'
  | 'OPENAI_MARKET_REFERENCE'
  | 'OPENAI_PRIVATE_DATASET'
  | 'OPENAI_NO_PRIVATE_MATCHES'
  | 'HYBRID_FALLBACK'
  | 'MARKET_REFERENCE_FALLBACK'
  | 'PRIVATE_DATASET_FALLBACK'
  | 'LOCAL_FALLBACK';

export type ArveComparableItem = {
  carId: number;
  title: string;
  make: string;
  model: string;
  year: number;
  mileageKm: number | null;
  observedPriceEur: number;
  evidenceType: string;
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
  quality: 'VERIFIED' | 'AGGREGATED' | 'MODEL_ESTIMATE' | 'TO_VALIDATE';
  qualityWeight: number;
  qualityNote: string | null;
  similarityScore: number;
  rankingScore: number;
  sourceVersion: string;
};

export type ArvePricingAnalysis = {
  ok?: boolean;
  analysisId: number | null;
  carId: number;
  originalOfferPrice1: number;
  originalOfferPrice2: number;
  originalOfferPrice3: number;
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
  fallbackUsed?: boolean;
};

export type ArveDecisionResponse = {
  ok: boolean;
  decision: 'ACCEPTED' | 'REJECTED';
  car: {
    id: number;
    offerPrice1: number;
    offerPrice2: number;
    offerPrice3: number;
  };
};
