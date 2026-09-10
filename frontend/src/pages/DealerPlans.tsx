import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  changeDealerSubscriptionPlan,
  confirmDealerSubscriptionCheckout,
  createDealerSubscriptionCheckout,
  createDealerSubscriptionPortal,
  getDealerDevices,
  getDealerSubscription,
  registerDealerDevice,
  revokeDealerDevice,
} from "../api";
import { getDealerDeviceLabel, getOrCreateDealerDeviceId } from "../utils/dealerDevice";

type PlanCode = "STARTER" | "ADVANCED";

type DealerPlan = {
  code: PlanCode;
  name: string;
  monthlyPriceEur: number;
  maxActiveCars: number | null;
  maxDevices: number;
  statsEnabled: boolean;
  features: string[];
};

type SubscriptionData = {
  plans: DealerPlan[];
  current: {
    plan: PlanCode | null;
    billingPlan: PlanCode;
    status: string;
    subscriptionRequired: boolean;
    maxActiveCars: number | null;
    maxDevices: number;
    activeDevices: number;
    remainingDevices: number;
    statsEnabled: boolean;
    activeCars: number;
    suspendedCars: number;
    totalCars: number;
    remainingSlots: number | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd: boolean;
    cancelAt?: string | null;
    hasStripeCustomer: boolean;
    hasStripeSubscription: boolean;
  };
};

type DealerDevice = {
  id: string;
  deviceId: string;
  label?: string | null;
  userAgent?: string | null;
  lastSeenAt: string;
  revokedAt?: string | null;
  createdAt: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    INACTIVE: "Da attivare",
    ACTIVE: "Attivo",
    TRIALING: "Periodo di prova",
    PAST_DUE: "Pagamento da aggiornare",
    UNPAID: "Non pagato",
    CANCELED: "Annullato",
    INCOMPLETE: "Pagamento incompleto",
    INCOMPLETE_EXPIRED: "Pagamento scaduto",
    PAUSED: "In pausa",
  };
  return labels[status] || status;
}

