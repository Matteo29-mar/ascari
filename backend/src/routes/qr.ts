import express from "express";
import { prisma } from "../prisma";
import {
  buildCarPublicUrl,
  createVisitorId,
  getVisitorHash,
} from "../lib/carQr";

const router = express.Router();

router.get("/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();

  if (!token) {
    return res.status(400).send("QR non valido");
  }

  try {
    const car = await prisma.car.findUnique({
      where: {
        qrToken: token,
      },
      select: {
        id: true,
        marketStatus: true,
        visuallyRemovedAt: true,
      },
    });

    if (!car) {
      return res.status(404).send("QR non trovato");
    }

    let visitorId = req.cookies?.ascari_qr_visitor;

    if (!visitorId) {
      visitorId = createVisitorId();

      res.cookie("ascari_qr_visitor", visitorId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 365,
      });
    }

    const visitorHash = getVisitorHash(visitorId);
    const userAgent = req.get("user-agent") || null;

    await prisma.qrScan.create({
      data: {
        carId: car.id,
        visitorHash,
        userAgent,
      },
    });

    return res.redirect(302, buildCarPublicUrl(car.id));
  } catch (e) {
    console.error("GET /qr/:token error:", e);
    return res.status(500).send("Errore QR");
  }
});

export default router;