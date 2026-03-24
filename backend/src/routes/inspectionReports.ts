import { Router } from "express";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";
import PDFDocument from "pdfkit";
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

/* function buildPdfBuffer(report: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const line = (label: string, value?: string | number | null) => {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
      doc.font("Helvetica").text(value != null && value !== "" ? String(value) : "-");
    };

    doc.fontSize(20).font("Helvetica-Bold").text("ASCARI - Resoconto Perizia", {
      align: "center",
    });

    doc.moveDown();
    doc.fontSize(11);

    line("ID Resoconto", report.id);
    line("Data creazione", new Date(report.createdAt).toLocaleString("it-IT"));
    line("Data perizia", report.inspectionDate ? new Date(report.inspectionDate).toLocaleString("it-IT") : "-");
    line("Periziatore", report.inspectorUser?.name || report.inspectorUser?.email || "-");
    line(
      "Auto",
      `${report.car?.make ?? "-"} ${report.car?.model ?? "-"} (${report.car?.year ?? "-"})`
    );
    line("Titolo", report.title);
    line("Targa", report.plate);
    line("VIN", report.vin);
    line("KM", report.km);
    line("Luogo", report.location);
    line("Esito generale", report.overallStatus);
    line("Valore stimato", report.estimatedValue != null ? `${report.estimatedValue} €` : "-");

    doc.moveDown();

    const section = (title: string, value?: string | null) => {
      doc.fontSize(13).font("Helvetica-Bold").text(title);
      doc.moveDown(0.2);
      doc.fontSize(11).font("Helvetica").text(value?.trim() ? value : "-");
      doc.moveDown();
    };

    section("Carrozzeria", report.bodyworkNotes);
    section("Interni", report.interiorNotes);
    section("Motore", report.engineNotes);
    section("Meccanica", report.mechanicsNotes);
    section("Pneumatici", report.tiresNotes);
    section("Elettronica", report.electronicsNotes);
    section("Test drive", report.testDriveNotes);
    section("Difetti riscontrati", report.defectsFound);
    section("Parere finale", report.finalOpinion);

    doc.end();
  });
} */

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
    });

    if (!report) {
      return res.status(404).json({ error: "Resoconto non trovato" });
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