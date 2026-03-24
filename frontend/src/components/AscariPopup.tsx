import React from "react";

type AscariPopupProps = {
  title?: string;
  message: string;
  variant?: "success" | "error" | "warning" | "info";
  confirmText?: string;
  cancelText?: string;
  onClose?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  closeOnBackdrop?: boolean;
  loading?: boolean;
};

export default function AscariPopup({
  title,
  message,
  variant = "info",
  confirmText = "OK",
  cancelText = "Annulla",
  onClose,
  onConfirm,
  onCancel,
  closeOnBackdrop = true,
  loading = false,
}: AscariPopupProps) {
  const isConfirmMode = !!onConfirm;

  const palette = {
    success: {
      accent: "#34d399",
      border: "rgba(52,211,153,0.45)",
      shadow: "0 0 30px rgba(52,211,153,0.18)",
      title: title || "Operazione completata",
      icon: "✅",
      buttonBg: "linear-gradient(90deg, #69d2ff 0%, #5ce1a8 100%)",
      buttonColor: "#05121c",
    },
    error: {
      accent: "#ff6b6b",
      border: "rgba(255,107,107,0.45)",
      shadow: "0 0 30px rgba(255,107,107,0.18)",
      title: title || "Attenzione",
      icon: "⚠️",
      buttonBg: "linear-gradient(90deg, #ff6b6b 0%, #ff8b6b 100%)",
      buttonColor: "#ffffff",
    },
    warning: {
      accent: "#fbbf24",
      border: "rgba(251,191,36,0.45)",
      shadow: "0 0 30px rgba(251,191,36,0.16)",
      title: title || "Controlla questo passaggio",
      icon: "⚠️",
      buttonBg: "linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)",
      buttonColor: "#111111",
    },
    info: {
      accent: "#69d2ff",
      border: "rgba(105,210,255,0.38)",
      shadow: "0 0 30px rgba(105,210,255,0.16)",
      title: title || "Informazione",
      icon: "ℹ️",
      buttonBg: "linear-gradient(90deg, #69d2ff 0%, #5ce1a8 100%)",
      buttonColor: "#05121c",
    },
  }[variant];

  const handleBackdropClick = () => {
    if (!closeOnBackdrop || loading) return;
    if (onCancel) return onCancel();
    if (onClose) return onClose();
  };

  const handlePrimaryAction = () => {
    if (loading) return;
    if (onConfirm) return onConfirm();
    if (onClose) return onClose();
  };

  const handleSecondaryAction = () => {
    if (loading) return;
    if (onCancel) return onCancel();
    if (onClose) return onClose();
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.68)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        backdropFilter: "blur(5px)",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "linear-gradient(180deg, #081224 0%, #09111d 100%)",
          padding: "26px 24px 22px",
          borderRadius: 18,
          border: `1px solid ${palette.border}`,
          boxShadow: palette.shadow,
          animation: "ascari-pop .22s ease-out",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            {palette.icon}
          </span>

          <h3
            style={{
              color: palette.accent,
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            {palette.title}
          </h3>
        </div>

        <p
          style={{
            color: "rgba(255,255,255,0.88)",
            margin: 0,
            marginBottom: 22,
            lineHeight: 1.6,
            fontSize: 16,
          }}
        >
          {message}
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {isConfirmMode && (
            <button
              type="button"
              className="btn secondary"
              style={{
                flex: 1,
                minWidth: 130,
              }}
              onClick={handleSecondaryAction}
              disabled={loading}
            >
              {cancelText}
            </button>
          )}

          <button
            type="button"
            className="btn"
            style={{
              flex: 1,
              minWidth: 130,
              width: isConfirmMode ? "auto" : "100%",
              background: palette.buttonBg,
              color: palette.buttonColor,
              border: "none",
            }}
            onClick={handlePrimaryAction}
            disabled={loading}
          >
            {loading ? "Attendere..." : confirmText}
          </button>
        </div>
      </div>

      <style>
        {`
          @keyframes ascari-pop {
            from {
              transform: translateY(8px) scale(.96);
              opacity: 0;
            }
            to {
              transform: translateY(0) scale(1);
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
}