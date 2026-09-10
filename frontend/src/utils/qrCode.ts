import QRCode from "qrcode";

function safeFilePart(value: string | number | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`Impossibile caricare immagine: ${src}`));

    img.src = src;
  });
}

export async function downloadCarQrCode(params: {
  qrUrl: string;
  carId: number;
  make?: string;
  model?: string;
}) {
  const qrDataUrl = await QRCode.toDataURL(params.qrUrl, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "H",
  });

  const frame = await loadImage("/ascari-qr-frame.png");
  const qr = await loadImage(qrDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas non disponibile");
  }

  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);

  const qrSize = 720;
  const qrX = 65;
  const qrY = 125;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX, qrY, qrSize, qrSize);

  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);

  ctx.font = "bold 26px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText("SCAN TO VIEW CAR DETAILS", canvas.width / 2, 905);

  const finalImage = canvas.toDataURL("image/png");

  const make = safeFilePart(params.make || "ascari");
  const model = safeFilePart(params.model || "car");

  const a = document.createElement("a");
  a.href = finalImage;
  a.download = `ascari-qr-${make}-${model}-${params.carId}.png`;

  document.body.appendChild(a);
  a.click();
  a.remove();
}