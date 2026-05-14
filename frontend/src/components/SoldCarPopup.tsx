// frontend/src/components/SoldCarPopup.tsx

import React from "react";
import { useNavigate } from "react-router-dom";
import AscariPopup from "./AscariPopup";
import CarAlternativeCard, { AlternativeCar } from "./CarAlternativeCard";

type Props = {
  open: boolean;
  car?: {
    make?: string | null;
    model?: string | null;
    title?: string | null;
  } | null;
  alternatives?: AlternativeCar[];
  onClose?: () => void;
  onSelectAlternative?: (car: AlternativeCar) => void;
};

export default function SoldCarPopup({
  open,
  car,
  alternatives = [],
  onClose,
  onSelectAlternative,
}: Props) {
  const navigate = useNavigate();

  if (!open) return null;

  const carName =
    car?.title ||
    `${car?.make ?? ""} ${car?.model ?? ""}`.trim() ||
    "l’auto che stai guardando";

  function goHome() {
    if (onClose) onClose();
    navigate("/cars");
  }

  function handleSelectAlternative(alt: AlternativeCar) {
    if (onSelectAlternative) {
      onSelectAlternative(alt);
      return;
    }

    if (onClose) onClose();
    navigate(`/cars/${alt.id}`);
  }

  return (
    <AscariPopup
      title="Auto venduta"
      message={`Ci dispiace, ${carName} è stata venduta. Ecco delle alternative disponibili.`}
      variant="warning"
      confirmText="Torna alle auto disponibili"
      onClose={goHome}
      showCloseButton={false}
      maxWidth={820}
    >
      <div style={{ display: "grid", gap: 16 }}>
        {alternatives.length > 0 ? (
          <>
            <div
              style={{
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              }}
            >
              {alternatives.slice(0, 3).map((alt) => (
                <CarAlternativeCard
                  key={alt.id}
                  car={alt}
                  onClick={handleSelectAlternative}
                />
              ))}
            </div>

            <button
              type="button"
              className="btn secondary"
              onClick={goHome}
              style={{
                width: "100%",
                marginTop: 2,
              }}
            >
              Guarda tutte le auto disponibili
            </button>
          </>
        ) : (
          <div
            style={{
              padding: 16,
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.84)",
              lineHeight: 1.6,
            }}
          >
            Al momento non abbiamo trovato alternative simili. Puoi tornare al
            catalogo e vedere tutte le auto disponibili.
          </div>
        )}
      </div>
    </AscariPopup>
  );
}