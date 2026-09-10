// backend/src/routes/history.ts

import { Router } from "express";
import PDFDocument from "pdfkit";
import { getAuth } from "@clerk/express";
import { prisma } from "../prisma";
import { ensureUserInDb } from "../lib/authUser";

const router = Router();

async function requireMe(req: any) {
  const { userId: clerkId } = getAuth(req);

  if (!clerkId) {
    const err: any = new Error("Not authenticated");
    err.status = 401;
    throw err;
  }

  return ensureUserInDb(clerkId);
}

function toSafeString(value: any, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function formatEuro(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toLocaleString("it-IT")} €`;
}

function formatDate(value: any) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function normalizeJsonObject(value: any): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, any>;
}

function getHistoryRole(history: any, userId: string): "BOUGHT" | "SOLD" {
  return history.buyerId === userId ? "BOUGHT" : "SOLD";
}

function mapHistoryItem(history: any, userId: string) {
  const role = getHistoryRole(history, userId);
  const carSnapshot = normalizeJsonObject(history.carSnapshot);
  const inspectionSnapshot = normalizeJsonObject(history.inspectionSnapshot);

  const counterparty = role === "SOLD" ? history.buyer : history.seller;

  return {
    id: history.id,
    role,
    label: role === "SOLD" ? "Vendita" : "Acquisto",
    status: role === "SOLD" ? "VENDUTA" : "COMPRATA",

    amountEur: history.amountEur,
    ascariFeeEur: history.ascariFeeEur,
    sellerNetEur: history.sellerNetEur,
    currency: history.currency,

    soldAt: history.soldAt,
    createdAt: history.createdAt,

    car: {
      id: history.carId,
      make: carSnapshot.make ?? history.car?.make ?? null,
      model: carSnapshot.model ?? history.car?.model ?? null,
      title: carSnapshot.title ?? history.car?.title ?? null,
      year: carSnapshot.year ?? history.car?.year ?? null,
      coverUrl: carSnapshot.coverUrl ?? history.car?.coverUrl ?? null,
      photos: carSnapshot.photos ?? history.car?.photos ?? [],
      mileageKm: carSnapshot.mileageKm ?? history.car?.mileageKm ?? null,
      fuelType: carSnapshot.fuelType ?? history.car?.fuelType ?? null,
      transmission: carSnapshot.transmission ?? history.car?.transmission ?? null,
      city: carSnapshot.city ?? history.car?.city ?? null,
      locationText: carSnapshot.locationText ?? history.car?.locationText ?? null,
      isPeriziata: carSnapshot.isPeriziata ?? history.car?.isPeriziata ?? false,
    },

    counterparty: counterparty
      ? {
          id: counterparty.id,
          name: counterparty.name,
          email: counterparty.email,
        }
      : null,

    buyer: history.buyer
      ? {
          id: history.buyer.id,
          name: history.buyer.name,
          email: history.buyer.email,
        }
      : null,

    seller: history.seller
      ? {
          id: history.seller.id,
          name: history.seller.name,
          email: history.seller.email,
        }
      : null,

    hasInspection: !!history.inspectionSnapshot,
    inspection: history.inspectionSnapshot ? inspectionSnapshot : null,
  };
}

function addPdfTitle(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  doc
    .fontSize(22)
    .fillColor("#111827")
    .text(title, {
      align: "left",
    });

  if (subtitle) {
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#6b7280").text(subtitle);
  }

  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").stroke();
  doc.moveDown(1);
}

function addPdfSection(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.8);
  doc.fontSize(15).fillColor("#111827").text(title);
  doc.moveDown(0.4);
}

function addPdfRow(doc: PDFKit.PDFDocument, label: string, value: any) {
  const y = doc.y;

  doc.fontSize(10).fillColor("#6b7280").text(label, 50, y, {
    width: 160,
  });

  doc.fontSize(10).fillColor("#111827").text(toSafeString(value), 215, y, {
    width: 320,
  });

  doc.moveDown(0.55);
}

function addLongText(doc: PDFKit.PDFDocument, label: string, value: any) {
  doc.fontSize(10).fillColor("#6b7280").text(label);
  doc.moveDown(0.15);
  doc.fontSize(10).fillColor("#111827").text(toSafeString(value), {
    width: 495,
    align: "left",
  });
  doc.moveDown(0.6);
}

async function buildHistoryPdfBuffer(history: any, userId: string): Promise<Buffer> {
  const role = getHistoryRole(history, userId);
  const car = normalizeJsonObject(history.carSnapshot);
  const inspection = normalizeJsonObject(history.inspectionSnapshot);
  const counterparty = role === "SOLD" ? history.buyer : history.seller;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Storico ${role === "SOLD" ? "vendita" : "acquisto"} Ascari`,
        Author: "Ascari",
      },
    });

    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    addPdfTitle(
      doc,
      role === "SOLD" ? "Storico vendita auto" : "Storico acquisto auto",
      "Documento generato da ASCARI"
    );

    addPdfSection(doc, "Riepilogo operazione");
    addPdfRow(doc, "Stato", role === "SOLD" ? "VENDUTA" : "COMPRATA");
    addPdfRow(doc, "Data vendita", formatDate(history.soldAt));
    addPdfRow(doc, "Importo vendita", formatEuro(history.amountEur));
    addPdfRow(doc, "Commissione Ascari", formatEuro(history.ascariFeeEur));
    addPdfRow(doc, "Netto venditore", formatEuro(history.sellerNetEur));
    addPdfRow(doc, "Valuta", toSafeString(history.currency).toUpperCase());

    addPdfSection(doc, "Auto");
    addPdfRow(doc, "Titolo", car.title);
    addPdfRow(doc, "Marca", car.make);
    addPdfRow(doc, "Modello", car.model);
    addPdfRow(doc, "Anno", car.year);
    addPdfRow(doc, "Allestimento", car.trimLevel);
    addPdfRow(doc, "Colore", car.color);
    addPdfRow(doc, "Cambio", car.transmission);
    addPdfRow(doc, "Alimentazione", car.fuelType);
    addPdfRow(doc, "Motore", car.engine);
    addPdfRow(doc, "Potenza", car.horsepower ? `${car.horsepower} CV` : "-");
    addPdfRow(doc, "Coppia", car.torqueNm ? `${car.torqueNm} Nm` : "-");
    addPdfRow(doc, "Trazione", car.drivetrain);
    addPdfRow(doc, "Chilometraggio", car.mileageKm ? `${car.mileageKm.toLocaleString("it-IT")} km` : "-");
    addPdfRow(doc, "Città", car.city);
    addPdfRow(doc, "Indirizzo", car.locationText);
    addPdfRow(doc, "Periziata", car.isPeriziata ? "Sì" : "No");

    if (car.description) {
      addLongText(doc, "Descrizione", car.description);
    }

    addPdfSection(doc, role === "SOLD" ? "Acquirente" : "Venditore");
    addPdfRow(doc, "Nome", counterparty?.name);
    addPdfRow(doc, "Email", counterparty?.email);

    addPdfSection(doc, "Dettagli pagamento");
    addPdfRow(doc, "Payment ID interno", history.paymentId);
    addPdfRow(doc, "Stripe PaymentIntent", history.stripePaymentIntentId);
    addPdfRow(doc, "Stripe Charge", history.stripeChargeId);

    if (history.inspectionSnapshot) {
      addPdfSection(doc, "Esito perizia");
      addPdfRow(doc, "Titolo", inspection.title);
      addPdfRow(doc, "Stato generale", inspection.overallStatus);
      addPdfRow(doc, "Targa", inspection.plate);
      addPdfRow(doc, "VIN", inspection.vin);
      addPdfRow(doc, "KM rilevati", inspection.km);
      addPdfRow(doc, "Data perizia", formatDate(inspection.inspectionDate));
      addPdfRow(doc, "Luogo", inspection.location);
      addPdfRow(doc, "Valore stimato", inspection.estimatedValue ? formatEuro(inspection.estimatedValue) : "-");

      addLongText(doc, "Carrozzeria", inspection.bodyworkNotes);
      addLongText(doc, "Interni", inspection.interiorNotes);
      addLongText(doc, "Motore", inspection.engineNotes);
      addLongText(doc, "Meccanica", inspection.mechanicsNotes);
      addLongText(doc, "Pneumatici", inspection.tiresNotes);
      addLongText(doc, "Elettronica", inspection.electronicsNotes);
      addLongText(doc, "Test drive", inspection.testDriveNotes);
      addLongText(doc, "Difetti riscontrati", inspection.defectsFound);
      addLongText(doc, "Opinione finale", inspection.finalOpinion);
    } else {
      addPdfSection(doc, "Esito perizia");
      addPdfRow(doc, "Perizia", "Nessun resoconto perizia associato allo storico");
    }

    doc.moveDown(1.5);
    doc
      .fontSize(8)
      .fillColor("#6b7280")
      .text(
        "Questo documento rappresenta uno storico interno della piattaforma ASCARI. I dati dell'auto sono salvati come snapshot al momento della vendita ufficiale.",
        {
          align: "center",
        }
      );

    doc.end();
  });
}

