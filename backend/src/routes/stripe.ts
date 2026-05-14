// backend/src/routes/stripe.ts

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "../prisma";
import { ensureUserInDb } from "../lib/authUser";
import { stripe, computeAscariFee, buildFrontendUrl } from "../lib/stripe";
import { markCarAsSoldPendingRemoval } from "../lib/carSaleLifecycle";

const router = Router();

async function requireMe(req: any) {
  const { userId: clerkId } = getAuth(req);

  if (!clerkId) {
    const err: any = new Error("Not authenticated");
    err.status = 401;
    throw err;
  }

  const me = await ensureUserInDb(clerkId);
  return me;
}

function mapStripeStatus(user: any) {
  const onboardingCompleted =
    !!user?.stripeDetailsSubmitted &&
    !!user?.stripeChargesEnabled &&
    !!user?.stripePayoutsEnabled;

  let status: "NOT_STARTED" | "PENDING" | "ENABLED" = "NOT_STARTED";

  if (user?.stripeAccountId) status = "PENDING";
  if (onboardingCompleted) status = "ENABLED";

  return {
    accountId: user?.stripeAccountId ?? null,
    status,
    chargesEnabled: !!user?.stripeChargesEnabled,
    payoutsEnabled: !!user?.stripePayoutsEnabled,
    detailsSubmitted: !!user?.stripeDetailsSubmitted,
    onboardingCompleted,
  };
}

async function getOrCreateConnectedAccount(user: any) {
  if (user.stripeAccountId) {
    return user.stripeAccountId;
  }

  const account = await stripe.accounts.create({
    type: "express",
    email: user.email,
    metadata: {
      ascariUserId: user.id,
      clerkId: user.clerkId,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeAccountId: account.id,
      stripeAccountStatus: "PENDING",
    },
  });

  return account.id;
}

async function syncStripeAccountToDb(userId: string, stripeAccountId: string) {
  const account = await stripe.accounts.retrieve(stripeAccountId);

  const completed =
    !!account.details_submitted &&
    !!account.charges_enabled &&
    !!account.payouts_enabled;

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      stripeAccountStatus: completed ? "ENABLED" : "PENDING",
      stripeChargesEnabled: !!account.charges_enabled,
      stripePayoutsEnabled: !!account.payouts_enabled,
      stripeDetailsSubmitted: !!account.details_submitted,
      stripeOnboardingCompletedAt: completed ? new Date() : null,
      paymentsEnabledAt: completed ? new Date() : null,
    },
  });

  return updatedUser;
}

function buildCarSnapshot(car: any) {
  return {
    id: car.id,
    make: car.make,
    model: car.model,
    title: car.title,
    year: car.year,

    offerPrice1: car.offerPrice1,
    offerPrice2: car.offerPrice2,
    offerPrice3: car.offerPrice3,

    trimLevel: car.trimLevel,
    priceEur: car.priceEur,
    color: car.color,
    transmission: car.transmission,
    fuelType: car.fuelType,
    engine: car.engine,
    horsepower: car.horsepower,
    torqueNm: car.torqueNm,
    drivetrain: car.drivetrain,
    seats: car.seats,
    doors: car.doors,
    description: car.description,
    mileageKm: car.mileageKm,
    photos: car.photos,
    coverUrl: car.coverUrl,

    isPeriziata: car.isPeriziata,
    periziaDocUrl: car.periziaDocUrl,
    periziaUploadedAt: car.periziaUploadedAt,

    locationText: car.locationText,
    city: car.city,
    country: car.country,
    latitude: car.latitude,
    longitude: car.longitude,

    createdAt: car.createdAt,
    updatedAt: car.updatedAt,
  };
}

function buildInspectionSnapshotFromCar(car: any) {
  const reports = Array.isArray(car.inspectionReports) ? car.inspectionReports : [];

  if (reports.length <= 0) {
    return null;
  }

  const latestReport = reports[0];

  return {
    reportId: latestReport.id,
    inspectionRequestId: latestReport.inspectionRequestId,

    title: latestReport.title,
    overallStatus: latestReport.overallStatus,
    plate: latestReport.plate,
    vin: latestReport.vin,
    km: latestReport.km,
    inspectionDate: latestReport.inspectionDate,
    location: latestReport.location,

    bodyworkNotes: latestReport.bodyworkNotes,
    interiorNotes: latestReport.interiorNotes,
    engineNotes: latestReport.engineNotes,
    mechanicsNotes: latestReport.mechanicsNotes,
    tiresNotes: latestReport.tiresNotes,
    electronicsNotes: latestReport.electronicsNotes,
    testDriveNotes: latestReport.testDriveNotes,
    defectsFound: latestReport.defectsFound,
    finalOpinion: latestReport.finalOpinion,
    estimatedValue: latestReport.estimatedValue,

    inspectorUserId: latestReport.inspectorUserId,
    createdAt: latestReport.createdAt,
    updatedAt: latestReport.updatedAt,
  };
}

