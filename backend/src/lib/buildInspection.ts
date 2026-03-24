import PDFDocument = require("pdfkit");

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
}