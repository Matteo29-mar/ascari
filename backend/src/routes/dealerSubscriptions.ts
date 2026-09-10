import { Router } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "../prisma";
import { ensureUserInDb } from "../lib/authUser";
import { stripe, buildFrontendUrl } from "../lib/stripe";
import {
  getDealerPlans,
  getPublicDealerPlans,
  isDealerPlanCode,
  isPaidDealerPlan,
} from "../config/dealerPlans";
import {
  ensureDealerSubscription,
  getDealerPlanState,
  syncDealerSubscriptionFromStripe,
  registerDealerDevice,
} from "../services/dealerSubscriptionService";

const router = Router();

async function validateConfiguredStripePrice(planCode: "STARTER" | "ADVANCED") {
  const plan = getDealerPlans()[planCode];

  if (!plan.stripePriceId) {
    const error: any = new Error(
      planCode === "STARTER"
        ? "STRIPE_DEALER_STARTER_PRICE_ID non configurato nel backend"
        : "STRIPE_DEALER_ADVANCED_PRICE_ID non configurato nel backend"
    );
    error.status = 503;
    error.code = "STRIPE_PRICE_NOT_CONFIGURED";
    throw error;
  }

  const price = await stripe.prices.retrieve(plan.stripePriceId);
  const expectedAmount = plan.monthlyPriceEur * 100;
  const valid =
    price.active &&
    price.currency.toLowerCase() === "eur" &&
    price.unit_amount === expectedAmount &&
    price.recurring?.interval === "month" &&
    (price.recurring?.interval_count ?? 1) === 1;

  if (!valid) {
    const error: any = new Error(
      `Il Price Stripe del piano ${planCode} deve essere ${plan.monthlyPriceEur} EUR/mese.`
    );
    error.status = 503;
    error.code = "STRIPE_PRICE_INVALID";
    throw error;
  }

  return { plan, price };
}

async function requireMe(req: any) {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    const error: any = new Error("Non autenticato");
    error.status = 401;
    throw error;
  }

  return ensureUserInDb(clerkId);
}

async function ensureStripeCustomer(userId: string) {
  const { dealer, subscription } = await ensureDealerSubscription(userId);

  if (subscription.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(subscription.stripeCustomerId);
      if (!("deleted" in customer && customer.deleted)) {
        return { dealer, subscription, customerId: customer.id };
      }
    } catch (error) {
      console.warn("Stripe customer non recuperabile, verrà ricreato:", error);
    }
  }

  const customer = await stripe.customers.create({
    email: dealer.email || dealer.user.email,
    name: dealer.dealerName,
    metadata: {
      ascariType: "DEALER_SUBSCRIPTION_CUSTOMER",
      ascariUserId: dealer.user.id,
      ascariDealerProfileId: dealer.id,
      ascariConnectedAccountId: dealer.user.stripeAccountId || "",
    },
  });

  const updatedSubscription = await prisma.dealerSubscription.update({
    where: { id: subscription.id },
    data: { stripeCustomerId: customer.id },
  });

  return {
    dealer,
    subscription: updatedSubscription,
    customerId: customer.id,
  };
}

async function trySyncCurrentStripeSubscription(userId: string) {
  const { subscription } = await ensureDealerSubscription(userId);
  if (!subscription.stripeSubscriptionId) return;

  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );
    await syncDealerSubscriptionFromStripe(stripeSubscription);
  } catch (error: any) {
    if (error?.statusCode === 404 || error?.code === "resource_missing") {
      console.warn(
        "Subscription Stripe non più presente, verrà gestita tramite stato locale/webhook:",
        subscription.stripeSubscriptionId
      );
      return;
    }
    console.error("Sync subscription Stripe fallita:", error);
  }
}

