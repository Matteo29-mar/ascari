// backend/src/routes/inspectionReports.ts

import { Router } from "express";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";
import { buildPdfBuffer } from "../lib/buildInspection";

const router = Router();

async function getMe(req: any) {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    const err: any = new Error("Non autenticato");
    err.status = 401;
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    const err: any = new Error("Utente non presente nel DB");
    err.status = 400;
    throw err;
  }

  const profile = await prisma.inspectorProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) {
    const err: any = new Error("Profilo periziatore non trovato");
    err.status = 404;
    throw err;
  }

  return { clerkId, user, profile };
}

/**
 * GET /api/inspection-reports/pending
 * Perizie confermate, assegnate al periziatore, senza resoconto
 */
router.get("/pending", async (req, res) => {
  try {
    const { profile } = await getMe(req);

    const requests = await prisma.inspectionRequest.findMany({
      where: {
        inspectorId: profile.id,
        status: "CONFIRMED",
        report: null,
      },
      orderBy: { startAt: "asc" },
      include: {
        car: {
          select: {
            id: true,
            make: true,
            model: true,
            title: true,
            year: true,
            mileageKm: true,
            coverUrl: true,
            city: true,
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return res.json({ ok: true, requests });
  } catch (e: any) {
    console.error(e);
    return res.status(e?.status || 500).json({ error: e?.message || "Errore server" });
  }
});

/**
 * GET /api/inspection-reports/archive
 * Archivio resoconti del periziatore
 */
router.get("/archive", async (req, res) => {
  try {
    const { user } = await getMe(req);

    const reports = await prisma.inspectionReport.findMany({
      where: {
        inspectorUserId: user.id,
      },
      orderBy: { createdAt: "desc" },
      include: {
        cashout: true,
        car: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            coverUrl: true,
          },
        },
        inspectionRequest: {
          select: {
            id: true,
            startAt: true,
            endAt: true,
            status: true,
          },
        },
      },
    });

    return res.json({ ok: true, reports });
  } catch (e: any) {
    console.error(e);
    return res.status(e?.status || 500).json({ error: e?.message || "Errore server" });
  }
});

/**
 * GET /api/inspection-reports/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const { user } = await getMe(req);
    const reportId = Number(req.params.id);
    if (!reportId) return res.status(400).json({ error: "ID resoconto non valido" });

    const report = await prisma.inspectionReport.findFirst({
      where: {
        id: reportId,
        inspectorUserId: user.id,
      },
      include: {
        cashout: true,
        car: true,
        inspectionRequest: true,
        inspectorUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!report) {
      return res.status(404).json({ error: "Resoconto non trovato" });
    }

    return res.json({ ok: true, report });
  } catch (e: any) {
    console.error(e);
    return res.status(e?.status || 500).json({ error: e?.message || "Errore server" });
  }
});

/**
 * POST /api/inspection-reports
 */
router.post("/", async (req, res) => {
  try {
    const { user, profile } = await getMe(req);

    const {
      inspectionRequestId,
      title,
      overallStatus,
      plate,
      vin,
      km,
      inspectionDate,
      location,
      bodyworkNotes,
      interiorNotes,
      engineNotes,
      mechanicsNotes,
      tiresNotes,
      electronicsNotes,
      testDriveNotes,
      defectsFound,
      finalOpinion,
      estimatedValue,
    } = req.body ?? {};

    const inspectionRequestIdNum = Number(inspectionRequestId);
    if (!inspectionRequestIdNum) {
      return res.status(400).json({ error: "inspectionRequestId obbligatorio" });
    }

    const inspection = await prisma.inspectionRequest.findUnique({
      where: { id: inspectionRequestIdNum },
      include: {
        car: true,
        report: true,
      },
    });

    if (!inspection) {
      return res.status(404).json({ error: "Richiesta perizia non trovata" });
    }

    if (inspection.inspectorId !== profile.id) {
      return res.status(403).json({ error: "Non autorizzato su questa perizia" });
    }

    if (inspection.status !== "CONFIRMED") {
      return res.status(400).json({ error: "La perizia deve essere prima confermata" });
    }

    if (inspection.report) {
      return res.status(409).json({ error: "Resoconto già esistente per questa perizia" });
    }

    const created = await prisma.$transaction(async (tx) => {
      const report = await tx.inspectionReport.create({
        data: {
          inspectionRequestId: inspection.id,
          inspectorUserId: user.id,
          carId: inspection.carId,
          title: title ?? null,
          overallStatus: overallStatus ?? null,
          plate: plate ?? null,
          vin: vin ?? null,
          km: km != null && km !== "" ? Number(km) : null,
          inspectionDate: inspectionDate ? new Date(inspectionDate) : new Date(),
          location: location ?? null,
          bodyworkNotes: bodyworkNotes ?? null,
          interiorNotes: interiorNotes ?? null,
          engineNotes: engineNotes ?? null,
          mechanicsNotes: mechanicsNotes ?? null,
          tiresNotes: tiresNotes ?? null,
          electronicsNotes: electronicsNotes ?? null,
          testDriveNotes: testDriveNotes ?? null,
          defectsFound: defectsFound ?? null,
          finalOpinion: finalOpinion ?? null,
          estimatedValue:
            estimatedValue != null && estimatedValue !== ""
              ? Number(estimatedValue)
              : null,
        },
        include: {
          cashout: true,
          car: true,
          inspectionRequest: true,
        },
      });

      await tx.inspectionRequest.update({
        where: { id: inspection.id },
        data: { status: "DONE" },
      });

      await tx.car.update({
        where: { id: inspection.carId },
        data: {
          isPeriziata: true,
          periziaUploadedAt: new Date(),
          periziaDocUrl: `/cars/${inspection.carId}/perizia/download`,
        },
      });

      return report;
    });

    return res.status(201).json({ ok: true, report: created });
  } catch (e: any) {
    console.error(e);
    return res.status(e?.status || 500).json({ error: e?.message || "Errore server" });
  }
});

/**
 * GET /api/inspection-reports/:id/pdf
 */
router.get("/:id/pdf", async (req, res) => {
  try {
    const { user } = await getMe(req);
    const reportId = Number(req.params.id);
    if (!reportId) return res.status(400).json({ error: "ID resoconto non valido" });

    const report = await prisma.inspectionReport.findFirst({
      where: {
        id: reportId,
        inspectorUserId: user.id,
      },
      include: {
        cashout: true,
        car: true,
        inspectionRequest: true,
        inspectorUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!report) {
      return res.status(404).json({ error: "Resoconto non trovato" });
    }

    const pdf = await buildPdfBuffer(report);

    const safeMake = report.car?.make?.replace(/\s+/g, "-") || "auto";
    const safeModel = report.car?.model?.replace(/\s+/g, "-") || "veicolo";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="resoconto-${safeMake}-${safeModel}-${report.id}.pdf"`
    );

    return res.send(pdf);
  } catch (e: any) {
    console.error(e);
    return res.status(e?.status || 500).json({ error: e?.message || "Errore server" });
  }
});

/**
 * DELETE /api/inspection-reports/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const { user } = await getMe(req);
    const reportId = Number(req.params.id);
    if (!reportId) return res.status(400).json({ error: "ID resoconto non valido" });

    const report = await prisma.inspectionReport.findFirst({
      where: {
        id: reportId,
        inspectorUserId: user.id,
      },
      include: {
        cashout: true,
      },
    });

    if (!report) {
      return res.status(404).json({ error: "Resoconto non trovato" });
    }

    if (report.cashout) {
      return res.status(409).json({
        error: "Non puoi eliminare un resoconto con cashout già richiesto",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.inspectionReport.delete({
        where: { id: report.id },
      });

      await tx.inspectionRequest.update({
        where: { id: report.inspectionRequestId },
        data: { status: "CONFIRMED" },
      });

      await tx.car.update({
        where: { id: report.carId },
        data: {
          isPeriziata: false,
          periziaUploadedAt: null,
        },
      });
    });

    return res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return res.status(e?.status || 500).json({ error: e?.message || "Errore server" });
  }
});

export default router;
