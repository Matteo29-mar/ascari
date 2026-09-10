import React, { useEffect, useMemo, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import AddressAutocomplete from "../components/AddressAutocomplete";
import { http } from "../api";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Impossibile leggere il logo"));
    reader.readAsDataURL(file);
  });
}

export default function DealerRegister() {
  const nav = useNavigate();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const [dealerName, setDealerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [existing, setExisting] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !user) return;

    const primaryEmail = user.primaryEmailAddress?.emailAddress ?? "";
    setEmail((prev) => prev || primaryEmail);

    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const { data } = await http.get("/dealers/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || !data?.dealer) return;

        const d = data.dealer;
        setExisting(true);
        setDealerName(d.dealerName ?? "");
        setBusinessName(d.businessName ?? "");
        setVatNumber(d.vatNumber ?? "");
        setAddress(d.address ?? "");
        setCity(d.city ?? "");
        setProvince(d.province ?? "");
        setEmail(d.email ?? primaryEmail);
        setPhone(d.phone ?? "");
        setWebsite(d.website ?? "");
        setDescription(d.description ?? "");
        setLogoUrl(d.logoUrl ?? "");
      } catch (e) {
        console.error("Errore caricamento profilo concessionario:", e);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user, getToken]);

  useEffect(() => {
    if (isLoaded && !user) setLoadingProfile(false);
  }, [isLoaded, user]);

  const canSubmit = useMemo(
    () =>
      !!user &&
      dealerName.trim().length > 0 &&
      address.trim().length > 0 &&
      city.trim().length > 0 &&
      email.trim().length > 0 &&
      phone.trim().length > 0 &&
      !loading,
    [user, dealerName, address, city, email, phone, loading]
  );

  async function onLogoChange(file?: File) {
    if (!file) return;
    setErr(null);

    if (!file.type.startsWith("image/")) {
      setErr("Seleziona un file immagine per il logo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr("Il logo non può superare 5 MB.");
      return;
    }

    try {
      setLogoUrl(await fileToDataUrl(file));
    } catch (e: any) {
      setErr(e?.message || "Impossibile leggere il logo.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!user) {
      setErr("Utente non disponibile, riprova.");
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Token Clerk mancante");

      const payload = {
        dealerName: dealerName.trim(),
        businessName: businessName.trim() || null,
        vatNumber: vatNumber.trim() || null,
        address: address.trim(),
        city: city.trim(),
        province: province.trim() || null,
        country: "Italia",
        email: email.trim(),
        phone: phone.trim(),
        website: website.trim() || null,
        description: description.trim() || null,
        logoUrl: logoUrl || null,
      };

      const { data } = existing
        ? await http.put("/dealers/me", payload, {
            headers: { Authorization: `Bearer ${token}` },
          })
        : await http.post("/dealers/register", payload, {
            headers: { Authorization: `Bearer ${token}` },
          });

      if (!data?.ok) throw new Error("Salvataggio profilo concessionario fallito");

      if (user.unsafeMetadata?.role !== "CONCESSIONARIO") {
        await user.update({
          unsafeMetadata: {
            ...(user.unsafeMetadata || {}),
            role: "CONCESSIONARIO",
          },
        });
      }

      nav(existing ? "/dealer/me" : "/dealer/plans", { replace: true });
    } catch (e: any) {
      setErr(
        e?.response?.data?.error ||
          e?.message ||
          "Errore durante la registrazione della concessionaria."
      );
    } finally {
      setLoading(false);
    }
  }

  if (loadingProfile) {
    return <div className="container">Caricamento profilo concessionario…</div>;
  }

  return (
    <div className="inspector-register-page dealer-register-page">
      <div className="inspector-register-bg inspector-register-bg-one" />
      <div className="inspector-register-bg inspector-register-bg-two" />

      <div className="inspector-register-shell">
        <section className="inspector-register-hero">
          <div className="inspector-register-kicker">
            <span className="inspector-register-kicker-dot" />
            ASCARI DEALER
          </div>

          <h1>{existing ? "Modifica concessionaria" : "Profilo Concessionario"}</h1>
          <p>
            Crea la vetrina pubblica della tua attività. Le auto che pubblichi restano
            nel normale circuito Ascari, ma vengono riconosciute come auto di
            concessionaria e collegate al tuo garage pubblico.
          </p>

          <div className="inspector-register-benefits">
            <div className="inspector-register-benefit">
              <span>01</span>
              <div>
                <strong>Vetrina pubblica</strong>
                <p>Logo, contatti, indirizzo e tutte le auto disponibili in un unico profilo.</p>
              </div>
            </div>
            <div className="inspector-register-benefit">
              <span>02</span>
              <div>
                <strong>Auto illimitate</strong>
                <p>Dopo il profilo scegli STARTER o ADVANCED: entrambi includono auto illimitate.</p>
              </div>
            </div>
            <div className="inspector-register-benefit">
              <span>03</span>
              <div>
                <strong>Piano obbligatorio</strong>
                <p>STARTER include 10 dispositivi; ADVANCED 20 dispositivi e statistiche per ogni auto.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="inspector-register-card">
          <div className="inspector-register-card-header">
            <span className="inspector-register-badge">
              {existing ? "Profilo attivo" : "Nuovo profilo"}
            </span>
            <h2>Dati concessionaria</h2>
            <p>I campi con * sono necessari per pubblicare la vetrina.</p>
          </div>

          <form onSubmit={submit} className="inspector-register-form">
            <div className="inspector-register-grid">
              <label className="inspector-field inspector-field-full">
                <span>Nome concessionaria <b>*</b></span>
                <input
                  className="input inspector-input"
                  value={dealerName}
                  onChange={(e) => setDealerName(e.target.value)}
                  placeholder="Es. Auto Elite Torino"
                  required
                  disabled={loading}
                />
              </label>

              <label className="inspector-field">
                <span>Ragione sociale</span>
                <input
                  className="input inspector-input"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Es. Auto Elite S.r.l."
                  disabled={loading}
                />
              </label>

              <label className="inspector-field">
                <span>Partita IVA</span>
                <input
                  className="input inspector-input"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="IT01234567890"
                  disabled={loading}
                />
              </label>

              <div className="inspector-field inspector-field-full">
                <span>Indirizzo <b>*</b></span>
                <AddressAutocomplete
                  value={address}
                  onChange={setAddress}
                  onSelect={(place) => {
                    setAddress(place.locationText);
                    if (place.city) setCity(place.city);
                  }}
                  placeholder="Es. Corso Francia 120, Torino"
                  disabled={loading}
                  className="inspector-input"
                />
              </div>

              <label className="inspector-field">
                <span>Città <b>*</b></span>
                <input
                  className="input inspector-input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Torino"
                  required
                  disabled={loading}
                />
              </label>

              <label className="inspector-field">
                <span>Provincia</span>
                <input
                  className="input inspector-input"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="TO"
                  disabled={loading}
                />
              </label>

              <label className="inspector-field">
                <span>Email commerciale <b>*</b></span>
                <input
                  className="input inspector-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="info@concessionaria.it"
                  required
                  disabled={loading}
                />
              </label>

              <label className="inspector-field">
                <span>Telefono <b>*</b></span>
                <input
                  className="input inspector-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+39 ..."
                  required
                  disabled={loading}
                />
              </label>

              <label className="inspector-field inspector-field-full">
                <span>Sito web</span>
                <input
                  className="input inspector-input"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://www.concessionaria.it"
                  disabled={loading}
                />
              </label>

              <label className="inspector-field inspector-field-full">
                <span>Descrizione attività</span>
                <textarea
                  className="input inspector-input dealer-register-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Presenta la concessionaria, i servizi e la tipologia di auto trattate."
                  disabled={loading}
                />
              </label>

              <label className="inspector-field inspector-field-full">
                <span>Logo concessionaria</span>
                <div className="dealer-logo-upload">
                  <div className="dealer-logo-preview">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Anteprima logo concessionaria" />
                    ) : (
                      <span>LOGO</span>
                    )}
                  </div>
                  <div className="dealer-logo-upload-copy">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => onLogoChange(e.target.files?.[0])}
                      disabled={loading}
                    />
                    <small className="muted">PNG, JPG o WebP. Massimo 5 MB.</small>
                  </div>
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
              <button className="btn inspector-submit-btn" type="submit" disabled={!canSubmit}>
                {loading ? "Salvataggio…" : existing ? "Salva modifiche" : "Crea profilo"}
              </button>
              <button
                className="btn ghost inspector-cancel-btn"
                type="button"
                onClick={() => nav(existing ? "/dealer/me" : "/cars")}
                disabled={loading}
              >
                Annulla
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
