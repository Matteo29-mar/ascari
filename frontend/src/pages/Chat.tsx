// frontend/src/pages/Chat.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  http,
  configureCarPayment,
  getStripeAccountStatus,
  createCarPaymentIntent,
} from "../api";
import { useAuth } from "@clerk/clerk-react";
import AscariPopup from "../components/AscariPopup";
import StripeCheckoutPopup from "../components/StripeCheckoutPopup";

type Message = {
  id: number;
  senderId: string;
  content: string;
  createdAt: string;
};

type StripeAccountStatus = {
  accountId?: string | null;
  status: "NOT_STARTED" | "PENDING" | "ENABLED";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingCompleted: boolean;
};

type ChatCar = {
  id: number;
  make: string;
  model: string;
  title?: string | null;
  year: number;
  trimLevel?: string | null;
  coverUrl?: string | null;
  photos?: string[] | null;

  paymentEnabled?: boolean | null;
  salePriceEur?: number | null;
  ascariFeeEur?: number | null;
  sellerNetEur?: number | null;
  paymentStatus?: string | null;

  marketStatus?: "AVAILABLE" | "SOLD_PENDING_REMOVAL" | "REMOVED_AFTER_SALE";
  soldAt?: string | null;
  removalScheduledAt?: string | null;
  visuallyRemovedAt?: string | null;

  isPeriziata?: boolean | null;
  inspectionFeeEur?: number | null;
};

const ASCARI_FEE_PERCENT = 10;
const INSPECTION_FEE_EUR = 120;
const CHAT_POLL_MS = 3000;

function formatEuro(value?: number | null) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function parsePositiveInt(value: string) {
  const n = Number(onlyDigits(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function formatPriceInput(value: string) {
  const n = parsePositiveInt(value);
  if (!n) return "";
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 0,
  }).format(n);
}

function renderMessageContent(content: string) {
  const lines = content.split("\n");

  return lines.map((line, index) => {
    const trimmed = line.trim();

    const mapsMatch = trimmed.match(/^Google Maps:\s*(https?:\/\/\S+)$/i);
    if (mapsMatch) {
      const url = mapsMatch[1];

      return (
        <div key={index} style={{ marginTop: index === 0 ? 0 : 4 }}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#7dd3fc",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            Apri su Google Maps
          </a>
        </div>
      );
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = line.split(urlRegex);

    return (
      <div
        key={index}
        style={{
          marginTop: index === 0 ? 0 : 4,
          minHeight: 22,
        }}
      >
        {parts.map((part, partIndex) => {
          const isUrl = /^https?:\/\/[^\s]+$/i.test(part);

          if (isUrl) {
            return (
              <a
                key={partIndex}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#7dd3fc",
                  textDecoration: "underline",
                  wordBreak: "break-all",
                }}
              >
                {part}
              </a>
            );
          }

          return <span key={partIndex}>{part}</span>;
        })}
      </div>
    );
  });
}

function isInspectorRoute() {
  return window.location.pathname.startsWith("/inspector/chat");
}

function popupKey(cid: number) {
  return `chat_cancelled_popup_shown_${cid}`;
}