router.get("/me", async (req, res) => {
  try {
    const me = await requireMe(req);
    await trySyncCurrentStripeSubscription(me.id);

    const state = await getDealerPlanState(me.id);

    return res.json({
      ok: true,
      plans: getPublicDealerPlans(),
      current: {
        plan: state.plan,
        billingPlan: state.billingPlan,
        status: state.status,
        maxActiveCars: state.maxActiveCars,
        maxDevices: state.maxDevices,
        activeDevices: state.activeDevices,
        remainingDevices: state.remainingDevices,
        statsEnabled: state.statsEnabled,
        subscriptionRequired: state.subscriptionRequired,
        activeCars: state.activeCars,
        suspendedCars: state.suspendedCars,
        totalCars: state.totalCars,
        remainingSlots: state.remainingSlots,
        currentPeriodStart: state.subscription.currentPeriodStart,
        currentPeriodEnd: state.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: state.subscription.cancelAtPeriodEnd,
        cancelAt: state.subscription.cancelAt,
        hasStripeCustomer: !!state.subscription.stripeCustomerId,
        hasStripeSubscription: !!state.subscription.stripeSubscriptionId,
      },
    });
  } catch (error: any) {
    console.error("GET /dealer-subscriptions/me error:", error);
    return res.status(error?.status || 500).json({
      error: error?.message || "Errore caricamento abbonamento concessionaria",
    });
  }
});

router.post("/checkout", async (req, res) => {
  try {
    const me = await requireMe(req);
    const requestedPlan = req.body?.plan;

    if (!isDealerPlanCode(requestedPlan) || !isPaidDealerPlan(requestedPlan)) {
      return res.status(400).json({
        error: "Seleziona un piano STARTER o ADVANCED",
      });
    }

    await trySyncCurrentStripeSubscription(me.id);
    const state = await getDealerPlanState(me.id, { reconcile: false });

    if (isPaidDealerPlan(state.plan) && state.subscription.stripeSubscriptionId) {
      return res.status(409).json({
        code: "DEALER_SUBSCRIPTION_ALREADY_ACTIVE",
        error: "Hai già un abbonamento attivo. Usa Gestisci abbonamento per modificarlo.",
      });
    }

    if (state.subscription.stripeSubscriptionId && !state.plan) {
      try {
        const legacySubscription = await stripe.subscriptions.retrieve(
          state.subscription.stripeSubscriptionId
        );
        const canCreateReplacement =
          legacySubscription.status === "canceled" ||
          legacySubscription.status === "incomplete_expired";
        if (!canCreateReplacement) {
          return res.status(409).json({
            code: "DEALER_LEGACY_SUBSCRIPTION_ACTIVE",
            error:
              "Esiste ancora un vecchio abbonamento Stripe. Gestiscilo o annullalo dal portale prima di attivare STARTER/ADVANCED, così eviti una doppia sottoscrizione.",
          });
        }
      } catch (legacyError: any) {
        if (
          legacyError?.statusCode !== 404 &&
          legacyError?.code !== "resource_missing"
        ) {
          throw legacyError;
        }
      }
    }

    const { price } = await validateConfiguredStripePrice(
      requestedPlan as "STARTER" | "ADVANCED"
    );

      const { dealer, customerId } = await ensureStripeCustomer(me.id);

      const checkout = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: me.id,
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
      success_url: buildFrontendUrl(
        "/dealer/plans?checkout=success&session_id={CHECKOUT_SESSION_ID}"
      ),
      cancel_url: buildFrontendUrl("/dealer/plans?checkout=cancelled"),
      subscription_data: {
        metadata: {
          ascariType: "DEALER_SUBSCRIPTION",
          ascariUserId: me.id,
          ascariDealerProfileId: dealer.id,
          ascariDealerPlan: requestedPlan,
          ascariConnectedAccountId: dealer.user.stripeAccountId || "",
        },
      },
      metadata: {
        ascariType: "DEALER_SUBSCRIPTION_CHECKOUT",
        ascariUserId: me.id,
        ascariDealerProfileId: dealer.id,
        ascariDealerPlan: requestedPlan,
      },
    });

    return res.json({
      ok: true,
      url: checkout.url,
      checkoutSessionId: checkout.id,
    });
  } catch (error: any) {
    console.error("POST /dealer-subscriptions/checkout error:", error);
    return res.status(error?.status || error?.statusCode || 500).json({
      error: error?.message || "Errore creazione checkout Stripe",
    });
  }
});