async function createSaleHistoryIfNeeded(params: {
  paymentId: number;
  stripePaymentIntentId: string;
  stripeChargeId?: string | null;
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: params.paymentId },
    include: {
      buyer: true,
      seller: true,
      car: {
        include: {
          owner: true,
          inspectionReports: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!payment) {
    throw new Error("Pagamento non trovato per creazione storico");
  }

  if (payment.status !== "SUCCEEDED") {
    return null;
  }

  const existingHistory = await prisma.saleHistory.findUnique({
    where: {
      paymentId: payment.id,
    },
  });

  if (existingHistory) {
    return existingHistory;
  }

  const carSnapshot = buildCarSnapshot(payment.car);
  const inspectionSnapshot = buildInspectionSnapshotFromCar(payment.car);

  const now = payment.paidAt ?? new Date();


  const history = await prisma.$transaction(async (tx) => {
    const createdHistory = await tx.saleHistory.create({
      data: {
        carId: payment.carId,
        buyerId: payment.buyerId,
        sellerId: payment.sellerId,
        paymentId: payment.id,

        amountEur: payment.amountEur,
        ascariFeeEur: payment.ascariFeeEur,
        sellerNetEur: payment.sellerNetEur,
        currency: payment.currency || "eur",

        carSnapshot,
        inspectionSnapshot: inspectionSnapshot ?? undefined,

        stripePaymentIntentId: params.stripePaymentIntentId,
        stripeChargeId: params.stripeChargeId ?? payment.stripeChargeId ?? null,
        soldAt: now,
      },
    });

    await markCarAsSoldPendingRemoval({
      prisma: tx,
      carId: payment.carId,
      paymentId: payment.id,
      saleHistoryId: createdHistory.id,
      soldAt: now,
    });

    await tx.offer.updateMany({
      where: {
        carId: payment.carId,
        status: "PENDING",
      },
      data: {
        status: "CLOSED_SOLD",
      },
    });

    return createdHistory;
  });

  return history;
}

// =========================
// ACCOUNT STATUS
// =========================
router.get("/account/status", async (req, res) => {
  try {
    const me = await requireMe(req);

    if (!me.stripeAccountId) {
      return res.json({
        accountId: null,
        status: "NOT_STARTED",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        onboardingCompleted: false,
      });
    }

    const updatedUser = await syncStripeAccountToDb(me.id, me.stripeAccountId);
    return res.json(mapStripeStatus(updatedUser));
  } catch (e: any) {
    console.error("GET /stripe/account/status error:", e);
    return res.status(e?.status || 500).json({
      error: e?.message || "Errore recupero stato Stripe",
    });
  }
});

// =========================
// ACCOUNT ONBOARDING
// =========================
router.post("/account/onboarding-link", async (req, res) => {
  try {
    const me = await requireMe(req);
    const stripeAccountId = await getOrCreateConnectedAccount(me);

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: buildFrontendUrl("/payments"),
      return_url: buildFrontendUrl("/payments"),
      type: "account_onboarding",
    });

    return res.json({
      ok: true,
      url: accountLink.url,
      accountId: stripeAccountId,
    });
  } catch (e: any) {
    console.error("POST /stripe/account/onboarding-link error:", e);
    return res.status(e?.status || 500).json({
      error: e?.message || "Errore creazione onboarding Stripe",
    });
  }
});

router.post("/account/refresh-link", async (req, res) => {
  try {
    const me = await requireMe(req);
    const stripeAccountId = await getOrCreateConnectedAccount(me);

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: buildFrontendUrl("/payments"),
      return_url: buildFrontendUrl("/payments"),
      type: "account_onboarding",
    });

    return res.json({
      ok: true,
      url: accountLink.url,
      accountId: stripeAccountId,
    });
  } catch (e: any) {
    console.error("POST /stripe/account/refresh-link error:", e);
    return res.status(e?.status || 500).json({
      error: e?.message || "Errore refresh onboarding Stripe",
    });
  }
});

