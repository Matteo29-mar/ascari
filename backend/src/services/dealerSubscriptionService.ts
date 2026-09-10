import Stripe from "stripe";
import { prisma } from "../prisma";
import {
  DealerPlanCode,
  getDealerPlans,
  getPlanByStripePriceId,
} from "../config/dealerPlans";

type DealerSubscriptionStatusCode =
  | "INACTIVE"
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "UNPAID"
  | "CANCELED"
  | "PAUSED";

const ACCESS_STATUSES = new Set<DealerSubscriptionStatusCode>([
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
]);

function toDate(seconds?: number | null) {
  if (!seconds) return null;
  return new Date(seconds * 1000);
}

function mapStripeSubscriptionStatus(
  status: Stripe.Subscription["status"]
): DealerSubscriptionStatusCode {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "canceled":
      return "CANCELED";
    case "incomplete":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "INCOMPLETE_EXPIRED";
    case "paused":
      return "PAUSED";
    default:
      return "INCOMPLETE";
  }
}

function effectivePlanFromRecord(record: {
  plan: DealerPlanCode;
  status: DealerSubscriptionStatusCode;
}): DealerPlanCode | null {
  if (!ACCESS_STATUSES.has(record.status)) return null;
  return record.plan;
}

export async function getDealerByUserId(userId: string) {
  return prisma.dealerProfile.findUnique({
    where: { userId },
    include: {
      subscription: true,
      user: {
        select: {
          id: true,
          clerkId: true,
          email: true,
          name: true,
          stripeAccountId: true,
        },
      },
    },
  });
}

export async function ensureDealerSubscription(userId: string) {
  const dealer = await getDealerByUserId(userId);
  if (!dealer) {
    const error: any = new Error("Profilo concessionario non trovato");
    error.status = 403;
    throw error;
  }

  if (dealer.subscription) {
    return { dealer, subscription: dealer.subscription };
  }

  const subscription = await prisma.dealerSubscription.create({
    data: {
      dealerProfileId: dealer.id,
      plan: "STARTER",
      status: "INACTIVE",
    },
  });

  return {
    dealer: { ...dealer, subscription },
    subscription,
  };
}

export async function reconcileDealerListings(
  userId: string,
  plan: DealerPlanCode | null
) {
  const listings = await prisma.car.findMany({
    where: {
      ownerId: userId,
      marketStatus: "AVAILABLE",
      paymentStatus: { not: "SOLD" },
      soldAt: null,
      visuallyRemovedAt: null,
    },
    select: {
      id: true,
      dealerPlanSuspended: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  // Senza abbonamento attivo la vetrina dealer rimane sospesa.
  const activeIds = plan ? listings.map((item) => item.id) : [];
  const suspendedIds = plan ? [] : listings.map((item) => item.id);

  if (activeIds.length > 0) {
    await prisma.car.updateMany({
      where: {
        id: { in: activeIds },
        dealerPlanSuspended: true,
      },
      data: {
        dealerPlanSuspended: false,
        dealerPlanSuspendedAt: null,
      },
    });
  }

  if (suspendedIds.length > 0) {
    await prisma.car.updateMany({
      where: {
        id: { in: suspendedIds },
        dealerPlanSuspended: false,
      },
      data: {
        dealerPlanSuspended: true,
        dealerPlanSuspendedAt: new Date(),
      },
    });
  }

  return {
    totalListings: listings.length,
    activeListings: activeIds.length,
    suspendedListings: suspendedIds.length,
  };
}

export async function getDealerPlanState(
  userId: string,
  options?: { reconcile?: boolean }
) {
  const { dealer, subscription } = await ensureDealerSubscription(userId);
  const effectivePlan = effectivePlanFromRecord({
    plan: subscription.plan as DealerPlanCode,
    status: subscription.status as DealerSubscriptionStatusCode,
  });

  if (options?.reconcile !== false) {
    await reconcileDealerListings(userId, effectivePlan);
  }

  const [activeCars, suspendedCars, totalCars, activeDevices] = await Promise.all([
    prisma.car.count({
      where: {
        ownerId: userId,
        marketStatus: "AVAILABLE",
        paymentStatus: { not: "SOLD" },
        soldAt: null,
        visuallyRemovedAt: null,
        dealerPlanSuspended: false,
      },
    }),
    prisma.car.count({
      where: {
        ownerId: userId,
        marketStatus: "AVAILABLE",
        paymentStatus: { not: "SOLD" },
        soldAt: null,
        visuallyRemovedAt: null,
        dealerPlanSuspended: true,
      },
    }),
    prisma.car.count({
      where: {
        ownerId: userId,
        marketStatus: "AVAILABLE",
        paymentStatus: { not: "SOLD" },
        soldAt: null,
        visuallyRemovedAt: null,
      },
    }),
    prisma.dealerDevice.count({
      where: {
        dealerProfileId: dealer.id,
        revokedAt: null,
      },
    }),
  ]);

  const definition = effectivePlan ? getDealerPlans()[effectivePlan] : null;

  return {
    dealer,
    subscription,
    plan: effectivePlan,
    billingPlan: subscription.plan as DealerPlanCode,
    status: subscription.status as DealerSubscriptionStatusCode,
    subscriptionRequired: effectivePlan === null,
    maxActiveCars: definition?.maxActiveCars ?? 0,
    maxDevices: definition?.maxDevices ?? 0,
    statsEnabled: definition?.statsEnabled ?? false,
    activeCars,
    suspendedCars,
    totalCars,
    activeDevices,
    remainingDevices: definition
      ? Math.max(definition.maxDevices - activeDevices, 0)
      : 0,
    remainingSlots: definition ? null : 0,
  };
}

export async function checkDealerCarCreationLimit(userId: string) {
  const dealer = await prisma.dealerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!dealer) {
    return {
      isDealer: false,
      allowed: true,
      plan: null,
      limit: null,
      used: null,
      remaining: null,
      subscriptionRequired: false,
    };
  }

  const state = await getDealerPlanState(userId);
  return {
    isDealer: true,
    allowed: !!state.plan,
    plan: state.plan,
    limit: null,
    used: state.activeCars,
    remaining: null,
    subscriptionRequired: state.subscriptionRequired,
  };
}

export async function registerDealerDevice(params: {
  userId: string;
  deviceId: string;
  label?: string | null;
  userAgent?: string | null;
}) {
  const deviceId = String(params.deviceId || "").trim();
  if (deviceId.length < 8 || deviceId.length > 200) {
    const error: any = new Error("Identificativo dispositivo non valido");
    error.status = 400;
    throw error;
  }

  const state = await getDealerPlanState(params.userId, { reconcile: false });
  if (!state.plan) {
    const error: any = new Error(
      "Scegli e attiva STARTER o ADVANCED prima di collegare dispositivi."
    );
    error.status = 402;
    error.code = "DEALER_SUBSCRIPTION_REQUIRED";
    throw error;
  }

  const existing = await prisma.dealerDevice.findUnique({
    where: {
      dealerProfileId_deviceId: {
        dealerProfileId: state.dealer.id,
        deviceId,
      },
    },
  });

  if (existing && !existing.revokedAt) {
    const device = await prisma.dealerDevice.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        label: params.label?.trim() || existing.label,
        userAgent: params.userAgent || existing.userAgent,
      },
    });
    return { device, state };
  }

  const activeDevices = await prisma.dealerDevice.count({
    where: {
      dealerProfileId: state.dealer.id,
      revokedAt: null,
    },
  });

  if (activeDevices >= state.maxDevices) {
    const error: any = new Error(
      `Hai raggiunto il limite di ${state.maxDevices} dispositivi del piano ${state.plan}. Revoca un dispositivo o passa ad ADVANCED.`
    );
    error.status = 403;
    error.code = "DEALER_DEVICE_LIMIT_REACHED";
    throw error;
  }

  const device = existing
    ? await prisma.dealerDevice.update({
        where: { id: existing.id },
        data: {
          revokedAt: null,
          lastSeenAt: new Date(),
          label: params.label?.trim() || existing.label,
          userAgent: params.userAgent || existing.userAgent,
        },
      })
    : await prisma.dealerDevice.create({
        data: {
          dealerProfileId: state.dealer.id,
          deviceId,
          label: params.label?.trim() || null,
          userAgent: params.userAgent || null,
        },
      });

  return { device, state };
}

