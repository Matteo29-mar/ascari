import QRCode from "qrcode";

function safeFilePart(value: string | number | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

export async function downloadCarQrCode(params: {
  qrUrl: string;
  carId: number;
  make?: string;
  model?: string;
}) {
  const dataUrl = await QRCode.toDataURL(params.qrUrl, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "H",
  });

  const a = document.createElement("a");

  const make = safeFilePart(params.make || "ascari");
  const model = safeFilePart(params.model || "car");

  a.href = dataUrl;
  a.download = `ascari-qr-${make}-${model}-${params.carId}.png`;

  document.body.appendChild(a);
  a.click();
  a.remove();
}