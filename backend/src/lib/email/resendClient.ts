import { Resend } from "resend";

let resendClient: Resend | null = null;

/**
 * Le email sono disabilitate di default.
 * Devono essere abilitate esplicitamente nel file .env.
 */
export function emailNotificationsEnabled(): boolean {
  return (
    (process.env.EMAIL_NOTIFICATIONS_ENABLED ?? "false")
      .trim()
      .toLowerCase() === "true"
  );
}

/**
 * Il client viene creato soltanto quando serve.
 * In questo modo il backend può partire anche se le email sono disabilitate.
 */
export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY non definita");
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}