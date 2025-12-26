import React from "react";
import "./OfferPopup.css";

export default function OfferPopup({ prices, onSelect, onClose }) {
  return (
    <div className="offer-overlay">
      <div className="offer-popup">
        <h2>Fai un'offerta</h2>
        <p>Seleziona uno dei prezzi proposti dal proprietario:</p>

        <div className="offer-buttons">
          {prices.map((p, i) => (
            <button
              key={i}
              className="offer-btn"
              onClick={() => onSelect(p)}
            >
              {p.toLocaleString()} €
            </button>
          ))}
        </div>

        <button className="close-btn" onClick={onClose}>Chiudi</button>
      </div>
    </div>
  );

  
}