/**
 * GET /api/history
 * Lista storici dell'utente loggato.
 * - Se sei seller: vedi voce VENDUTA
 * - Se sei buyer: vedi voce COMPRATA
 */
router.get("/", async (req, res) => {
  try {
    const me = await requireMe(req);

    const histories = await prisma.saleHistory.findMany({
      where: {
        OR: [{ buyerId: me.id }, { sellerId: me.id }],
      },
      include: {
        buyer: true,
        seller: true,
        car: true,
      },
      orderBy: {
        soldAt: "desc",
      },
    });

    return res.json({
      ok: true,
      history: histories.map((h) => mapHistoryItem(h, me.id)),
    });
  } catch (e: any) {
    console.error("GET /history error:", e);
    return res.status(e?.status || 500).json({
      error: e?.message || "Errore caricamento storico",
    });
  }
});

/**
 * GET /api/history/:id
 * Dettaglio singolo storico.
 */
router.get("/:id", async (req, res) => {
  try {
    const me = await requireMe(req);

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "history id non valido" });
    }

    const history = await prisma.saleHistory.findUnique({
      where: { id },
      include: {
        buyer: true,
        seller: true,
        car: true,
      },
    });

    if (!history) {
      return res.status(404).json({ error: "Storico non trovato" });
    }

    if (history.buyerId !== me.id && history.sellerId !== me.id) {
      return res.status(403).json({ error: "Storico non accessibile" });
    }

    return res.json({
      ok: true,
      history: mapHistoryItem(history, me.id),
    });
  } catch (e: any) {
    console.error("GET /history/:id error:", e);
    return res.status(e?.status || 500).json({
      error: e?.message || "Errore caricamento dettaglio storico",
    });
  }
});

