import React from "react";
import { Link } from "react-router-dom";

const CONTENT: Record<string, { title: string; subtitle: string; paragraphs: string[] }> = {
  "chi-siamo": {
    title: "Chi siamo",
    subtitle: "ASCARI mette in contatto privati, concessionarie e professionisti della perizia.",
    paragraphs: [
      "La piattaforma nasce per rendere più semplice trovare, valutare, proporre e vendere un'auto in un unico ambiente digitale.",
      "Le funzioni dedicate a offerte, perizie, mappe, garage pubblici e strumenti per concessionarie aiutano ogni utente a gestire il proprio percorso in modo trasparente.",
    ],
  },
  informazioni: {
    title: "Informazioni",
    subtitle: "Come funziona ASCARI.",
    paragraphs: [
      "Puoi esplorare le auto disponibili, usare i filtri, visualizzarle sulla mappa e consultare i dettagli del venditore.",
      "Gli utenti registrati possono pubblicare auto e gestire offerte. Periziatori e concessionarie dispongono di percorsi di registrazione e strumenti dedicati.",
    ],
  },
  contatti: {
    title: "Contatti",
    subtitle: "Hai bisogno di supporto o vuoi parlare con ASCARI?",
    paragraphs: [
      "Questa sezione è predisposta per ospitare i riferimenti ufficiali di assistenza, partnership commerciali e richieste generali.",
      "Prima della pubblicazione in produzione inserisci qui email, eventuale numero di telefono e canali social ufficiali.",
    ],
  },
};

export default function StaticInfoPage({ page = "informazioni" }: { page?: string }) {
  const content = CONTENT[page] || CONTENT.informazioni;

  return (
    <div className="static-info-page">
      <section className="card static-info-hero">
        <div className="card-body">
          <span className="dealer-profile-kicker">ASCARI</span>
          <h1>{content.title}</h1>
          <p className="static-info-subtitle">{content.subtitle}</p>
          {content.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <div className="static-info-actions">
            <Link className="btn" to="/cars">Esplora le auto</Link>
            <Link className="btn secondary" to="/explore">Apri la mappa</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
