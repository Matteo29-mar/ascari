import React from 'react';
import arveIcon from '../../assets/arve-icon.jpeg';
import type { ArvePricingAnalysis } from '../../types/arve';
import ArveBadge from './ArveBadge';
import ArvePriceCard from './ArvePriceCard';
import './arve.css';

type Props = {
  analysis: ArvePricingAnalysis;
  busy?: boolean;
  error?: string | null;
  onAccept: () => void;
  onKeepOriginal: () => void;
};

function formatEuro(value: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ArvePricingModal({
  analysis,
  busy = false,
  error,
  onAccept,
  onKeepOriginal,
}: Props) {
  const confidence = Math.round(analysis.confidence * 100);

  return (
    <div className="arve-overlay" role="dialog" aria-modal="true" aria-labelledby="arve-title">
      <section className="arve-modal">
        <header className="arve-modal__header">
          <img src={arveIcon} alt="ARVE" className="arve-modal__icon" />
          <div>
            <span className="arve-kicker">Automotive Real Value Engine</span>
            <h2 id="arve-title">ARVE ha calcolato 3 prezzi per te</h2>
            <p>
              Puoi applicarli alla card oppure mantenere i prezzi che avevi inserito.
            </p>
          </div>
        </header>

        <ArveBadge
          sourceType={analysis.sourceType}
          matches={analysis.privateMatchesCount}
        />

        <div className="arve-price-list">
          <ArvePriceCard
            eyebrow="Vendita immediata"
            title="Prezzo di ritiro immediato"
            description="Il valore più aggressivo per favorire una vendita rapida."
            price={analysis.quickSalePrice}
            tone="quick"
          />
          <ArvePriceCard
            eyebrow="Minimo consigliato"
            title="Prezzo di riserva"
            description="La soglia prudente sotto la quale ARVE sconsiglia di scendere."
            price={analysis.reservePrice}
            tone="reserve"
          />
          <ArvePriceCard
            eyebrow="Valore equilibrato"
            title="Prezzo di vendita democratico"
            description="Il prezzo centrale suggerito in base alle prove disponibili."
            price={analysis.democraticPrice}
            tone="democratic"
          />
        </div>

        <div className="arve-explanation">
          <p>{analysis.message}</p>
          <div className="arve-metrics">
            <span>
              Fascia stimata <strong>{formatEuro(analysis.marketMin)} – {formatEuro(analysis.marketMax)}</strong>
            </span>
            <span>
              Affidabilità <strong>{confidence}%</strong>
            </span>
            <span>
              Livello prove <strong>{analysis.evidenceLevel}/4</strong>
            </span>
          </div>
        </div>

        {error && <div className="arve-error">{error}</div>}

        <footer className="arve-modal__actions">
          <button
            type="button"
            className="btn secondary"
            onClick={onKeepOriginal}
            disabled={busy}
          >
            Mantieni i miei prezzi
          </button>
          <button type="button" className="btn arve-primary" onClick={onAccept} disabled={busy}>
            {busy ? 'Salvataggio…' : 'Usa i prezzi ARVE'}
          </button>
        </footer>

        <small className="arve-disclaimer">
          ARVE fornisce una stima, non garantisce il prezzo finale né il tempo di vendita.
        </small>
      </section>
    </div>
  );
}