// =========================
// CONFIG PAGAMENTO AUTO
// =========================
router.post("/cars/:carId/configure", async (req, res) => {
  try {
    const me = await requireMe(req);

    const carId = Number(req.params.carId);
    if (!Number.isFinite(carId) || carId <= 0) {
      return res.status(400).json({ error: "carId non valido" });
    }

    const salePriceEur = Number(req.body?.salePriceEur);
    if (!Number.isFinite(salePriceEur) || salePriceEur <= 0) {
      return res.status(400).json({ error: "Prezzo vendita non valido" });
    }

    const car = await prisma.car.findUnique({
      where: { id: carId },
      include: { owner: true },
    });

    if (!car) {
      return res.status(404).json({ error: "Auto non trovata" });
    }

    if (car.ownerId !== me.id) {
      return res.status(403).json({
        error: "Non puoi configurare il pagamento di questa auto",
      });
    }

    if (car.paymentStatus === "SOLD" || car.marketStatus !== "AVAILABLE") {
      return res.status(400).json({
        error: "Questa auto risulta già venduta",
      });
    }

    if (!me.stripeAccountId) {
      return res.status(400).json({
        error: "Prima devi abilitare i pagamenti Stripe dal tuo profilo",
      });
    }

    const syncedUser = await syncStripeAccountToDb(me.id, me.stripeAccountId);

    const paymentsReady =
      syncedUser.stripeChargesEnabled &&
      syncedUser.stripePayoutsEnabled &&
      syncedUser.stripeDetailsSubmitted;

    if (!paymentsReady) {
      return res.status(400).json({
        error: "Il tuo account Stripe non è ancora completamente abilitato",
      });
    }

    const amounts = computeAscariFee(salePriceEur);

    const updatedCar = await prisma.car.update({
      where: { id: carId },
      data: {
        paymentEnabled: true,
        salePriceEur: amounts.salePriceEur,
        ascariFeeEur: amounts.ascariFeeEur,
        sellerNetEur: amounts.sellerNetEur,
        paymentStatus: "CONFIGURED",
        paymentConfiguredAt: new Date(),
      },
    });

    return res.json({
      ok: true,
      car: updatedCar,
      breakdown: amounts,
    });
  } catch (e: any) {
    console.error("POST /stripe/cars/:carId/configure error:", e);
    return res.status(e?.status || 500).json({
      error: e?.message || "Errore configurazione pagamento auto",
    });
  }
});

