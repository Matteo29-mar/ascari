import React from 'react';
import arveIcon from '../../assets/arve-icon.jpeg';
import './arve.css';

type Props = {
  message?: string;
};

export default function ArvePricingLoading({
  message = 'ARVE sta confrontando la tua auto con il dataset Ascari…',
}: Props) {
  return (
    <div className="arve-overlay" role="status" aria-live="polite">
      <div className="arve-loading-card">
        <img src={arveIcon} alt="ARVE" className="arve-loading-card__icon" />
        <div className="arve-loading-card__content">
          <span className="arve-kicker">Automotive Real Value Engine</span>
          <h2>Calcolo dei prezzi in corso</h2>
          <p>{message}</p>
          <div className="arve-progress" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
