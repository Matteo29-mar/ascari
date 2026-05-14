// backend/src/jobs/soldCarsCleanup.ts

import { prisma } from "../prisma";
import { runSoldCarsVisualCleanup } from "../lib/carSaleLifecycle";

let cleanupInterval: NodeJS.Timeout | null = null;

export async function executeSoldCarsCleanupJob() {
  try {
    const result = await runSoldCarsVisualCleanup(prisma);

    if (result.removedCount > 0) {
      console.log(
        `[SOLD_CARS_CLEANUP] removed=${result.removedCount} executedAt=${result.executedAt.toISOString()}`
      );
    }

    return result;
  } catch (error) {
    console.error("[SOLD_CARS_CLEANUP] error:", error);

    return {
      ok: false,
      removedCount: 0,
      executedAt: new Date(),
      error,
    };
  }
}

export function startSoldCarsCleanupJob(options?: {
  intervalMinutes?: number;
  runImmediately?: boolean;
}) {
  const intervalMinutes = options?.intervalMinutes ?? 60;
  const runImmediately = options?.runImmediately ?? true;

  if (cleanupInterval) {
    console.log("[SOLD_CARS_CLEANUP] already started");
    return cleanupInterval;
  }

  if (runImmediately) {
    void executeSoldCarsCleanupJob();
  }

  cleanupInterval = setInterval(() => {
    void executeSoldCarsCleanupJob();
  }, intervalMinutes * 60 * 1000);

  console.log(
    `[SOLD_CARS_CLEANUP] started intervalMinutes=${intervalMinutes}`
  );

  return cleanupInterval;
}

export function stopSoldCarsCleanupJob() {
  if (!cleanupInterval) return;

  clearInterval(cleanupInterval);
  cleanupInterval = null;

  console.log("[SOLD_CARS_CLEANUP] stopped");
}