router.post("/confirm-checkout", async (req, res) => {
  try {
    const me = await requireMe(req);
    const sessionId = String(req.body?.sessionId || "").trim();
    if (!sessionId) {
      return res.status(400).json({ error: "Checkout session mancante" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const belongsToMe =
      session.client_reference_id === me.id ||
      session.metadata?.ascariUserId === me.id;

    if (!belongsToMe || session.mode !== "subscription" || !session.subscription) {
      return res.status(403).json({ error: "Checkout non valido per questo account" });
    }

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    await syncDealerSubscriptionFromStripe(stripeSubscription);

    const state = await getDealerPlanState(me.id);
    return res.json({ ok: true, plan: state.plan, status: state.status });
  } catch (error: any) {
    console.error("POST /dealer-subscriptions/confirm-checkout error:", error);
    return res.status(error?.status || error?.statusCode || 500).json({
      error: error?.message || "Errore conferma checkout Stripe",
    });
  }
});

router.post("/change-plan", async (req, res) => {
  try {
    const me = await requireMe(req);
    const requestedPlan = req.body?.plan;

    if (!isDealerPlanCode(requestedPlan) || !isPaidDealerPlan(requestedPlan)) {
      return res.status(400).json({ error: "Piano non valido" });
    }

    await trySyncCurrentStripeSubscription(me.id);
    const state = await getDealerPlanState(me.id, { reconcile: false });
    if (!state.subscription.stripeSubscriptionId || !isPaidDealerPlan(state.plan)) {
      return res.status(409).json({
        error: "Non hai ancora un abbonamento a pagamento da modificare",
      });
    }

    if (state.plan === requestedPlan) {
      return res.json({ ok: true, unchanged: true, plan: state.plan });
    }

    const { plan: target, price: targetPrice } =
      await validateConfiguredStripePrice(
        requestedPlan as "STARTER" | "ADVANCED"
      );

    const current = await stripe.subscriptions.retrieve(
      state.subscription.stripeSubscriptionId
    );
    const currentItem = current.items.data[0];
    if (!currentItem) {
      return res.status(409).json({ error: "Subscription Stripe senza piano associato" });
    }

    const updated = await stripe.subscriptions.update(current.id, {
      items: [
        {
          id: currentItem.id,
          price: targetPrice.id,
        },
      ],
      proration_behavior: "create_prorations",
      metadata: {
        ...current.metadata,
        ascariDealerPlan: requestedPlan,
      },
    });

    await syncDealerSubscriptionFromStripe(updated);
    const nextState = await getDealerPlanState(me.id);

    return res.json({
      ok: true,
      plan: nextState.plan,
      status: nextState.status,
      currentPeriodEnd: nextState.subscription.currentPeriodEnd,
    });
  } catch (error: any) {
    console.error("POST /dealer-subscriptions/change-plan error:", error);
    return res.status(error?.status || error?.statusCode || 500).json({
      error: error?.message || "Errore cambio piano Stripe",
    });
  }
});

router.post("/portal", async (req, res) => {
  try {
    const me = await requireMe(req);
    await trySyncCurrentStripeSubscription(me.id);

    const { subscription } = await ensureDealerSubscription(me.id);
    if (!subscription.stripeCustomerId) {
      return res.status(400).json({
        error: "Nessun abbonamento Stripe da gestire",
      });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: buildFrontendUrl("/dealer/plans"),
    });

    return res.json({ ok: true, url: portal.url });
  } catch (error: any) {
    console.error("POST /dealer-subscriptions/portal error:", error);
    return res.status(error?.status || error?.statusCode || 500).json({
      error: error?.message || "Errore apertura portale Stripe",
    });
  }
});

router.get("/devices", async (req, res) => {
  try {
    const me = await requireMe(req);
    const state = await getDealerPlanState(me.id, { reconcile: false });
    const devices = await prisma.dealerDevice.findMany({
      where: { dealerProfileId: state.dealer.id },
      orderBy: [{ revokedAt: "asc" }, { lastSeenAt: "desc" }],
      select: {
        id: true,
        deviceId: true,
        label: true,
        userAgent: true,
        lastSeenAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    return res.json({
      ok: true,
      plan: state.plan,
      maxDevices: state.maxDevices,
      activeDevices: state.activeDevices,
      remainingDevices: state.remainingDevices,
      devices,
    });
  } catch (error: any) {
    return res.status(error?.status || 500).json({
      code: error?.code,
      error: error?.message || "Errore caricamento dispositivi",
    });
  }
});

router.post("/devices/register", async (req, res) => {
  try {
    const me = await requireMe(req);
    const result = await registerDealerDevice({
      userId: me.id,
      deviceId: String(req.body?.deviceId || ""),
      label: typeof req.body?.label === "string" ? req.body.label : null,
      userAgent: typeof req.body?.userAgent === "string" ? req.body.userAgent : req.headers["user-agent"] || null,
    });

    return res.json({
      ok: true,
      device: result.device,
      maxDevices: result.state.maxDevices,
    });
  } catch (error: any) {
    return res.status(error?.status || 500).json({
      code: error?.code,
      error: error?.message || "Errore collegamento dispositivo",
    });
  }
});

router.delete("/devices/:deviceId", async (req, res) => {
  try {
    const me = await requireMe(req);
    const state = await getDealerPlanState(me.id, { reconcile: false });
    const device = await prisma.dealerDevice.findFirst({
      where: {
        id: req.params.deviceId,
        dealerProfileId: state.dealer.id,
      },
    });
    if (!device) return res.status(404).json({ error: "Dispositivo non trovato" });

    await prisma.dealerDevice.update({
      where: { id: device.id },
      data: { revokedAt: new Date() },
    });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Errore revoca dispositivo",
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const me = await requireMe(req);
    const state = await getDealerPlanState(me.id);

    if (!state.statsEnabled) {
      return res.status(403).json({
        code: "DEALER_STATS_PLAN_REQUIRED",
        error: "Le statistiche per auto sono disponibili con il piano ADVANCED.",
      });
    }

    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);

    const [
      likes,
      offers,
      qrScans,
      carsSold,
      likes30,
      offers30,
      qrScans30,
      carsSold30,
    ] = await Promise.all([
      prisma.like.count({ where: { car: { ownerId: me.id } } }),
      prisma.offer.count({ where: { sellerId: me.id } }),
      prisma.qrScan.count({ where: { car: { ownerId: me.id } } }),
      prisma.saleHistory.count({ where: { sellerId: me.id } }),
      prisma.like.count({
        where: {
          car: { ownerId: me.id },
          createdAt: { gte: since30 },
        },
      }),
      prisma.offer.count({
        where: {
          sellerId: me.id,
          createdAt: { gte: since30 },
        },
      }),
      prisma.qrScan.count({
        where: {
          car: { ownerId: me.id },
          scannedAt: { gte: since30 },
        },
      }),
      prisma.saleHistory.count({
        where: {
          sellerId: me.id,
          soldAt: { gte: since30 },
        },
      }),
    ]);

    return res.json({
      ok: true,
      plan: state.plan,
      totals: {
        activeCars: state.activeCars,
        suspendedCars: state.suspendedCars,
        likes,
        offers,
        qrScans,
        carsSold,
      },
      last30Days: {
        likes: likes30,
        offers: offers30,
        qrScans: qrScans30,
        carsSold: carsSold30,
      },
    });
  } catch (error: any) {
    console.error("GET /dealer-subscriptions/stats error:", error);
    return res.status(error?.status || 500).json({
      error: error?.message || "Errore caricamento statistiche concessionaria",
    });
  }
});

export default router;
