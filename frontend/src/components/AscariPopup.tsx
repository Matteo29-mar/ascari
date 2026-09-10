import React, { useEffect } from "react";

type AscariPopupProps = {
  title?: string;
  message?: string;
  variant?: "success" | "error" | "warning" | "info";
  confirmText?: string;
  cancelText?: string;
  onClose?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  closeOnBackdrop?: boolean;
  loading?: boolean;
  showCloseButton?: boolean;
  maxWidth?: number;
  children?: React.ReactNode;
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
  showCloseButton = true,
  maxWidth = 500,
  children,
}: AscariPopupProps) {
  const isConfirmMode = !!onConfirm;

  const palette = {
    success: {
      accent: "#34d399",
      border: "rgba(52,211,153,0.35)",
      shadow: "0 20px 60px rgba(52,211,153,0.16)",
      title: title || "Operazione completata",
      icon: "✅",
      badgeBg: "rgba(52,211,153,0.14)",
      buttonBg: "linear-gradient(90deg, #69d2ff 0%, #5ce1a8 100%)",
      buttonColor: "#05121c",
    },
    error: {
      accent: "#ff6b6b",
      border: "rgba(255,107,107,0.35)",
      shadow: "0 20px 60px rgba(255,107,107,0.16)",
      title: title || "Attenzione",
      icon: "⚠️",
      badgeBg: "rgba(255,107,107,0.14)",
      buttonBg: "linear-gradient(90deg, #ff6b6b 0%, #ff8b6b 100%)",
      buttonColor: "#ffffff",
    },
    warning: {
      accent: "#fbbf24",
      border: "rgba(251,191,36,0.35)",
      shadow: "0 20px 60px rgba(251,191,36,0.14)",
      title: title || "Controlla questo passaggio",
      icon: "⚠️",
      badgeBg: "rgba(251,191,36,0.14)",
      buttonBg: "linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)",
      buttonColor: "#111111",
    },
    info: {
      accent: "#69d2ff",
      border: "rgba(105,210,255,0.30)",
      shadow: "0 20px 60px rgba(105,210,255,0.14)",
      title: title || "Informazione",
      icon: "ℹ️",
      badgeBg: "rgba(105,210,255,0.14)",
      buttonBg: "linear-gradient(90deg, #69d2ff 0%, #5ce1a8 100%)",
      buttonColor: "#05121c",
    },
  }[variant];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        if (onCancel) return onCancel();
        if (onClose) return onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [loading, onCancel, onClose]);

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
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        backdropFilter: "blur(8px)",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth,
          background:"var(--bg-card)",
          color: "var(--text)",
          padding: "22px 22px 20px",
          borderRadius: 20,
          border: `1px solid ${palette.border}`,
          boxShadow: palette.shadow,
          animation: "ascari-pop .22s ease-out",
          position: "relative",
        }}
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={handleSecondaryAction}
            disabled={loading}
            aria-label="Chiudi popup"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 36,
              height: 36,
              borderRadius: 999,
              border: "1px solid var(--panel-strong)",
              background: "var(--panel)",
              color: "var(--text)",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            marginBottom: 14,
            paddingRight: 44,
          }}
        >
          <div
            style={{
              minWidth: 48,
              width: 48,
              height: 48,
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: palette.badgeBg,
              border: `1px solid ${palette.border}`,
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            {palette.icon}
          </div>

          <div style={{ flex: 1 }}>
            <h3
              style={{
                color: "var(--text)",
                margin: 0,
                fontSize: 24,
                fontWeight: 800,
                lineHeight: 1.15,
              }}
            >
              {palette.title}
            </h3>

            <div
              style={{
                marginTop: 8,
                width: 64,
                height: 4,
                borderRadius: 999,
                background: palette.accent,
                opacity: 0.9,
              }}
            />
          </div>
        </div>

        {message ? (
          <div
            style={{
              color: "var(--muted)",
              margin: 0,
              marginBottom: children ? 16 : 22,
              lineHeight: 1.65,
              fontSize: 15.5,
              whiteSpace: "pre-line",
            }}
          >
            {message}
          </div>
        ) : null}

        {children ? (
          <div style={{ marginBottom: 22 }}>
            {children}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {isConfirmMode && (
            <button
              type="button"
              className="btn secondary"
              style={{
                minWidth: 140,
                flex: "1 1 160px",
                opacity: loading ? 0.7 : 1,
                cursor: loading ? "not-allowed" : "pointer",
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
              minWidth: 140,
              flex: "1 1 160px",
              width: isConfirmMode ? "auto" : "100%",
              background: palette.buttonBg,
              color: palette.buttonColor,
              border: "none",
              opacity: loading ? 0.85 : 1,
              cursor: loading ? "not-allowed" : "pointer",
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
              transform: translateY(10px) scale(.97);
              opacity: 0;
            }
            to {
              transform: translateY(0) scale(1);
              opacity: 1;
            }
          }

          @media (max-width: 640px) {
            .ascari-popup-mobile-actions {
              flex-direction: column;
            }
          }
        `}
      </style>
    </div>
  );
}