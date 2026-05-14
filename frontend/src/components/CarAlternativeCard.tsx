// frontend/src/components/CarAlternativeCard.tsx

import React from "react";
import { useNavigate } from "react-router-dom";

export type AlternativeCar = {
  id: number;
  make: string;
  model: string;
  title?: string | null;
  year?: number | null;
  coverUrl?: string | null;
  photos?: string[] | null;
  priceEur?: number | null;
  mileageKm?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  city?: string | null;
};

type Props = {
  car: AlternativeCar;
  onClick?: (car: AlternativeCar) => void;
};

function formatEuro(value?: number | null) {
  if (!value) return null;

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getImage(car: AlternativeCar) {
  return (
    car.coverUrl ||
    (Array.isArray(car.photos) && car.photos[0]) ||
    "/cars/placeholder.jpg"
  );
}

export default function CarAlternativeCard({ car, onClick }: Props) {
  const navigate = useNavigate();

  const title =
    car.title ||
    `${car.make ?? ""} ${car.model ?? ""}`.trim() ||
    "Auto disponibile";

  const price = formatEuro(car.priceEur);

  function handleClick() {
    if (onClick) {
      onClick(car);
      return;
    }

    navigate(`/cars/${car.id}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: "1px solid rgba(255,255,255,0.12)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
        borderRadius: 18,
        overflow: "hidden",
        padding: 0,
        cursor: "pointer",
        color: "white",
        boxShadow: "0 14px 36px rgba(0,0,0,0.26)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 120,
          overflow: "hidden",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <img
          src={getImage(car)}
          alt={title}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />

        {car.year ? (
          <span
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              padding: "5px 9px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.58)",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 800,
              backdropFilter: "blur(6px)",
            }}
          >
            {car.year}
          </span>
        ) : null}
      </div>

      <div style={{ padding: 13 }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: 15.5,
            lineHeight: 1.25,
            marginBottom: 5,
          }}
        >
          {title}
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.68)",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {car.make} {car.model}
          {car.city ? ` · ${car.city}` : ""}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 10,
          }}
        >
          {car.fuelType ? (
            <span style={chipStyle}>{car.fuelType}</span>
          ) : null}

          {car.transmission ? (
            <span style={chipStyle}>{car.transmission}</span>
          ) : null}

          {car.mileageKm ? (
            <span style={chipStyle}>
              {car.mileageKm.toLocaleString("it-IT")} km
            </span>
          ) : null}
        </div>

        {price ? (
          <div
            style={{
              marginTop: 12,
              color: "#34d399",
              fontWeight: 950,
              fontSize: 16,
            }}
          >
            {price}
          </div>
        ) : null}
      </div>
    </button>
  );
}

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 7px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.78)",
  fontSize: 11.5,
  fontWeight: 700,
};