import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ShareButton.css";

type ShareButtonProps = {
  carId: number;
  title: string;
  year?: number | null;
  imageUrl?: string | null;
  priceEur?: number | null;
  className?: string;
};

type ShareOption = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
};

function ShareIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.7 6.8-4.1" />
      <path d="m8.6 13.3 6.8 4.1" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5Z" />
      <path d="M9.2 8.4c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.8 1.8c.1.3 0 .5-.2.7l-.6.7c-.2.2-.1.4 0 .6.6 1.1 1.5 2 2.6 2.6.2.1.4.2.6 0l.8-1c.2-.2.4-.3.7-.2l1.8.8c.3.1.4.3.4.5 0 .4-.2 1.3-.6 1.7-.4.4-1 .7-1.8.7-1.1 0-2.7-.5-4.5-2.1-2.1-1.8-3.2-4.3-3.2-5.4 0-.6.2-1 .5-1.3Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14.2 8.2V6.7c0-.7.5-.9.9-.9h2.4V2.1L14.2 2C10.9 2 9.8 4 9.8 6.5v1.7H7v4.1h2.8V22h4.4v-9.7h3.1l.5-4.1h-3.6Z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="m21 3-7.8 18-4.5-6.1L3 12l18-9Z" />
      <path d="m8.7 14.9 5-4.5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.3 2H22l-8.1 9.2L23.4 22H16l-5.8-7.6L3.5 22H0l8.5-9.8L-.6 2H7l5.2 6.9L18.3 2Zm-1.3 18h2L5.9 3.9H3.8L17 20Z" />
    </svg>
  );
}

function formatEuro(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return null;

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function openShareWindow(url: string) {
  window.open(url, "_blank", "noopener,noreferrer,width=720,height=620");
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export default function ShareButton({
  carId,
  title,
  year,
  imageUrl,
  priceEur,
  className = "",
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return `/cars/${carId}`;
    return new URL(`/cars/${carId}`, window.location.origin).toString();
  }, [carId]);

  const shareText = useMemo(
    () => `Guarda questo annuncio su Ascari: ${title}${year ? ` (${year})` : ""}`,
    [title, year]
  );

  const formattedPrice = formatEuro(priceEur);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  async function handleCopy() {
    try {
      await copyText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("Impossibile copiare il link", error);
    }
  }

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(shareText);
  const emailSubject = encodeURIComponent(`Annuncio Ascari: ${title}`);
  const emailBody = encodeURIComponent(`${shareText}\n\n${shareUrl}`);

  const options: ShareOption[] = [
    {
      label: copied ? "Link copiato" : "Copia link",
      icon: <CopyIcon />,
      onClick: handleCopy,
    },
    {
      label: "Email",
      icon: <MailIcon />,
      onClick: () => {
        window.location.href = `mailto:?subject=${emailSubject}&body=${emailBody}`;
      },
    },
    {
      label: "WhatsApp",
      icon: <WhatsAppIcon />,
      onClick: () => openShareWindow(`https://wa.me/?text=${encodedText}%20${encodedUrl}`),
    },
    {
      label: "Facebook",
      icon: <FacebookIcon />,
      onClick: () => openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`),
    },
    {
      label: "Telegram",
      icon: <TelegramIcon />,
      onClick: () => openShareWindow(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`),
    },
    {
      label: "X",
      icon: <XIcon />,
      onClick: () => openShareWindow(`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`),
    },
  ];

  const modal = open ? (
    <div
      className="share-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section
        className="share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`share-modal-title-${carId}`}
      >
        <header className="share-modal-header">
          <h2 id={`share-modal-title-${carId}`}>Condividi questo annuncio</h2>
          <button
            ref={closeRef}
            type="button"
            className="share-modal-close"
            aria-label="Chiudi finestra di condivisione"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </header>

        <div className="share-car-preview">
          <img
            src={imageUrl || "/cars/placeholder.jpg"}
            alt=""
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = "/cars/placeholder.jpg";
            }}
          />

          <div className="share-car-preview-copy">
            {formattedPrice && <strong className="share-car-price">{formattedPrice}</strong>}
            <strong className="share-car-title">{title}</strong>
            <span>{year ? `${title} — ${year}` : "Annuncio auto su Ascari"}</span>
          </div>
        </div>

        <div className="share-options-grid">
          {options.map((option) => (
            <button
              key={option.label === "Link copiato" ? "Copia link" : option.label}
              type="button"
              className={`share-option ${option.label === "Link copiato" ? "is-copied" : ""}`}
              onClick={option.onClick}
            >
              <span className="share-option-icon">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`share-trigger ${className}`.trim()}
        aria-label={`Condividi ${title}`}
        title="Condividi annuncio"
        onClick={() => setOpen(true)}
      >
        <ShareIcon />
      </button>

      {modal && typeof document !== "undefined" ? createPortal(modal, document.body) : null}
    </>
  );
}
