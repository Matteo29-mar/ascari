import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY non definita");
}

export const stripe = new Stripe(stripeSecretKey);

export const ASCARI_FEE_PERCENT = Number(process.env.ASCARI_FEE_PERCENT || 10);

export function computeAscariFee(salePriceEur: number) {
  const safePrice = Math.max(0, Math.trunc(Number(salePriceEur) || 0));
  const ascariFeeEur = Math.round((safePrice * ASCARI_FEE_PERCENT) / 100);
  const sellerNetEur = Math.max(safePrice - ascariFeeEur, 0);

  return {
    salePriceEur: safePrice,
    ascariFeeEur,
    sellerNetEur,
  };
}

export function buildFrontendUrl(pathname: string) {
  const base =
    process.env.FRONTEND_URL ||
    process.env.CORS_ORIGIN ||
    "http://localhost:5173";

  return `${base.replace(/\/+$/, "")}${
    pathname.startsWith("/") ? pathname : `/${pathname}`
  }`;
}