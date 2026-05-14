// frontend/src/pages/PaymentReturn.tsx

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AscariPopup from "../components/AscariPopup";
import { getPaymentStatus } from "../api";

type PopupState = {
  title: string;
  message: string;
  variant: "success" | "error" | "warning" | "info";
};

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const paymentIntent = params.get("payment_intent");
  const redirectStatus = params.get("redirect_status");
  const paymentIdRaw = params.get("paymentId");

  const paymentId = useMemo(() => {
    const n = Number(paymentIdRaw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }, [paymentIdRaw]);

  const [popupOpen, setPopupOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const [popup, setPopup] = useState<PopupState>({
    title: "Verifica pagamento",
    message: "Sto verificando il pagamento con Ascari e Stripe...",
    variant: "info",
  });

  useEffect(() => {
    async function finalizePayment() {
      if (!isLoaded) return;

      if (!isSignedIn) {
        setLoading(false);
        setPopup({
          title: "Accesso richiesto",
          message:
            "Per finalizzare il pagamento nello storico Ascari devi essere autenticato.",
          variant: "warning",
        });
        return;
      }

      if (!paymentId) {
        setLoading(false);

        if (redirectStatus === "succeeded") {
          setPopup({
            title: "Pagamento completato su Stripe",
            message:
              "Stripe ha completato il pagamento, ma manca il paymentId interno Ascari nella URL. Lo storico non può essere creato automaticamente.",
            variant: "warning",
          });
          return;
        }

        setPopup({
          title: "Pagamento non finalizzato",
          message:
            "Manca il paymentId interno Ascari. Non posso verificare e registrare correttamente il pagamento nello storico.",
          variant: "error",
        });
        return;
      }

      try {
        setLoading(true);

        const token = await getToken();

        if (!token) {
          throw new Error("Token mancante");
        }

        const result = await getPaymentStatus(paymentId, token);

        const paymentStatus =
          result?.paymentIntentStatus || result?.payment?.status || "";

        if (
          String(paymentStatus).toLowerCase() === "succeeded" ||
          String(result?.payment?.status).toUpperCase() === "SUCCEEDED"
        ) {
          setPopup({
            title: "Pagamento completato",
            message:
              "Il pagamento è stato completato con successo. Ascari ha registrato l'operazione nello storico.",
            variant: "success",
          });
          return;
        }

        if (String(paymentStatus).toLowerCase() === "processing") {
          setPopup({
            title: "Pagamento in elaborazione",
            message:
              "Il pagamento è in elaborazione. Riapri questa pagina tra qualche istante o controlla lo storico più tardi.",
            variant: "warning",
          });
          return;
        }

        setPopup({
          title: "Pagamento non completato",
          message:
            "Il pagamento non risulta ancora completato. Riprova oppure controlla il metodo di pagamento usato.",
          variant: "warning",
        });
      } catch (e: any) {
        console.error("Errore finalizzazione pagamento:", e);

        setPopup({
          title: "Errore registrazione pagamento",
          message:
            e?.response?.data?.error ||
            e?.message ||
            "Il pagamento potrebbe essere stato completato su Stripe, ma Ascari non è riuscito a registrarlo nello storico.",
          variant: "error",
        });
      } finally {
        setLoading(false);
      }
    }

    finalizePayment();
  }, [isLoaded, isSignedIn, getToken, paymentId, redirectStatus]);

  return (
    <div style={{ paddingTop: 20 }}>
      <h1 className="h1">Esito pagamento</h1>

      <p className="muted">
        Payment Intent Stripe: <b>{paymentIntent || "n/d"}</b>
      </p>

      <p className="muted">
        Payment ID Ascari: <b>{paymentId || "n/d"}</b>
      </p>

      {popupOpen && (
        <AscariPopup
          title={popup.title}
          message={popup.message}
          variant={popup.variant}
          confirmText={
            popup.variant === "success" ? "Vai allo storico" : "Torna alle auto"
          }
          loading={loading}
          onClose={() => {
            setPopupOpen(false);

            if (popup.variant === "success") {
              nav("/history");
            } else {
              nav("/cars");
            }
          }}
        />
      )}
    </div>
  );
}