export async function syncDealerSubscriptionFromStripe(
  subscription: Stripe.Subscription
) {
  const item = subscription.items.data[0];
  const priceId = item?.price?.id || null;
  const metadataPlan = subscription.metadata?.ascariDealerPlan;
  const pricePlan = getPlanByStripePriceId(priceId);

  const status = mapStripeSubscriptionStatus(subscription.status);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id || null;
  const dealerProfileId = subscription.metadata?.ascariDealerProfileId || null;

  let existing: any = null;
  if (subscription.id) {
    existing = await prisma.dealerSubscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });
  }
  if (!existing && dealerProfileId) {
    existing = await prisma.dealerSubscription.findUnique({
      where: { dealerProfileId },
    });
  }
  if (!existing && customerId) {
    existing = await prisma.dealerSubscription.findFirst({
      where: { stripeCustomerId: customerId },
    });
  }

  if (!existing) {
    console.warn(
      "[DEALER SUBSCRIPTION] Nessun record ASCARI associato alla subscription Stripe",
      subscription.id
    );
    return null;
  }

  const metadataIsValid =
    metadataPlan === "STARTER" || metadataPlan === "ADVANCED"
      ? (metadataPlan as DealerPlanCode)
      : null;
  const recognizedPlan = pricePlan || metadataIsValid;
  const plan: DealerPlanCode =
    recognizedPlan || (existing.plan as DealerPlanCode) || "STARTER";

  // Un vecchio Price TOP/PREMIUM non deve ereditare i nuovi vantaggi STARTER/ADVANCED
  // mantenendo il vecchio importo. Finché Price/metadata non sono riconosciuti,
  // ASCARI considera l'abbonamento legacy come non attivo.
  const localStatus: DealerSubscriptionStatusCode = recognizedPlan
    ? status
    : "INACTIVE";

  const updated = await prisma.dealerSubscription.update({
    where: { id: existing.id },
    data: {
      plan,
      status: localStatus,
      stripeCustomerId: customerId || existing.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodStart: toDate(item?.current_period_start),
      currentPeriodEnd: toDate(item?.current_period_end),
      cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
      cancelAt: toDate(subscription.cancel_at),
      canceledAt: toDate(subscription.canceled_at),
    },
    include: {
      dealerProfile: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
  });

  const effectivePlan = effectivePlanFromRecord({
    plan: updated.plan as DealerPlanCode,
    status: updated.status as DealerSubscriptionStatusCode,
  });
  await reconcileDealerListings(updated.dealerProfile.userId, effectivePlan);

  return updated;
}
