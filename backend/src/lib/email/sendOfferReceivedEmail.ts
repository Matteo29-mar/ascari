import {
  emailNotificationsEnabled,
  getResendClient,
} from "./resendClient";

type SendOfferReceivedEmailInput = {
  offerId: number;

  sellerEmail: string;
  sellerName?: string | null;

  buyerEmail: string;
  buyerName?: string | null;

  carId: number;
  carTitle: string;
  carMake: string;
  carModel: string;
  carCoverUrl?: string | null;
  carPhotos?: string[] | null;
  isPeriziata: boolean;

  amount: number;
};

export type SendOfferReceivedEmailResult =
  | {
      skipped: true;
      reason: string;
    }
  | {
      skipped: false;
      emailId: string | null;
      recipient: string;
    };

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} non definita`);
  }

  return value;
}

function removeTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFirstName(name?: string | null): string {
  const normalized = name?.trim();

  if (!normalized) {
    return "utente";
  }

  return normalized.split(/\s+/)[0];
}

function resolveImageUrl(
  coverUrl?: string | null,
  photos?: string[] | null
): string {
  const frontendUrl = removeTrailingSlash(requireEnv("FRONTEND_URL"));

  const backendUrl = removeTrailingSlash(
    process.env.BACKEND_PUBLIC_URL?.trim() ||
      "http://localhost:4002"
  );

  const s3PublicBase = process.env.ASCARI_CAR_IMAGES_PUBLIC_BASE_URL
    ? removeTrailingSlash(
        process.env.ASCARI_CAR_IMAGES_PUBLIC_BASE_URL.trim()
      )
    : null;

  const rawImage =
    coverUrl?.trim() ||
    photos?.find(
      (photo): photo is string =>
        typeof photo === "string" && photo.trim().length > 0
    )?.trim();

  if (!rawImage) {
    return `${frontendUrl}/cars/placeholder.jpg`;
  }

  // URL già assoluto, per esempio S3.
  if (/^https?:\/\//i.test(rawImage)) {
    return rawImage;
  }

  // Immagine salvata localmente dal backend.
  if (
    rawImage.startsWith("/uploads/") ||
    rawImage.startsWith("uploads/")
  ) {
    return `${backendUrl}/${rawImage.replace(/^\/+/, "")}`;
  }

  // File pubblico del frontend.
  if (rawImage.startsWith("/")) {
    return `${frontendUrl}${rawImage}`;
  }

  // Chiave relativa di un oggetto S3.
  if (s3PublicBase) {
    return `${s3PublicBase}/${rawImage.replace(/^\/+/, "")}`;
  }

  return `${frontendUrl}/${rawImage.replace(/^\/+/, "")}`;
}

function formatEuro(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export async function sendOfferReceivedEmail(
  input: SendOfferReceivedEmailInput
): Promise<SendOfferReceivedEmailResult> {
  if (!emailNotificationsEnabled()) {
    return {
      skipped: true,
      reason: "EMAIL_NOTIFICATIONS_ENABLED non è true",
    };
  }

  const frontendUrl = removeTrailingSlash(requireEnv("FRONTEND_URL"));
  const from = requireEnv("EMAIL_FROM");

  const testRecipient =
    process.env.EMAIL_TEST_RECIPIENT?.trim() || null;

  const recipient = testRecipient || input.sellerEmail.trim();

  if (!recipient) {
    throw new Error("Email venditore non disponibile");
  }

  const carTitle =
    input.carTitle?.trim() ||
    `${input.carMake} ${input.carModel}`.trim();

  const sellerFirstName = getFirstName(input.sellerName);

  const buyerDisplayName =
    input.buyerName?.trim() || input.buyerEmail;

  const formattedAmount = formatEuro(input.amount);
  const imageUrl = resolveImageUrl(
    input.carCoverUrl,
    input.carPhotos
  );

  const logoUrl = `${frontendUrl}/logos/logocut.png`;

  const offerUrl = new URL("/offers", `${frontendUrl}/`);
  offerUrl.searchParams.set("offerId", String(input.offerId));

  const safeSellerName = escapeHtml(sellerFirstName);
  const safeBuyerName = escapeHtml(buyerDisplayName);
  const safeCarTitle = escapeHtml(carTitle);
  const safeAmount = escapeHtml(formattedAmount);
  const safeImageUrl = escapeHtml(imageUrl);
  const safeLogoUrl = escapeHtml(logoUrl);
  const safeOfferUrl = escapeHtml(offerUrl.toString());
  const periziaText = input.isPeriziata ? "Sì" : "No";

  const subject =
    `Gentile ${sellerFirstName}, ` +
    `hai ricevuto un'offerta per ${carTitle}`;

  const html = `
<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>${escapeHtml(subject)}</title>
  </head>

  <body
    style="
      margin: 0;
      padding: 0;
      background-color: #080d12;
      font-family: Arial, Helvetica, sans-serif;
      color: #f8fafc;
    "
  >
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="background-color: #080d12; padding: 30px 12px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="
              max-width: 620px;
              background-color: #151b21;
              border: 1px solid #303841;
              border-radius: 18px;
              overflow: hidden;
            "
          >
            <tr>
              <td
                style="
                  padding: 24px 28px;
                  border-bottom: 1px solid #303841;
                "
              >
                <table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                >
                  <tr>
                    <td style="vertical-align: middle;">
                      <img
                        src="${safeLogoUrl}"
                        width="42"
                        height="42"
                        alt="Ascari"
                        style="
                          display: block;
                          width: 42px;
                          height: 42px;
                          border-radius: 8px;
                        "
                      >
                    </td>

                    <td
                      style="
                        vertical-align: middle;
                        padding-left: 12px;
                        font-size: 22px;
                        font-weight: 800;
                        letter-spacing: 1px;
                        color: #ffffff;
                      "
                    >
                      ASCARI
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding: 30px 28px 18px 28px;">
                <h1
                  style="
                    margin: 0 0 14px 0;
                    font-size: 27px;
                    line-height: 1.25;
                    color: #ffffff;
                  "
                >
                  Hai ricevuto una nuova offerta
                </h1>

                <p
                  style="
                    margin: 0;
                    color: #aeb9c4;
                    font-size: 16px;
                    line-height: 1.7;
                  "
                >
                  Gentile ${safeSellerName}, un compratore ha inviato
                  un'offerta per la tua auto.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding: 0 28px;">
                <img
                  src="${safeImageUrl}"
                  alt="${safeCarTitle}"
                  width="564"
                  style="
                    display: block;
                    width: 100%;
                    max-width: 564px;
                    height: 260px;
                    object-fit: cover;
                    border-radius: 14px;
                    border: 1px solid #303841;
                  "
                >
              </td>
            </tr>

            <tr>
              <td style="padding: 24px 28px;">
                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="
                    background-color: #0e141a;
                    border: 1px solid #303841;
                    border-radius: 14px;
                  "
                >
                  <tr>
                    <td style="padding: 22px;">
                      <div
                        style="
                          color: #ffffff;
                          font-size: 21px;
                          line-height: 1.3;
                          font-weight: 800;
                          margin-bottom: 18px;
                        "
                      >
                        ${safeCarTitle}
                      </div>

                      <table
                        role="presentation"
                        width="100%"
                        cellspacing="0"
                        cellpadding="0"
                        border="0"
                      >
                        <tr>
                          <td
                            style="
                              padding: 8px 0;
                              color: #8ea0b2;
                              font-size: 15px;
                            "
                          >
                            Offerta ricevuta
                          </td>

                          <td
                            align="right"
                            style="
                              padding: 8px 0;
                              color: #00efb5;
                              font-size: 19px;
                              font-weight: 800;
                            "
                          >
                            ${safeAmount}
                          </td>
                        </tr>

                        <tr>
                          <td
                            style="
                              padding: 8px 0;
                              color: #8ea0b2;
                              font-size: 15px;
                            "
                          >
                            Compratore
                          </td>

                          <td
                            align="right"
                            style="
                              padding: 8px 0;
                              color: #ffffff;
                              font-size: 15px;
                              font-weight: 700;
                            "
                          >
                            ${safeBuyerName}
                          </td>
                        </tr>

                        <tr>
                          <td
                            style="
                              padding: 8px 0;
                              color: #8ea0b2;
                              font-size: 15px;
                            "
                          >
                            Auto periziata
                          </td>

                          <td
                            align="right"
                            style="
                              padding: 8px 0;
                              color: #ffffff;
                              font-size: 15px;
                              font-weight: 700;
                            "
                          >
                            ${periziaText}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td
                align="center"
                style="padding: 0 28px 32px 28px;"
              >
                <a
                  href="${safeOfferUrl}"
                  target="_blank"
                  style="
                    display: inline-block;
                    background-color: #00efb5;
                    color: #04100d;
                    text-decoration: none;
                    font-weight: 800;
                    font-size: 16px;
                    padding: 15px 28px;
                    border-radius: 10px;
                  "
                >
                  Visualizza l'offerta
                </a>

                <p
                  style="
                    margin: 20px 0 0 0;
                    color: #82909e;
                    font-size: 13px;
                    line-height: 1.6;
                  "
                >
                  Accedi ad Ascari per accettare o rifiutare
                  l'offerta.
                </p>
              </td>
            </tr>

            <tr>
              <td
                style="
                  padding: 20px 28px;
                  background-color: #0e141a;
                  border-top: 1px solid #303841;
                  color: #778593;
                  font-size: 12px;
                  line-height: 1.5;
                  text-align: center;
                "
              >
                Questa è una comunicazione automatica relativa
                al tuo account Ascari.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  const text = `
Gentile ${sellerFirstName},

hai ricevuto una nuova offerta per ${carTitle}.

Offerta ricevuta: ${formattedAmount}
Compratore: ${buyerDisplayName}
Auto periziata: ${periziaText}

Visualizza, accetta o rifiuta l'offerta:
${offerUrl.toString()}

Ascari
  `.trim();

  const resend = getResendClient();

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [recipient],
      subject,
      html,
      text,
      tags: [
        {
          name: "event",
          value: "offer_received",
        },
        {
          name: "offer_id",
          value: String(input.offerId),
        },
      ],
    },
    {
      idempotencyKey: `offer-received/${input.offerId}`,
    }
  );

  if (error) {
    throw new Error(
      `Resend non ha inviato l'email: ${error.message}`
    );
  }

  return {
    skipped: false,
    emailId: data?.id ?? null,
    recipient,
  };
}