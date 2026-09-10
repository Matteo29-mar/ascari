export type DealerPlanCode = "STARTER" | "ADVANCED";

export type DealerPlanDefinition = {
  code: DealerPlanCode;
  name: string;
  monthlyPriceEur: number;
  maxActiveCars: number | null;
  maxDevices: number;
  statsEnabled: boolean;
  stripePriceId: string | null;
  features: string[];
};

export function getDealerPlans(): Record<DealerPlanCode, DealerPlanDefinition> {
  return {
    STARTER: {
      code: "STARTER",
      name: "Starter",
      monthlyPriceEur: 50,
      maxActiveCars: null,
      maxDevices: 10,
      statsEnabled: false,
      stripePriceId: process.env.STRIPE_DEALER_STARTER_PRICE_ID || null,
      features: [
        "Auto in vendita illimitate",
        "Fino a 10 dispositivi collegati",
        "Garage concessionaria pubblico",
      ],
    },
    ADVANCED: {
      code: "ADVANCED",
      name: "Advanced",
      monthlyPriceEur: 125,
      maxActiveCars: null,
      maxDevices: 20,
      statsEnabled: true,
      stripePriceId: process.env.STRIPE_DEALER_ADVANCED_PRICE_ID || null,
      features: [
        "Auto in vendita illimitate",
        "Fino a 20 dispositivi collegati",
        "Statistiche per ogni auto",
        "Garage concessionaria pubblico",
      ],
    },
  };
}

export function isDealerPlanCode(value: unknown): value is DealerPlanCode {
  return value === "STARTER" || value === "ADVANCED";
}

export function isPaidDealerPlan(plan: unknown): plan is DealerPlanCode {
  return plan === "STARTER" || plan === "ADVANCED";
}

export function getPlanByStripePriceId(priceId?: string | null): DealerPlanCode | null {
  if (!priceId) return null;
  const plans = getDealerPlans();
  if (plans.STARTER.stripePriceId === priceId) return "STARTER";
  if (plans.ADVANCED.stripePriceId === priceId) return "ADVANCED";
  return null;
}

export function getPublicDealerPlans() {
  const plans = getDealerPlans();
  return (Object.keys(plans) as DealerPlanCode[]).map((code) => ({
    code: plans[code].code,
    name: plans[code].name,
    monthlyPriceEur: plans[code].monthlyPriceEur,
    maxActiveCars: plans[code].maxActiveCars,
    maxDevices: plans[code].maxDevices,
    statsEnabled: plans[code].statsEnabled,
    features: plans[code].features,
  }));
}
