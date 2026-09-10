import React from "react";
import { Link } from "react-router-dom";

export default function AscariFooter() {
  return (
    <footer className="ascari-footer">
      <div className="container ascari-footer-inner">
        <div className="ascari-footer-brand">
          <img src="/logos/logocut.png" alt="ASCARI" />
          <div>
            <strong>ASCARI</strong>
            <p>Il marketplace auto per privati, concessionarie e periziatori.</p>
          </div>
        </div>

        <div className="ascari-footer-columns">
          <div>
            <h3>Società</h3>
            <Link to="/chi-siamo">Chi siamo</Link>
            <Link to="/informazioni">Informazioni</Link>
            <Link to="/contatti">Contatti</Link>
          </div>
          <div>
            <h3>Servizi</h3>
            <Link to="/explore">Mappa delle auto</Link>
            <Link to="/cars#filtri">Filtri</Link>
            <Link to="/cars#marchi-modelli">Marchi e modelli</Link>
          </div>
          <div>
            <h3>Area clienti</h3>
            <Link to="/login">Login</Link>
            <Link to="/inspector/register">Registrati come periziatore</Link>
            <Link to="/dealer/register">Registrati come concessionaria</Link>
          </div>
        </div>
      </div>
      <div className="container ascari-footer-bottom">
        <span>© {new Date().getFullYear()} ASCARI</span>
        <span>Marketplace automotive</span>
      </div>
    </footer>
  );
}
