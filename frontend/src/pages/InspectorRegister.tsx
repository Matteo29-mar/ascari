import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { http } from "../api";

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!isLoaded) return;
    if (!user) {
      setErr("Utente non disponibile, riprova.");
      return;
    }

    setLoading(true);

    try {
      const token = await getToken();
      if (!token) throw new Error("Token mancante (Clerk)");

      const { data } = await http.post(
        "/inspector/register",
        {
          workshopName,
          workshopAddress: workshopAddress || null,
          email,
          phone,
          city: city || null,
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
      setErr(e?.response?.data?.error ?? e?.message ?? "Errore");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ paddingTop: 18, maxWidth: 720 }}>
      <h1>Registrazione Periziatore</h1>
      <p>Compila i dati della tua officina.</p>

      <form
        onSubmit={submit}
        className="panel"
        style={{ padding: 16, marginTop: 14 }}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <label>
            Nome officina *
            <input
              value={workshopName}
              onChange={(e) => setWorkshopName(e.target.value)}
              placeholder="Es. Officina Rossi"
              required
              disabled={loading}
            />
          </label>

          <label>
            Indirizzo officina
            <input
              value={workshopAddress}
              onChange={(e) => setWorkshopAddress(e.target.value)}
              placeholder="Es. Via Roma 10"
              disabled={loading}
            />
          </label>

          <label>
            Email *
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@officina.it"
              required
              disabled={loading}
            />
          </label>

          <label>
            Telefono *
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+39 ..."
              required
              disabled={loading}
            />
          </label>

          <label>
            Città
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Es. Milano"
              disabled={loading}
            />
          </label>

          <label>
            Raggio operativo (km)
            <input
              type="number"
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              min={5}
              max={300}
              disabled={loading}
            />
          </label>

          {err && <div style={{ color: "var(--danger)" }}>{err}</div>}

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              className="btn"
              type="submit"
              disabled={loading || !isLoaded || !user}
            >
              {loading ? "Salvataggio..." : "Salva e continua"}
            </button>

            <button
              className="btn-link"
              type="button"
              onClick={() => nav("/cars")}
              disabled={loading}
            >
              Annulla
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