function refreshUnreadBadge() {
  window.dispatchEvent(new Event("ascari:refresh-chat-unread"));
}

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const chatId = useMemo(() => {
    if (!id || id === "undefined") return null;
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }, [id]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEditingPaymentRef = useRef(false);

  const [deletePromptOpen, setDeletePromptOpen] = useState(false);
  const [deletePromptText, setDeletePromptText] = useState(
    "La perizia è stata annullata. Vuoi eliminare la chat?"
  );
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [paymentAccordionOpen, setPaymentAccordionOpen] = useState(false);
  const [showPaymentConfig, setShowPaymentConfig] = useState(false);
  const [paymentPriceInput, setPaymentPriceInput] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [sellerStripeStatus, setSellerStripeStatus] =
    useState<StripeAccountStatus | null>(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutPaymentId, setCheckoutPaymentId] = useState<number | null>(null);

  const myId = chatInfo?.meId as string | undefined;
  const isOfferChat = chatInfo?.kind === "OFFER";
  const isSeller = !!myId && chatInfo?.sellerId === myId;
  const isBuyer = !!myId && chatInfo?.buyerId === myId;
  const currentCar = (chatInfo?.car ?? null) as ChatCar | null;

  const carSold =
  currentCar?.marketStatus === "SOLD_PENDING_REMOVAL" ||
  currentCar?.marketStatus === "REMOVED_AFTER_SALE" ||
  currentCar?.paymentStatus === "SOLD";

const carRemovedAfterSale =
  currentCar?.marketStatus === "REMOVED_AFTER_SALE" ||
  !!currentCar?.visuallyRemovedAt;

const carSoldPendingRemoval =
  currentCar?.marketStatus === "SOLD_PENDING_REMOVAL";

const paymentActionsDisabled = carSold || carRemovedAfterSale;

  const paymentPreview = useMemo(() => {
    const salePrice = parsePositiveInt(paymentPriceInput);
    const ascariFee = Math.round((salePrice * ASCARI_FEE_PERCENT) / 100);
    const inspectionFee = INSPECTION_FEE_EUR;
    const sellerNet = Math.max(salePrice - ascariFee - inspectionFee, 0);

    return {
      salePrice,
      ascariFee,
      inspectionFee,
      sellerNet,
    };
  }, [paymentPriceInput, currentCar?.isPeriziata]);

  async function authHeaders() {
    const token = await getToken();
    if (!token) throw new Error("Token mancante");
    return { Authorization: `Bearer ${token}` };
  }

  function goBack() {
    if (isInspectorRoute()) navigate("/inspector/chat");
    else navigate("/chat");
  }

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  function scrollToBottom() {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  async function loadChat() {
    if (!chatId) return;

    try {
      const headers = await authHeaders();
      const { data } = await http.get(`/chat/${chatId}`, { headers });

      setChatInfo(data);
      setMessages(data.messages || []);

      if (!isEditingPaymentRef.current) {
        if (data?.car?.salePriceEur) {
          setPaymentPriceInput(formatPriceInput(String(data.car.salePriceEur)));
        } else {
          setPaymentPriceInput("");
        }
      }

      scrollToBottom();
      refreshUnreadBadge();

      const meId = data?.meId as string | undefined;
      const kind = data?.kind as string | undefined;
      const inspectionStatus = data?.inspectionStatus as string | null | undefined;
      const sellerId = data?.sellerId as string | undefined;

      const shouldPrompt =
        !!meId &&
        kind === "INSPECTION" &&
        inspectionStatus === "CANCELLED" &&
        sellerId === meId;

      if (shouldPrompt) {
        const already = localStorage.getItem(popupKey(chatId));
        if (!already) {
          localStorage.setItem(popupKey(chatId), "1");
          setDeletePromptText(
            "Ci dispiace ma per questa data non è più possibile la perizia. Vuoi eliminare la chat?"
          );
          setDeletePromptOpen(true);
        }
      }
    } catch (e: any) {
      const status = e?.response?.status;
      const msg =
        e?.response?.data?.error ?? e?.message ?? "Errore caricamento chat";
      alert(msg);

      if (status === 403 || status === 404 || status === 400) {
        goBack();
      }
    }
  }

  async function sendMessage() {
    if (!chatId) return;
    if (!input.trim()) return;
    if (sending) return;

    try {
      setSending(true);
      const headers = await authHeaders();

      await http.post(`/chat/${chatId}/message`, { content: input }, { headers });

      setInput("");

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      }, 0);

      await loadChat();
      refreshUnreadBadge();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? "Errore invio messaggio");
    } finally {
      setSending(false);
    }
  }

  async function deleteChat() {
    if (!chatId) return;

    try {
      setDeleteBusy(true);
      const headers = await authHeaders();
      await http.delete(`/chat/${chatId}`, { headers });
      setDeletePromptOpen(false);
      refreshUnreadBadge();
      goBack();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? "Errore eliminazione chat");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function savePaymentConfig() {
    if (!currentCar?.id) return;

    if (paymentActionsDisabled) {
      alert("Questa auto è già stata venduta. Non puoi più configurare il pagamento.");
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        alert("Non sei autenticato");
        return;
      }

      if (!sellerStripeStatus || sellerStripeStatus.status !== "ENABLED") {
        alert(
          "Prima di configurare il pagamento devi abilitare Stripe dalla sezione Pagamenti."
        );
        return;
      }

      if (!paymentPreview.salePrice || paymentPreview.salePrice <= 0) {
        alert("Inserisci un prezzo di vendita valido.");
        return;
      }

      setSavingPayment(true);

      await configureCarPayment(
        currentCar.id,
        {
          salePriceEur: paymentPreview.salePrice,
        },
        token
      );

      isEditingPaymentRef.current = false;
      setShowPaymentConfig(false);
      await loadChat();
    } catch (e: any) {
      alert(
        e?.response?.data?.error ||
          e?.message ||
          "Errore configurazione pagamento"
      );
    } finally {
      setSavingPayment(false);
    }
  }

  async function startCheckout() {
    if (!currentCar?.id) return;
    
    if (paymentActionsDisabled) {
      alert("Questa auto è già stata venduta. Il pagamento non è più disponibile.");
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        alert("Devi effettuare il login per pagare.");
        return;
      }

      setCheckoutLoading(true);

      const data = await createCarPaymentIntent(currentCar.id, token);

      if (!data?.clientSecret || !data?.paymentId) {
        throw new Error("Dati checkout Stripe non validi");
      }

      setCheckoutClientSecret(data.clientSecret);
      setCheckoutPaymentId(data.paymentId);
      setCheckoutOpen(true);
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || "Errore avvio checkout");
    } finally {
      setCheckoutLoading(false);
    }
  }

  function handlePaymentPriceChange(e: React.ChangeEvent<HTMLInputElement>) {
    isEditingPaymentRef.current = true;
    setPaymentPriceInput(onlyDigits(e.target.value));
  }

  function handlePaymentPriceFocus() {
    isEditingPaymentRef.current = true;
    setPaymentPriceInput((prev) => onlyDigits(prev));
  }

  function handlePaymentPriceBlur() {
    setPaymentPriceInput((prev) => formatPriceInput(prev));
  }

  function handleOpenPaymentConfig() {
    isEditingPaymentRef.current = false;
    if (currentCar?.salePriceEur) {
      setPaymentPriceInput(formatPriceInput(String(currentCar.salePriceEur)));
    } else {
      setPaymentPriceInput("");
    }
    setShowPaymentConfig(true);
  }

  function handleClosePaymentConfig() {
    isEditingPaymentRef.current = false;
    setShowPaymentConfig(false);
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  useEffect(() => {
    if (!chatId) {
      goBack();
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;

    loadChat();
    const interval = setInterval(loadChat, CHAT_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    resizeTextarea();
  }, [input]);

  useEffect(() => {
    async function run() {
      if (!isOfferChat || !isSeller) {
        setSellerStripeStatus(null);
        return;
      }

      try {
        const token = await getToken();
        if (!token) return;
        const data = await getStripeAccountStatus(token);
        setSellerStripeStatus(data);
      } catch (e) {
        console.error("Errore caricamento stato Stripe:", e);
      }
    }

    run();
  }, [isOfferChat, isSeller, getToken]);

  if (!chatId) return <p style={{ padding: 20 }}>Caricamento chat…</p>;
  if (!chatInfo) return <p style={{ padding: 20 }}>Caricamento chat…</p>;

  const otherUser = chatInfo.peer;

  const displayName =
    otherUser?.name && String(otherUser.name).trim() !== ""
      ? otherUser.name
      : otherUser?.email ?? "Utente";

  const paymentStatusBadge = !currentCar?.paymentEnabled
    ? {
        text: "Non configurato",
        color: "#94a3b8",
        bg: "rgba(148,163,184,0.15)",
        border: "rgba(148,163,184,0.25)",
      }
    : {
        text: "Pagamento attivo",
        color: "#34d399",
        bg: "rgba(52,211,153,0.15)",
        border: "rgba(52,211,153,0.30)",
      };

  return (
    <div style={{ padding: 20 }}>
      <h2 className="h2">Chat con {displayName}</h2>

      <div className="chat-header">
        <button onClick={goBack} className="btn secondary back-chat-btn">
          ← Indietro
        </button>
      </div>

      {isOfferChat && currentCar && (
        <div
          className="card"
          style={{
            marginTop: 20,
            border: "1px solid rgba(255,255,255,0.08)",
            overflow: "hidden",
          }}
        >
          <div className="card-body">
            <button
              className="btn secondary"
              type="button"
              onClick={() => setPaymentAccordionOpen((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{isSeller ? "Gestione pagamento" : "Pagamento"}</span>
              <span style={{ opacity: 0.8 }}>
                {paymentAccordionOpen ? "▲" : "▼"}
              </span>
            </button>

            {carSoldPendingRemoval && (
              <div
                style={{
                  marginBottom: 14,
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(251,191,36,0.35)",
                  background: "rgba(251,191,36,0.12)",
                  color: "#fde68a",
                  fontWeight: 800,
                  lineHeight: 1.5,
                }}
              >
                Auto venduta. La chat rimane disponibile temporaneamente fino alla rimozione automatica.
                {currentCar?.removalScheduledAt && (
                  <div style={{ marginTop: 4, fontWeight: 600 }}>
                    Rimozione prevista:{" "}
                    {new Date(currentCar.removalScheduledAt).toLocaleDateString("it-IT")}
                  </div>
                )}
              </div>
            )}


            {paymentAccordionOpen && (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: `1px solid ${paymentStatusBadge.border}`,
                        background: paymentStatusBadge.bg,
                        color: paymentStatusBadge.color,
                        fontWeight: 800,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: paymentStatusBadge.color,
                        }}
                      />
                      {paymentStatusBadge.text}
                    </div>
                  </div>

                  {isSeller && (
                    <button
                      className="btn"
                      type="button"
                      onClick={handleOpenPaymentConfig}
                      disabled={paymentActionsDisabled}
                    >
                      {currentCar.paymentEnabled
                        ? "Aggiorna importi"
                        : "Configura pagamento"}
                    </button>
                  )}

                  {isBuyer && currentCar.paymentEnabled && currentCar.salePriceEur ? (
                    <button
                      className="btn"
                      type="button"
                      onClick={startCheckout}
                      disabled={checkoutLoading || paymentActionsDisabled}
                    >
                      {checkoutLoading ? "Avvio pagamento..." : "Paga ora"}
                    </button>
                  ) : null}
                </div>

                <div
                  style={{
                    marginTop: 16,
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  }}
                >
                  <MiniValue
                    label="Prezzo vendita"
                    value={formatEuro(currentCar.salePriceEur)}
                  />
                  <MiniValue
                    label="Commissione Ascari"
                    value={formatEuro(currentCar.ascariFeeEur)}
                  />
                  <MiniValue
                    label="Commissione periziatore"
                    value={formatEuro(currentCar.inspectionFeeEur ?? 0)}
                  />
                  <MiniValue
                    label="Netto venditore"
                    value={formatEuro(currentCar.sellerNetEur)}
                  />
                </div>

                {isSeller && sellerStripeStatus?.status !== "ENABLED" && (
                  <p className="muted" style={{ marginTop: 14, lineHeight: 1.6 }}>
                    Per attivare i pagamenti devi prima completare l’onboarding Stripe
                    dalla sezione <b>Pagamenti</b>.
                  </p>
                )}

                {isBuyer && !currentCar.paymentEnabled && (
                  <p className="muted" style={{ marginTop: 14, lineHeight: 1.6 }}>
                    Il venditore non ha ancora configurato il pagamento per questa auto.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          background: "#111",
          padding: 20,
          height: "60vh",
          overflowY: "auto",
          borderRadius: 10,
          marginTop: 20,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {messages.map((m) => {
          const isMine = m.senderId === myId;

          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                justifyContent: isMine ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  background: isMine ? "#00f5c4" : "#333",
                  color: isMine ? "#000" : "#fff",
                  padding: "10px 14px",
                  borderRadius: 12,
                  maxWidth: "60%",
                  whiteSpace: "normal",
                  lineHeight: 1.45,
                  wordBreak: "break-word",
                }}
              >
                {renderMessageContent(m.content)}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div
        style={{
          marginTop: 20,
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
        }}
      >
        <div style={{ flex: 1 }}>
          <textarea
            ref={textareaRef}
            className="input"
            placeholder="Scrivi un messaggio…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            rows={1}
            style={{
              width: "100%",
              minHeight: 52,
              maxHeight: 180,
              resize: "none",
              overflowY: "auto",
              paddingTop: 14,
              paddingBottom: 14,
              lineHeight: 1.45,
              borderRadius: 14,
            }}
          />
        </div>

        <button
          className="btn"
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          style={{ minWidth: 92, height: 52 }}
        >
          {sending ? "Invio..." : "Invia"}
        </button>
      </div>

      {deletePromptOpen && (
        <div className="ascari-modal" onClick={() => setDeletePromptOpen(false)}>
          <div className="ascari-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Chat</h3>
            <p className="muted">{deletePromptText}</p>

            <button
              className="btn"
              style={{ marginTop: 18, width: "100%" }}
              onClick={deleteChat}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Eliminazione..." : "Elimina chat"}
            </button>

            <button
              className="btn ghost"
              style={{ marginTop: 10, width: "100%" }}
              onClick={() => setDeletePromptOpen(false)}
              disabled={deleteBusy}
            >
              Non ora
            </button>
          </div>
        </div>
      )}

      <StripeCheckoutPopup
        open={checkoutOpen}
        clientSecret={checkoutClientSecret}
        paymentId={checkoutPaymentId}
        carTitle={
          currentCar
            ? `${currentCar.make} ${currentCar.model} ${currentCar.year}`
            : "Auto"
        }
        amountEur={currentCar?.salePriceEur ?? 0}
        onClose={() => {
          setCheckoutOpen(false);
          setCheckoutClientSecret(null);
          setCheckoutPaymentId(null);
        }}
      />

      {showPaymentConfig && currentCar && (
        <AscariPopup
          title="Configura pagamento vendita"
          message="Inserisci il prezzo di vendita. Ascari ti mostra subito il netto venditore e la commissione piattaforma."
          variant="info"
          confirmText="Salva configurazione"
          cancelText="Annulla"
          loading={savingPayment}
          onClose={handleClosePaymentConfig}
          onCancel={handleClosePaymentConfig}
          onConfirm={savePaymentConfig}
          closeOnBackdrop={!savingPayment}
          maxWidth={720}
        >
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: 8,
                  color: "rgba(255,255,255,0.86)",
                  fontWeight: 700,
                }}
              >
                Prezzo vendita (€)
              </label>

              <input
                type="text"
                inputMode="numeric"
                value={paymentPriceInput}
                onChange={handlePaymentPriceChange}
                onFocus={handlePaymentPriceFocus}
                onBlur={handlePaymentPriceBlur}
                placeholder="Es. 1000"
                autoComplete="off"
                style={{
                  width: "100%",
                  height: 50,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff",
                  padding: "0 14px",
                  fontSize: 16,
                  outline: "none",
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <PaymentValueCard
                label="Prezzo lordo"
                value={paymentPreview.salePrice > 0 ? formatEuro(paymentPreview.salePrice) : "—"}
              />
              <PaymentValueCard
                label={`Commissione Ascari (${ASCARI_FEE_PERCENT}%)`}
                value={paymentPreview.salePrice > 0 ? formatEuro(paymentPreview.ascariFee) : "—"}
              />
              <PaymentValueCard
                label="Netto venditore"
                value={paymentPreview.salePrice > 0 ? formatEuro(paymentPreview.sellerNet) : "—"}
                highlight
              />
              <PaymentValueCard
                label="Commissione periziatore"
                value={
                  paymentPreview.salePrice > 0
                    ? formatEuro(paymentPreview.inspectionFee)
                    : "—"
                }
              />

            </div>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 16,
                padding: 14,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.82)",
              }}
            >
              Esempio: se inserisci <b>1000 €</b>, il venditore vedrà il netto
              stimato e la quota Ascari verrà aggiornata in tempo reale.
            </div>
          </div>
        </AscariPopup>
      )}
    </div>
  );
}

function MiniValue({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div className="muted" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <b>{value}</b>
    </div>
  );
}

function PaymentValueCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        border: highlight
          ? "1px solid rgba(52,211,153,0.28)"
          : "1px solid rgba(255,255,255,0.10)",
        background: highlight
          ? "rgba(52,211,153,0.08)"
          : "rgba(255,255,255,0.03)",
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div className="muted" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontWeight: 800,
          fontSize: 22,
          color: highlight ? "#b8ffe9" : "#ffffff",
        }}
      >
        {value}
      </div>
    </div>
  );
}