// =========================
// CREA PAYMENT INTENT REALE
// =========================
router.post("/cars/:carId/create-payment-intent", async (req, res) => {
  try {
    const me = await requireMe(req);

    const carId = Number(req.params.carId);
    if (!Number.isFinite(carId) || carId <= 0) {
      return res.status(400).json({ error: "carId non valido" });
    }

    const car = await prisma.car.findUnique({
      where: { id: carId },
      include: {
        owner: true,
      },
    });

    if (!car) {
      return res.status(404).json({ error: "Auto non trovata" });
    }

    if (car.ownerId === me.id) {
      return res.status(400).json({
        error: "Non puoi acquistare la tua stessa auto",
      });
    }

if (car.paymentStatus === "SOLD" || car.marketStatus !== "AVAILABLE") {
      return res.status(400).json({
        error: "Auto già venduta",
      });
    }

    if (
      !car.paymentEnabled ||
      !car.salePriceEur ||
      !car.ascariFeeEur ||
      !car.sellerNetEur
    ) {
      return res.status(400).json({
        error: "Il venditore non ha ancora configurato il pagamento per questa auto",
      });
    }

    if (!car.owner?.stripeAccountId) {
      return res.status(400).json({
        error: "Il venditore non ha un account Stripe collegato",
      });
    }

    const seller = await syncStripeAccountToDb(
      car.owner.id,
      car.owner.stripeAccountId
    );

    const sellerReady =
      seller.stripeChargesEnabled &&
      seller.stripePayoutsEnabled &&
      seller.stripeDetailsSubmitted;

    if (!sellerReady) {
      return res.status(400).json({
        error: "Il venditore non ha ancora completato l’abilitazione Stripe",
      });
    }

    const amountCents = Math.round(car.salePriceEur * 100);
    const applicationFeeCents = Math.round(car.ascariFeeEur * 100);

    const alreadySucceeded = await prisma.payment.findFirst({
      where: {
        carId: car.id,
        status: "SUCCEEDED",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (alreadySucceeded) {
      return res.status(400).json({
        error: "Auto già venduta",
      });
    }

    const existingPending = await prisma.payment.findFirst({
      where: {
        carId: car.id,
        buyerId: me.id,
        status: {
          in: [
            "CREATED",
            "REQUIRES_PAYMENT_METHOD",
            "REQUIRES_CONFIRMATION",
            "REQUIRES_ACTION",
            "PROCESSING",
          ],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existingPending?.stripePaymentIntentId) {
      const existingIntent = await stripe.paymentIntents.retrieve(
        existingPending.stripePaymentIntentId
      );

      return res.json({
        ok: true,
        paymentId: existingPending.id,
        paymentIntentId: existingIntent.id,
        clientSecret: existingIntent.client_secret,
        status: existingIntent.status,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      automatic_payment_methods: {
        enabled: true,
      },
      application_fee_amount: applicationFeeCents,
      transfer_data: {
        destination: car.owner.stripeAccountId,
      },
      metadata: {
        ascariCarId: String(car.id),
        ascariBuyerId: me.id,
        ascariSellerId: car.ownerId,
      },
    });

    const savedPayment = await prisma.payment.create({
      data: {
        carId: car.id,
        buyerId: me.id,
        sellerId: car.ownerId,
        stripePaymentIntentId: paymentIntent.id,
        stripeClientSecret: paymentIntent.client_secret ?? null,
        amountEur: car.salePriceEur,
        ascariFeeEur: car.ascariFeeEur,
        sellerNetEur: car.sellerNetEur,
        currency: "eur",
        status: (paymentIntent.status || "CREATED").toUpperCase(),
      },
    });

    return res.json({
      ok: true,
      paymentId: savedPayment.id,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status,
    });
  } catch (e: any) {
    console.error("POST /stripe/cars/:carId/create-payment-intent error:", e);
    return res.status(e?.statusCode || e?.status || 500).json({
      error: e?.message || "Errore creazione PaymentIntent",
    });
  }
});

// =========================
// LEGGE STATO PAGAMENTO
// QUI VIENE CREATO LO STORICO QUANDO IL PAGAMENTO È SUCCEEDED
// =========================
router.get("/payments/:paymentId/status", async (req, res) => {
  try {
    const me = await requireMe(req);

    const paymentId = Number(req.params.paymentId);
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      return res.status(400).json({ error: "paymentId non valido" });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return res.status(404).json({ error: "Pagamento non trovato" });
    }

    if (payment.buyerId !== me.id && payment.sellerId !== me.id) {
      return res.status(403).json({ error: "Pagamento non accessibile" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      payment.stripePaymentIntentId,
      {
        expand: ["latest_charge"],
      }
    );

    const latestCharge =
      paymentIntent.latest_charge && typeof paymentIntent.latest_charge !== "string"
        ? paymentIntent.latest_charge
        : null;

    const applicationFeeId =
      latestCharge?.application_fee && typeof latestCharge.application_fee === "string"
        ? latestCharge.application_fee
        : null;

    const newStatus = (paymentIntent.status || payment.status).toUpperCase();

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        stripeChargeId: latestCharge?.id ?? payment.stripeChargeId ?? null,
        stripeApplicationFeeId:
          applicationFeeId ?? payment.stripeApplicationFeeId ?? null,
        paidAt:
          paymentIntent.status === "succeeded" && !payment.paidAt
            ? new Date()
            : payment.paidAt,
      },
    });

    let saleHistory = null;

    if (paymentIntent.status === "succeeded") {
      saleHistory = await createSaleHistoryIfNeeded({
        paymentId: updated.id,
        stripePaymentIntentId: paymentIntent.id,
        stripeChargeId: latestCharge?.id ?? null,
      });
    }

    return res.json({
      ok: true,
      payment: updated,
      paymentIntentStatus: paymentIntent.status,
      saleHistory,
    });
  } catch (e: any) {
    console.error("GET /stripe/payments/:paymentId/status error:", e);
    return res.status(e?.statusCode || e?.status || 500).json({
      error: e?.message || "Errore lettura stato pagamento",
    });
  }
});

// =========================
// RIMBORSO BASE
// =========================
router.post("/payments/:paymentId/refund", async (req, res) => {
  try {
    const me = await requireMe(req);

    const paymentId = Number(req.params.paymentId);
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      return res.status(400).json({ error: "paymentId non valido" });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return res.status(404).json({ error: "Pagamento non trovato" });
    }

    if (payment.sellerId !== me.id && payment.buyerId !== me.id) {
      return res.status(403).json({
        error: "Non puoi rimborsare questo pagamento",
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      payment.stripePaymentIntentId,
      {
        expand: ["latest_charge"],
      }
    );

    const latestCharge =
      paymentIntent.latest_charge && typeof paymentIntent.latest_charge !== "string"
        ? paymentIntent.latest_charge
        : null;

    if (!latestCharge?.id) {
      return res.status(400).json({
        error: "Charge Stripe non trovata per questo pagamento",
      });
    }

    const refund = await stripe.refunds.create({
      charge: latestCharge.id,
      reverse_transfer: true,
      refund_application_fee: true,
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
      },
    });

    await prisma.car.update({
      where: { id: payment.carId },
      data: {
        paymentStatus: "REFUNDED",
      },
    });

    return res.json({
      ok: true,
      refundId: refund.id,
      payment: updated,
    });
  } catch (e: any) {
    console.error("POST /stripe/payments/:paymentId/refund error:", e);
    return res.status(e?.statusCode || e?.status || 500).json({
      error: e?.message || "Errore rimborso pagamento",
    });
  }
});

export default router;