export type ArveRecommendation = 'LOWER' | 'RAISE' | 'KEEP';

export type ArveSourceType =
  | 'OPENAI_PRIVATE_DATASET'
  | 'OPENAI_NO_PRIVATE_MATCHES'
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

export type ArvePricingAnalysis = {
  ok?: boolean;
  analysisId: number | null;
  carId: number;
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
  sourceType: ArveSourceType;
  modelUsed: string | null;
  promptVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  comparableItems: ArveComparableItem[];
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
