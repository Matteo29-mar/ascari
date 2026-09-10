import React, { useMemo, useState } from "react";
import AscariPopup from "./AscariPopup";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useAuth } from "@clerk/clerk-react";
import { getPaymentStatus } from "../api";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

type Props = {
  open: boolean;
  clientSecret: string | null;
  paymentId: number | null;
  carTitle: string;
  amountEur: number;
  onClose: () => void;
};

function CheckoutForm({
  paymentId,
  carTitle,
  amountEur,
  onClose,
}: {
  paymentId: number;
  carTitle: string;
  amountEur: number;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { getToken } = useAuth();

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const returnUrl = useMemo(() => {
    const base = window.location.origin;

    // IMPORTANTISSIMO:
    // così la pagina /payments/return può sapere quale pagamento Ascari finalizzare
    return `${base}/payments/return?paymentId=${paymentId}`;
  }, [paymentId]);

  async function finalizePaymentInAscari() {
    const token = await getToken();

    if (!token) {
      throw new Error("Token mancante. Non posso finalizzare il pagamento in Ascari.");
    }

    const result = await getPaymentStatus(paymentId, token);

    if (!result?.ok) {
      throw new Error("Pagamento non finalizzato correttamente in Ascari.");
    }

    return result;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!stripe || !elements) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },

        // Con carta standard evita redirect inutile.
        // Se il metodo di pagamento richiede redirect, Stripe userà comunque return_url.
        redirect: "if_required",
      });

      if (result.error) {
        setErrorMsg(result.error.message || "Pagamento non completato");
        return;
      }

      // Se non c'è redirect, finalizziamo subito il pagamento nel backend Ascari.
      await finalizePaymentInAscari();

      setSuccessOpen(true);
    } catch (e: any) {
      setErrorMsg(
        e?.response?.data?.error ||
          e?.message ||
          "Errore durante la finalizzazione del pagamento"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (successOpen) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div
          style={{
            border: "1px solid rgba(52,211,153,0.35)",
            background: "rgba(52,211,153,0.08)",
            borderRadius: 18,
            padding: 18,
          }}
        >
          <h3 style={{ margin: "0 0 8px", color: "#b8ffe9" }}>
            Pagamento completato
          </h3>

          <p
            style={{
              margin: 0,
              color: "rgba(255,255,255,0.78)",
              lineHeight: 1.6,
            }}
          >
            Il pagamento è stato completato con successo. Ascari ha registrato
            l’operazione nello storico.
          </p>
        </div>

        <button
          type="button"
          className="btn"
          onClick={() => {
            onClose();
            window.location.href = "/history";
          }}
        >
          Vai allo storico
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 16,
          padding: 14,
        }}
      >
        <div className="muted" style={{ marginBottom: 6 }}>
          Auto
        </div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{carTitle}</div>
      </div>

      <div
        style={{
          border: "1px solid rgba(105,210,255,0.18)",
          background: "rgba(105,210,255,0.06)",
          borderRadius: 16,
          padding: 14,
        }}
      >
        <div className="muted" style={{ marginBottom: 6 }}>
          Totale da pagare
        </div>

        <div style={{ fontWeight: 800, fontSize: 24 }}>
          {new Intl.NumberFormat("it-IT", {
            style: "currency",
            currency: "EUR",
            maximumFractionDigits: 0,
          }).format(amountEur)}
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 16,
          padding: 14,
        }}
      >
        <PaymentElement />
      </div>

      {errorMsg && (
        <div
          style={{
            color: "#ffb4b4",
            border: "1px solid rgba(239,68,68,0.30)",
            background: "rgba(239,68,68,0.08)",
            padding: 12,
            borderRadius: 12,
            lineHeight: 1.5,
          }}
        >
          {errorMsg}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn secondary"
          onClick={onClose}
          disabled={submitting}
          style={{ flex: "1 1 180px" }}
        >
          Annulla
        </button>

        <button
          type="submit"
          className="btn"
          disabled={!stripe || !elements || submitting}
          style={{ flex: "1 1 220px" }}
        >
          {submitting
            ? "Pagamento in corso..."
            : "Conferma pagamento"}
        </button>
      </div>
    </form>
  );
}

export default function StripeCheckoutPopup({
  open,
  clientSecret,
  paymentId,
  carTitle,
  amountEur,
  onClose,
}: Props) {
  if (!open || !clientSecret || !paymentId) return null;

  return (
    <AscariPopup
      title="Paga ora"
      message="Completa il pagamento in sicurezza con Stripe."
      variant="info"
      confirmText="Chiudi"
      onClose={onClose}
      maxWidth={760}
      showCloseButton={true}
    >
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: "night",
            variables: {
              colorPrimary: "#69d2ff",
              colorBackground: "#101826",
              colorText: "#ffffff",
              colorDanger: "#ff6b6b",
              borderRadius: "14px",
            },
          },
        }}
      >
        <CheckoutForm
          paymentId={paymentId}
          carTitle={carTitle}
          amountEur={amountEur}
          onClose={onClose}
        />
      </Elements>
    </AscariPopup>
  );
}