import { Router } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { prisma } from "../prisma";
import {
  analyzeHybridPrice,
  buildArvePricingInputFromCar,
} from "../services/arve/hybridPricingAssistant";

const router = Router();

const decisionSchema = z.object({
  acceptSuggestedPrice: z.boolean(),
});

async function requireOwner(req: any, carId: number) {
  const { userId: clerkUserId } = getAuth(req);

  if (!clerkUserId) {
    const error: any = new Error("Not authenticated");
    error.status = 401;
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    const error: any = new Error("User not found");
    error.status = 404;
    throw error;
  }

  const car = await prisma.car.findUnique({
    where: { id: carId },
  });

  if (!car) {
    const error: any = new Error("Car not found");
    error.status = 404;
    throw error;
  }

  if (car.ownerId !== user.id) {
    const error: any = new Error("Not allowed");
    error.status = 403;
    throw error;
  }

  return { user, car };
}

function publicAnalysis(analysis: any) {
  if (!analysis) return null;

  const { rawResponseJson, analysisError, ...safe } = analysis;
  return {
    ...safe,
    fallbackUsed: Boolean(analysisError),
  };
}

/**
 * GET /api/arve/health
 */
router.get("/health", async (_req, res) => {
  try {
    const [marketReferences, marketObservations] = await Promise.all([
      prisma.arveMarketReference.count(),
      prisma.arveMarketObservation.count(),
    ]);

    return res.json({
      ok: true,
      enabled: String(process.env.ARVE_ENABLED || "true").toLowerCase() !== "false",
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      promptVersion: process.env.ARVE_PROMPT_VERSION || "ascari-arve-v2",
      visionEnabled:
        String(process.env.OPENAI_VISION_ENABLED || "true").toLowerCase() !== "false",
      marketReferences,
      marketObservations,
      marketDatasetReady: marketReferences > 0,
    });
  } catch (error: any) {
    return res.status(503).json({
      ok: false,
      error: error?.message || "ARVE database non disponibile",
    });
  }
});

/**
 * POST /api/arve/cars/:id/analyze
 */
router.post("/cars/:id/analyze", async (req, res) => {
  const carId = Number(req.params.id);

  if (!Number.isFinite(carId) || carId <= 0) {
    return res.status(400).json({ error: "Car id non valido" });
  }

  try {
    const { car } = await requireOwner(req, carId);

    if (car.marketStatus !== "AVAILABLE" || car.visuallyRemovedAt) {
      return res.status(400).json({
        error: "ARVE può analizzare soltanto auto disponibili.",
      });
    }

    const force = String(req.query.force || "false").toLowerCase() === "true";
    const existingAnalysis = await prisma.arvePricingAnalysis.findUnique({
      where: { carId },
    });

    if (existingAnalysis && !force) {
      return res.json({
        ok: true,
        cached: true,
        analysisId: existingAnalysis.id,
        ...publicAnalysis(existingAnalysis),
      });
    }

    const input = buildArvePricingInputFromCar(car);
    const result = await analyzeHybridPrice(prisma, input);

    const analysis = await prisma.arvePricingAnalysis.findUnique({
      where: { carId },
    });

    return res.json({
      ok: true,
      cached: false,
      carId,
      analysisId: analysis?.id ?? null,
      originalOfferPrice1: analysis?.originalOfferPrice1 ?? input.originalOfferPrice1,
      originalOfferPrice2: analysis?.originalOfferPrice2 ?? input.originalOfferPrice2,
      originalOfferPrice3: analysis?.originalOfferPrice3 ?? input.originalOfferPrice3,
      ...result,
    });
  } catch (error: any) {
    console.error("POST /api/arve/cars/:id/analyze error:", error);
    return res.status(error?.status || 500).json({
      error: error?.message || "Errore analisi ARVE",
    });
  }
});

/**
 * GET /api/arve/cars/:id
 */
router.get("/cars/:id", async (req, res) => {
  const carId = Number(req.params.id);

  if (!Number.isFinite(carId) || carId <= 0) {
    return res.status(400).json({ error: "Car id non valido" });
  }

  try {
    await requireOwner(req, carId);

    const analysis = await prisma.arvePricingAnalysis.findUnique({
      where: { carId },
    });

    if (!analysis) {
      return res.status(404).json({ error: "Analisi ARVE non ancora disponibile" });
    }

    return res.json(publicAnalysis(analysis));
  } catch (error: any) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Errore lettura analisi ARVE",
    });
  }
});

/**
 * POST /api/arve/cars/:id/decision
 */
router.post("/cars/:id/decision", async (req, res) => {
  const carId = Number(req.params.id);

  if (!Number.isFinite(carId) || carId <= 0) {
    return res.status(400).json({ error: "Car id non valido" });
  }

  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Decisione ARVE non valida",
      details: parsed.error.flatten(),
    });
  }

  try {
    const { car } = await requireOwner(req, carId);

    if (car.marketStatus !== "AVAILABLE" || car.visuallyRemovedAt) {
      return res.status(400).json({
        error: "Non puoi modificare i prezzi di un'auto venduta.",
      });
    }

    const analysis = await prisma.arvePricingAnalysis.findUnique({
      where: { carId },
    });

    if (!analysis) {
      return res.status(404).json({ error: "Analisi ARVE non trovata" });
    }

    const accepted = parsed.data.acceptSuggestedPrice;
    const appliedPrices = accepted
      ? {
          offerPrice1: analysis.quickSalePrice,
          offerPrice2: analysis.reservePrice,
          offerPrice3: analysis.democraticPrice,
        }
      : {
          offerPrice1: analysis.originalOfferPrice1,
          offerPrice2: analysis.originalOfferPrice2,
          offerPrice3: analysis.originalOfferPrice3,
        };

    const [updatedCar, updatedAnalysis] = await prisma.$transaction([
      prisma.car.update({
        where: { id: carId },
        data: appliedPrices,
      }),
      prisma.arvePricingAnalysis.update({
        where: { carId },
        data: {
          userDecision: accepted ? "ACCEPTED" : "REJECTED",
          appliedOfferPrice1: appliedPrices.offerPrice1,
          appliedOfferPrice2: appliedPrices.offerPrice2,
          appliedOfferPrice3: appliedPrices.offerPrice3,
          decidedAt: new Date(),
        },
      }),
    ]);

    console.log(
      `[ARVE_DECISION] carId=${carId} decision=${
        accepted ? "ACCEPTED" : "REJECTED"
      } applied=${appliedPrices.offerPrice1}/${appliedPrices.offerPrice2}/${appliedPrices.offerPrice3}`
    );

    return res.json({
      ok: true,
      decision: accepted ? "ACCEPTED" : "REJECTED",
      car: updatedCar,
      analysis: publicAnalysis(updatedAnalysis),
    });
  } catch (error: any) {
    console.error("POST /api/arve/cars/:id/decision error:", error);
    return res.status(error?.status || 500).json({
      error: error?.message || "Errore salvataggio decisione ARVE",
    });
  }
});

export default router;
