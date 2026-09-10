import PDFDocument = require("pdfkit");

const CATEGORY_LABELS: Record<string, string> = {
  BODYWORK: "Carrozzeria",
  INTERIOR: "Interni",
  ENGINE: "Motore",
  MECHANICS: "Meccanica",
  TIRES: "Pneumatici",
  ELECTRONICS: "Elettronica",
  TEST_DRIVE: "Test drive",
};

const SCORE_LABELS: Record<number, string> = {
  1: "Da buttare",
  2: "Danneggiato",
  3: "Normale",
  4: "Buone condizioni",
  5: "Come nuovo",
};

export function buildPdfBuffer(report: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
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
    line(
      "Data creazione",
      report.createdAt ? new Date(report.createdAt).toLocaleString("it-IT") : "-"
    );
    line(
      "Data perizia",
      report.inspectionDate ? new Date(report.inspectionDate).toLocaleString("it-IT") : "-"
    );
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
    line(
      "Valore stimato",
      report.estimatedValue != null ? `${report.estimatedValue} €` : "-"
    );

    doc.moveDown();

    const ratings = Array.isArray(report.ratings) ? report.ratings : [];
    if (ratings.length > 0) {
      doc.fontSize(15).font("Helvetica-Bold").text("Valutazione visuale 1-5");
      doc
        .fontSize(9.5)
        .font("Helvetica")
        .text("Scala: 1 Da buttare · 2 Danneggiato · 3 Normale · 4 Buone condizioni · 5 Come nuovo");
      doc.moveDown(0.4);

      const categories = Object.keys(CATEGORY_LABELS);
      for (const category of categories) {
        const items = ratings.filter((rating: any) => rating.category === category);
        if (!items.length) continue;

        const average =
          Math.round(
            (items.reduce((sum: number, item: any) => sum + Number(item.score || 0), 0) /
              items.length) *
              10
          ) / 10;

        doc.fontSize(13).font("Helvetica-Bold").text(
          `${CATEGORY_LABELS[category]} - media ${average}/5`
        );
        doc.moveDown(0.2);

        for (const item of items) {
          const score = Number(item.score || 0);
          doc
            .fontSize(10.5)
            .font("Helvetica-Bold")
            .text(`${item.pointLabel}: ${score}/5`, { continued: true });
          doc
            .font("Helvetica")
            .text(` - ${SCORE_LABELS[score] || ""}`);
          if (item.note?.trim()) {
            doc.font("Helvetica-Oblique").text(`Nota: ${item.note.trim()}`);
          }
          doc.moveDown(0.2);
        }
        doc.moveDown(0.5);
      }
    } else {
      // Compatibilità con i resoconti creati prima della perizia visuale.
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
    }

    doc.moveDown();
    doc.fontSize(13).font("Helvetica-Bold").text("Parere finale");
    doc.moveDown(0.2);
    doc.fontSize(11).font("Helvetica").text(report.finalOpinion?.trim() || "-");

    if (report.valuationOpinion?.trim()) {
      doc.moveDown();
      doc.fontSize(13).font("Helvetica-Bold").text("Parere sulla valutazione dell'auto");
      doc.moveDown(0.2);
      doc.fontSize(11).font("Helvetica").text(report.valuationOpinion.trim());
    }

    doc.end();
  });
}