/**
 * GET /api/history/:id/pdf
 * Scarica PDF dello storico.
 */
router.get("/:id/pdf", async (req, res) => {
  try {
    const me = await requireMe(req);

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "history id non valido" });
    }

    const history = await prisma.saleHistory.findUnique({
      where: { id },
      include: {
        buyer: true,
        seller: true,
        car: true,
      },
    });

    if (!history) {
      return res.status(404).json({ error: "Storico non trovato" });
    }

    if (history.buyerId !== me.id && history.sellerId !== me.id) {
      return res.status(403).json({ error: "Storico non accessibile" });
    }

    const role = getHistoryRole(history, me.id);
    const car = normalizeJsonObject(history.carSnapshot);

    const safeMake = toSafeString(car.make, "auto")
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .toLowerCase();

    const safeModel = toSafeString(car.model, "storico")
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .toLowerCase();

    const filename = `ascari-storico-${role === "SOLD" ? "vendita" : "acquisto"}-${safeMake}-${safeModel}-${history.id}.pdf`;

    const pdfBuffer = await buildHistoryPdfBuffer(history, me.id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (e: any) {
    console.error("GET /history/:id/pdf error:", e);
    return res.status(e?.status || 500).json({
      error: e?.message || "Errore generazione PDF storico",
    });
  }
});

export default router;