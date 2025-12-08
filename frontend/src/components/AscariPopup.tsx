import React from "react";

export default function AscariPopup({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: "#111",
          padding: "24px 32px",
          borderRadius: 12,
          border: "2px solid var(--danger)",
          boxShadow: "0 0 25px rgba(255,0,0,0.25)",
          animation: "ascari-pop .25s ease-out",
          maxWidth: 380,
        }}
      >
        <h3 style={{ color: "var(--danger)", marginTop: 0 }}>
          ⚠ Attenzione
        </h3>
        <p style={{ color: "#fff", marginBottom: 20 }}>{message}</p>

        <button
          className="btn"
          style={{ width: "100%" }}
          onClick={onClose}
        >
          OK
        </button>
      </div>

      <style>
        {`
        @keyframes ascari-pop {
          from { transform: scale(.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}
      </style>
    </div>
  );
}
