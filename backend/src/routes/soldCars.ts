// backend/src/routes/soldCars.ts

import { Router } from "express";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";
import { ensureUserInDb } from "../lib/authUser";
import {
  buildCarAvailabilityResponse,
  runSoldCarsVisualCleanup,
} from "../lib/carSaleLifecycle";

const router = Router();

function safePublicCarSelect() {
  return {
    id: true,
    make: true,
    model: true,
    title: true,
    year: true,
    coverUrl: true,
    photos: true,
    priceEur: true,
    mileageKm: true,
    fuelType: true,
    transmission: true,
    city: true,
    marketStatus: true,
  };
}

async function getAlternativesForCar(carId: number) {
  const car = await prisma.car.findUnique({
    where: { id: carId },
    select: {
      id: true,
      make: true,
      model: true,
    },
  });

  if (!car) return [];

  const selectedIds = new Set<number>([car.id]);
  const alternatives: any[] = [];

  async function pushCandidates(whereExtra: any, take: number) {
    if (alternatives.length >= 3) return;

    const rows = await prisma.car.findMany({
      where: {
        marketStatus: "AVAILABLE",
        visuallyRemovedAt: null,
        dealerPlanSuspended: false,
        id: {
          notIn: Array.from(selectedIds),
        },
        ...whereExtra,
      },
      select: safePublicCarSelect(),
      orderBy: {
        createdAt: "desc",
      },
      take,
    });

    for (const row of rows) {
      if (alternatives.length >= 3) break;

      selectedIds.add(row.id);
      alternatives.push(row);
    }
  }

  await pushCandidates(
    {
      make: {
        equals: car.make,
        mode: "insensitive",
      },
      model: {
        equals: car.model,
        mode: "insensitive",
      },
    },
    3
  );

  await pushCandidates(
    {
      make: {
        equals: car.make,
        mode: "insensitive",
      },
    },
    3
  );

  await pushCandidates({}, 3);

  return alternatives.slice(0, 3);
}

/**
 * GET /api/sold-cars/:id/availability
 *
 * Controlla se una macchina è ancora disponibile.
 * Se è venduta, restituisce 3 alternative.
 */
router.get("/:id/availability", async (req, res) => {
  const carId = Number(req.params.id);

  if (!Number.isFinite(carId) || carId <= 0) {
    return res.status(400).json({
      error: "Car id non valido",
    });
  }

  try {
    await runSoldCarsVisualCleanup(prisma);

    const car = await prisma.car.findUnique({
      where: {
        id: carId,
      },
      select: {
        id: true,
        make: true,
        model: true,
        title: true,
        year: true,
        paymentStatus: true,
        marketStatus: true,
        soldAt: true,
        removalScheduledAt: true,
        visuallyRemovedAt: true,
      },
    });

    if (!car) {
      return res.status(404).json(
        buildCarAvailabilityResponse({
          car: null,
          alternatives: [],
        })
      );
    }

    const isAvailable =
      car.marketStatus === "AVAILABLE" && !car.visuallyRemovedAt;

    const alternatives = isAvailable ? [] : await getAlternativesForCar(car.id);

    return res.json(
      buildCarAvailabilityResponse({
        car,
        alternatives,
      })
    );
  } catch (error) {
    console.error("GET /sold-cars/:id/availability error:", error);

    return res.status(500).json({
      error: "Errore controllo disponibilità auto",
    });
  }
});

/**
 * POST /api/sold-cars/cleanup
 *
 * Endpoint manuale per forzare la pulizia.
 * Utile in dev/test.
 */
router.post("/cleanup", async (req, res) => {
  try {
    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({
        error: "Not authenticated",
      });
    }

    await ensureUserInDb(clerkUserId);

    const result = await runSoldCarsVisualCleanup(prisma);

    return res.json(result);
  } catch (error: any) {
    console.error("POST /sold-cars/cleanup error:", error);

    return res.status(error?.status || 500).json({
      error: error?.message || "Errore cleanup auto vendute",
    });
  }
});

export default router;