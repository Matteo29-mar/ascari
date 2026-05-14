// frontend/src/pages/InspectorRegister.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { http } from "../api";
import AddressAutocomplete from "../components/AddressAutocomplete";

export default function InspectorRegister() {
  const nav = useNavigate();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const [workshopName, setWorkshopName] = useState("");
  const [workshopAddress, setWorkshopAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [radiusKm, setRadiusKm] = useState<number>(70);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) return;

    const mail = user.primaryEmailAddress?.emailAddress ?? "";
    setEmail((prev) => (prev ? prev : mail));
  }, [isLoaded, user]);

  const canSubmit = useMemo(() => {
    return (
      isLoaded &&
      !!user &&
      workshopName.trim().length > 0 &&
      email.trim().length > 0 &&
      phone.trim().length > 0 &&
      !loading
    );
  }, [isLoaded, user, workshopName, email, phone, loading]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!isLoaded) return;

    if (!user) {
      setErr("Utente non disponibile, riprova.");
      return;
    }

    if (!workshopName.trim()) {
      setErr("Inserisci il nome dell'officina.");
      return;
    }

    if (!email.trim()) {
      setErr("Inserisci una email valida.");
      return;
    }

    if (!phone.trim()) {
      setErr("Inserisci un numero di telefono.");
      return;
    }

    setLoading(true);

    try {
      const token = await getToken();
      if (!token) throw new Error("Token mancante Clerk");

      const { data } = await http.post(
        "/inspector/register",
        {
          workshopName: workshopName.trim(),
          workshopAddress: workshopAddress.trim() || null,
          email: email.trim(),
          phone: phone.trim(),
          city: city.trim() || null,
          radiusKm,
          userName: user.fullName ?? user.username ?? null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!data?.ok) throw new Error("Registrazione fallita");

      await user.update({
        unsafeMetadata: {
          ...(user.unsafeMetadata || {}),
          role: "PERIZIATORE",
        },
      });

      nav("/inspector", { replace: true });
    } catch (e: any) {
      setErr(
        e?.response?.data?.error ??
          e?.message ??
          "Errore durante la registrazione."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inspector-register-page">
      <div className="inspector-register-bg inspector-register-bg-one" />
      <div className="inspector-register-bg inspector-register-bg-two" />

      <div className="inspector-register-shell">
        <section className="inspector-register-hero">
          <div className="inspector-register-kicker">
            <span className="inspector-register-kicker-dot" />
            ASCARI PROFESSIONAL
          </div>

          <h1>Registrazione Periziatore</h1>

          <p>
            Registra la tua officina e renditi disponibile per effettuare
            controlli, perizie e verifiche sulle auto pubblicate su Ascari.
          </p>

          <div className="inspector-register-benefits">
            <div className="inspector-register-benefit">
              <span>01</span>
              <div>
                <strong>Profilo verificato</strong>
                <p>La tua officina sarà associata al tuo account Ascari.</p>
              </div>
            </div>

            <div className="inspector-register-benefit">
              <span>02</span>
              <div>
                <strong>Raggio operativo</strong>
                <p>Riceverai richieste compatibili con la tua zona.</p>
              </div>
            </div>

            <div className="inspector-register-benefit">
              <span>03</span>
              <div>
                <strong>Gestione perizie</strong>
                <p>Potrai gestire appuntamenti, chat e resoconti.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="inspector-register-card">
          <div className="inspector-register-card-header">
            <div>
              <span className="inspector-register-badge">Nuovo profilo</span>
              <h2>Dati officina</h2>
              <p>Compila i campi principali per continuare.</p>
            </div>
          </div>

          <form onSubmit={submit} className="inspector-register-form">
            <div className="inspector-register-grid">
              <label className="inspector-field inspector-field-full">
                <span>
                  Nome officina <b>*</b>
                </span>
                <input
                  className="input inspector-input"
                  value={workshopName}
                  onChange={(e) => setWorkshopName(e.target.value)}
                  placeholder="Es. Officina Rossi"
                  required
                  disabled={loading}
                />
              </label>

              <div className="inspector-field inspector-field-full">
                <span>Indirizzo officina</span>

                <AddressAutocomplete
                  value={workshopAddress}
                  onChange={(value: string) => {
                    setWorkshopAddress(value);
                  }}
                  onSelect={(place: any) => {
                    const label =
                      place?.place_name ||
                      place?.label ||
                      place?.address ||
                      place?.text ||
                      "";

                    setWorkshopAddress(label);

                    const selectedCity =
                      place?.context?.find?.((c: any) =>
                        String(c?.id || "").startsWith("place")
                      )?.text ||
                      place?.city ||
                      place?.properties?.city ||
                      "";

                    if (selectedCity) {
                      setCity(selectedCity);
                    }
                  }}
                  placeholder="Es. Via Monviso 10, Torino"
                  disabled={loading}
                  className="input inspector-input"
                />
              </div>

              <label className="inspector-field">
                <span>
                  Email <b>*</b>
                </span>
                <input
                  className="input inspector-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@officina.it"
                  required
                  disabled={loading}
                />
              </label>

              <label className="inspector-field">
                <span>
                  Telefono <b>*</b>
                </span>
                <input
                  className="input inspector-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+39 ..."
                  required
                  disabled={loading}
                />
              </label>

              <label className="inspector-field">
                <span>Città</span>
                <input
                  className="input inspector-input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Es. Milano"
                  disabled={loading}
                />
              </label>

              <label className="inspector-field">
                <span>Raggio operativo</span>
                <div className="inspector-radius-wrap">
                  <input
                    className="input inspector-input inspector-radius-input"
                    type="number"
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    min={5}
                    max={300}
                    disabled={loading}
                  />
                  <span>km</span>
                </div>
              </label>
            </div>

            {err && (
              <div className="inspector-register-error">
                <strong>Attenzione</strong>
                <span>{err}</span>
              </div>
            )}

            <div className="inspector-register-actions">
              <button
                className="btn inspector-submit-btn"
                type="submit"
                disabled={!canSubmit}
              >
                {loading ? "Salvataggio..." : "Salva e continua"}
              </button>

              <button
                className="btn ghost inspector-cancel-btn"
                type="button"
                onClick={() => nav("/cars")}
                disabled={loading}
              >
                Annulla
              </button>
            </div>

            <p className="inspector-register-note">
              I dati potranno essere modificati successivamente dalla dashboard
              periziatore.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}