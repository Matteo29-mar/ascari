export async function createFramedQrImage(
  qrDataUrl: string,
  frameUrl: string = "/ascari-qr-frame.png"
): Promise<string> {
  const frame = await loadImage(frameUrl);
  const qr = await loadImage(qrDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas non disponibile");
  }

  // Disegna prima la cornice
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);

  // Dimensione QR dentro la cornice
  const qrSize = Math.round(canvas.width * 0.68);

  // Posizione centrale
  const qrX = Math.round((canvas.width - qrSize) / 2);
  const qrY = Math.round((canvas.height - qrSize) / 2);

  // Sfondo bianco dietro al QR
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24);

  // Disegna QR
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}