export default function DealerPlans() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [devices, setDevices] = useState<DealerDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const currentDeviceId = useMemo(() => getOrCreateDealerDeviceId(), []);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("Autenticazione richiesta");
    const subscription = await getDealerSubscription(token);
    setData(subscription);

    if (subscription?.current?.plan) {
      try {
        await registerDealerDevice(
          {
            deviceId: currentDeviceId,
            label: getDealerDeviceLabel(),
            userAgent: navigator.userAgent,
          },
          token
        );
      } catch (e: any) {
        if (e?.response?.data?.code === "DEALER_DEVICE_LIMIT_REACHED") {
          setError(e.response.data.error);
        } else {
          console.warn("Registrazione dispositivo dealer non riuscita:", e);
        }
      }

      try {
        const deviceData = await getDealerDevices(token);
        setDevices(Array.isArray(deviceData?.devices) ? deviceData.devices : []);
      } catch (e) {
        console.warn("Caricamento dispositivi dealer non riuscito:", e);
      }
    } else {
      setDevices([]);
    }
  }, [getToken, currentDeviceId]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const checkout = searchParams.get("checkout");
        const sessionId = searchParams.get("session_id");
        if (checkout === "success" && sessionId) {
          const token = await getToken();
          if (!token) throw new Error("Autenticazione richiesta");
          await confirmDealerSubscriptionCheckout(sessionId, token);
          setMessage("Abbonamento attivato correttamente.");
          setSearchParams({}, { replace: true });
        } else if (checkout === "cancelled") {
          setMessage("Checkout annullato: nessun addebito completato.");
          setSearchParams({}, { replace: true });
        }
        await load();
      } catch (e: any) {
        setError(e?.response?.data?.error || e?.message || "Errore caricamento piani");
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken, load, searchParams, setSearchParams]);

  async function subscribe(plan: PlanCode) {
    setBusyPlan(plan);
    setError(null);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Autenticazione richiesta");
      const result = await createDealerSubscriptionCheckout(plan, token);
      if (!result?.url) throw new Error("Checkout Stripe non disponibile");
      window.location.assign(result.url);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Errore apertura checkout");
      setBusyPlan(null);
    }
  }

  async function changePlan(plan: PlanCode) {
    const accepted = window.confirm(
      `Vuoi passare al piano ${plan}? Stripe applicherà l'eventuale conguaglio del periodo corrente.`
    );
    if (!accepted) return;
    setBusyPlan(plan);
    setError(null);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Autenticazione richiesta");
      await changeDealerSubscriptionPlan(plan, token);
      await load();
      setMessage(`Piano ${plan} aggiornato correttamente.`);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Errore cambio piano");
    } finally {
      setBusyPlan(null);
    }
  }

  async function openPortal() {
    setBusyPlan("PORTAL");
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Autenticazione richiesta");
      const result = await createDealerSubscriptionPortal(token);
      if (!result?.url) throw new Error("Portale Stripe non disponibile");
      window.location.assign(result.url);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Errore apertura portale Stripe");
      setBusyPlan(null);
    }
  }

  async function revoke(deviceId: string) {
    if (!window.confirm("Vuoi scollegare questo dispositivo?")) return;
    setBusyDevice(deviceId);
    try {
      const token = await getToken();
      if (!token) throw new Error("Autenticazione richiesta");
      await revokeDealerDevice(deviceId, token);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Errore revoca dispositivo");
    } finally {
      setBusyDevice(null);
    }
  }

  if (loading) return <div className="container">Caricamento piani concessionaria…</div>;

  if (error && !data) {
    return (
      <div className="container">
        <div className="card"><div className="card-body">
          <h1>I miei piani</h1>
          <p style={{ color: "var(--danger)" }}>{error}</p>
          <button className="btn secondary" onClick={() => navigate("/dealer/register")}>Vai al profilo concessionario</button>
        </div></div>
      </div>
    );
  }
  if (!data) return null;

  const current = data.current;
  const isPaid = !!current.plan;

  return (
    <div className="dealer-plans-page">
      <section className="dealer-plans-header">
        <div>
          <span className="dealer-profile-kicker">ASCARI DEALER</span>
          <h1>I miei piani</h1>
          <p className="muted">STARTER e ADVANCED includono auto illimitate. ADVANCED sblocca le statistiche per ogni auto.</p>
        </div>
        <div className="dealer-current-plan-card">
          <span>Piano attuale</span>
          <strong>{current.plan || "Da scegliere"}</strong>
          <small>{statusLabel(current.status)}</small>
        </div>
      </section>

      {message && <div className="dealer-plan-notice success">{message}</div>}
      {error && <div className="dealer-plan-notice error">{error}</div>}

      {current.subscriptionRequired && (
        <div className="dealer-plan-notice warning">
          <span>Il profilo concessionario è stato creato, ma devi attivare STARTER o ADVANCED per pubblicare auto e collegare dispositivi.</span>
          {current.hasStripeSubscription && current.hasStripeCustomer && (
            <button className="btn secondary" type="button" onClick={openPortal} disabled={busyPlan !== null}>
              {busyPlan === "PORTAL" ? "Apertura…" : "Gestisci vecchio abbonamento"}
            </button>
          )}
        </div>
      )}

      <section className="dealer-plan-grid">
        {data.plans.map((plan) => {
          const selected = current.plan === plan.code;
          return (
            <article key={plan.code} className={`card dealer-plan-card ${selected ? "selected" : ""} ${plan.code === "ADVANCED" ? "premium" : ""}`}>
              <div className="card-body">
                <div className="dealer-plan-card-top">
                  <div>
                    <span className="dealer-plan-name">{plan.name}</span>
                    <div className="dealer-plan-price"><strong>{plan.monthlyPriceEur}€</strong><span>/ mese</span></div>
                  </div>
                  {selected && <span className="tag">ATTIVO</span>}
                </div>
                <div className="dealer-plan-limit">Auto illimitate · {plan.maxDevices} dispositivi</div>
                <ul className="dealer-plan-features">
                  {plan.features.map((feature) => <li key={feature}><span aria-hidden>✓</span>{feature}</li>)}
                </ul>
                {selected ? (
                  <button className="btn dealer-plan-btn" disabled>Piano attuale</button>
                ) : isPaid ? (
                  <button className="btn dealer-plan-btn" onClick={() => changePlan(plan.code)} disabled={busyPlan !== null}>
                    {busyPlan === plan.code ? "Aggiornamento…" : `Passa a ${plan.code}`}
                  </button>
                ) : (
                  <button className="btn dealer-plan-btn" onClick={() => subscribe(plan.code)} disabled={busyPlan !== null}>
                    {busyPlan === plan.code ? "Apertura Stripe…" : `Scegli ${plan.code}`}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {isPaid && (
        <section className="card dealer-plan-usage">
          <div className="card-body">
            <div className="dealer-plan-usage-head">
              <div>
                <h2>Abbonamento</h2>
                <p className="muted">{current.activeCars} auto attive · auto illimitate</p>
              </div>
              {current.hasStripeCustomer && (
                <button className="btn secondary" type="button" onClick={openPortal} disabled={busyPlan !== null}>
                  {busyPlan === "PORTAL" ? "Apertura…" : "Gestisci abbonamento"}
                </button>
              )}
            </div>
            <div className="dealer-plan-meta-grid">
              <div><span>Auto attive</span><strong>{current.activeCars}</strong></div>
              <div><span>Dispositivi</span><strong>{current.activeDevices}/{current.maxDevices}</strong></div>
              <div><span>Statistiche auto</span><strong>{current.statsEnabled ? "Incluse" : "Non incluse"}</strong></div>
              <div><span>Prossimo rinnovo</span><strong>{formatDate(current.currentPeriodEnd)}</strong></div>
            </div>
            {current.cancelAtPeriodEnd && <div className="dealer-plan-warning">Abbonamento in disdetta fino al {formatDate(current.currentPeriodEnd)}.</div>}
          </div>
        </section>
      )}

      {isPaid && (
        <section className="card dealer-devices-card">
          <div className="card-body">
            <div className="dealer-plan-usage-head">
              <div>
                <span className="dealer-profile-kicker">DISPOSITIVI</span>
                <h2>Dispositivi collegati</h2>
                <p className="muted">Questo piano consente fino a {current.maxDevices} dispositivi. Puoi revocare quelli che non usi più.</p>
              </div>
              <span className="tag">{current.activeDevices}/{current.maxDevices}</span>
            </div>
            <div className="dealer-device-list">
              {devices.filter((device) => !device.revokedAt).map((device) => (
                <div className="dealer-device-row" key={device.id}>
                  <div>
                    <strong>{device.label || "Dispositivo"}{device.deviceId === currentDeviceId ? " · questo dispositivo" : ""}</strong>
                    <span>Ultimo accesso {new Date(device.lastSeenAt).toLocaleString("it-IT")}</span>
                    <small>{device.userAgent || device.deviceId}</small>
                  </div>
                  {device.deviceId === currentDeviceId ? (
                    <button className="btn secondary" type="button" disabled title="È il dispositivo con cui stai usando ASCARI">
                      In uso
                    </button>
                  ) : (
                    <button className="btn secondary" type="button" onClick={() => revoke(device.id)} disabled={busyDevice === device.id}>
                      {busyDevice === device.id ? "Revoca…" : "Scollega"}
                    </button>
                  )}
                </div>
              ))}
              {devices.filter((device) => !device.revokedAt).length === 0 && <p className="muted">Nessun dispositivo attivo.</p>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
