import "dotenv/config";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { PrismaClient, ArveMarketDataQuality } from "@prisma/client";

const prisma = new PrismaClient();
const SOURCE = "ASCARI_ARVE_XLSX";
const REFERENCE_YEARS = [2010, 2015, 2020, 2025] as const;

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function qualityFromStatus(statusValue: unknown): ArveMarketDataQuality {
  const status = normalize(statusValue);

  if (status.includes("prezzo verificato")) return "VERIFIED";
  if (status.includes("prezzo aggregato")) return "AGGREGATED";
  if (status.includes("stima arve modellistica")) return "MODEL_ESTIMATE";
  return "TO_VALIDATE";
}

function isVehicleSheet(rows: Record<string, unknown>[]): boolean {
  if (!rows.length) return false;
  const sample = rows[0];
  return (
    Object.prototype.hasOwnProperty.call(sample, "Marchio") &&
    Object.prototype.hasOwnProperty.call(sample, "Modello") &&
    Object.prototype.hasOwnProperty.call(sample, "Alimentazione")
  );
}

async function main() {
  const configuredPath = process.env.ARVE_MARKET_XLSX_PATH?.trim();
  const workbookPath = configuredPath
    ? path.resolve(configuredPath)
    : path.resolve(__dirname, "../data/prezzi-ascari-arve.xlsx");

  if (!fs.existsSync(workbookPath)) {
    throw new Error(
      `File prezzi ARVE non trovato: ${workbookPath}. Configura ARVE_MARKET_XLSX_PATH oppure copia il file in backend/data/prezzi-ascari-arve.xlsx`
    );
  }

  const stat = fs.statSync(workbookPath);
  const sourceVersion =
    process.env.ARVE_MARKET_SOURCE_VERSION?.trim() ||
    `${path.basename(workbookPath)}:${stat.mtime.toISOString().slice(0, 10)}`;

  const workbook = XLSX.readFile(workbookPath, {
    cellDates: false,
    dense: false,
  });

  const references: Array<{
    make: string;
    model: string;
    trimLevel: string | null;
    fuelType: string;
    makeNormalized: string;
    modelNormalized: string;
    fuelNormalized: string;
    referenceYear: number;
    kmMin: number | null;
    kmMax: number | null;
    priceMin: number;
    priceMax: number;
    quality: ArveMarketDataQuality;
    qualityNote: string | null;
    source: string;
    sourceVersion: string;
  }> = [];

  const sheetStats: Record<string, number> = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });

    if (!isVehicleSheet(rows)) continue;

    let sheetCount = 0;

    for (const row of rows) {
      const make = text(row["Marchio"]);
      const model = text(row["Modello"]);
      const trimLevel = text(row["Allestimenti (unica cella)"]) || null;
      const fuelType = text(row["Alimentazione"]);
      const qualityNote = text(row["Stato verifica"]) || null;

      if (!make || !model || !fuelType) continue;

      for (const referenceYear of REFERENCE_YEARS) {
        const priceMin = numberOrNull(row[`RV ${referenceYear} - Prezzo min`]);
        const priceMax = numberOrNull(row[`RV ${referenceYear} - Prezzo max`]);

        if (!priceMin || !priceMax || priceMin <= 0 || priceMax <= 0) continue;

        const normalizedMin = Math.min(priceMin, priceMax);
        const normalizedMax = Math.max(priceMin, priceMax);

        references.push({
          make,
          model,
          trimLevel,
          fuelType,
          makeNormalized: normalize(make),
          modelNormalized: normalize(model),
          fuelNormalized: normalize(fuelType),
          referenceYear,
          kmMin: numberOrNull(row[`RV ${referenceYear} - Km min`]),
          kmMax: numberOrNull(row[`RV ${referenceYear} - Km max`]),
          priceMin: normalizedMin,
          priceMax: normalizedMax,
          quality: qualityFromStatus(qualityNote),
          qualityNote,
          source: SOURCE,
          sourceVersion,
        });

        sheetCount += 1;
      }
    }

    if (sheetCount) sheetStats[sheetName] = sheetCount;
  }

  if (!references.length) {
    throw new Error(
      "Nessun riferimento prezzo importabile trovato. Controlla le intestazioni del file Excel."
    );
  }

  // L'Excel è la fotografia corrente della baseline ARVE: sostituiamo soltanto
  // la precedente importazione della stessa sorgente, senza toccare dataset ASCARI.
  // La transazione evita di lasciare la tabella vuota in caso di import interrotto.
  const batchSize = 500;
  let inserted = 0;

  await prisma.$transaction(
    async (tx) => {
      await tx.arveMarketReference.deleteMany({
        where: { source: SOURCE },
      });

      for (let index = 0; index < references.length; index += batchSize) {
        const batch = references.slice(index, index + batchSize);
        const result = await tx.arveMarketReference.createMany({
          data: batch,
          skipDuplicates: true,
        });
        inserted += result.count;
      }
    },
    {
      timeout: 60_000,
    }
  );

  const qualityCounts = references.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.quality] = (acc[item.quality] || 0) + 1;
      return acc;
    },
    {}
  );

  console.log("============================================================");
  console.log("ARVE MARKET REFERENCE IMPORT");
  console.log("============================================================");
  console.log(`File            : ${workbookPath}`);
  console.log(`Versione        : ${sourceVersion}`);
  console.log(`Fogli veicoli   : ${Object.keys(sheetStats).length}`);
  console.log(`Riferimenti     : ${references.length}`);
  console.log(`Inseriti DB     : ${inserted}`);
  console.log(`VERIFIED        : ${qualityCounts.VERIFIED || 0}`);
  console.log(`AGGREGATED      : ${qualityCounts.AGGREGATED || 0}`);
  console.log(`MODEL_ESTIMATE  : ${qualityCounts.MODEL_ESTIMATE || 0}`);
  console.log(`TO_VALIDATE     : ${qualityCounts.TO_VALIDATE || 0}`);
  console.log("============================================================");
}

main()
  .catch((error) => {
    console.error("[ARVE_IMPORT] errore:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
