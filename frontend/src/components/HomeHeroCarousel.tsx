import React, { useEffect, useState } from "react";

const slides = [
  {
    video: "/video/hero-car.mp4",
    title: "Trova la tua prossima auto.",
    subtitle: "Oppure vendila in pochi minuti.",
  },
  {
    video: "/video/hero-inspection.mp4",
    title: "Ogni auto viene verificata.",
    subtitle: "Perizie professionali. Più trasparenza. Meno sorprese.",
  },
  {
    video: "/video/hero-qrcode.mp4",
    title: "La tua auto non aspetta il compratore. Lo trova.",
    subtitle: "Ogni scansione è una nuova opportunità di vendita.",
  },
  {
    video: "/video/hero-handover.mp4",
    title: "Compra con tranquillità.",
    subtitle: "Ascari ti accompagna fino alla conclusione della vendita.",
  },
];

export default function HomeHeroCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="home-hero-carousel">
      {slides.map((slide, index) => (
        <div
          key={slide.video}
          className={`home-hero-slide ${index === active ? "active" : ""}`}
        >
          <video
            src={slide.video}
            autoPlay
            muted
            loop
            playsInline
            className="home-hero-video"
          />

          <div className="home-hero-overlay" />

          <div className="home-hero-content">
            <span className="home-hero-kicker">ASCARI</span>
            <h1>{slide.title}</h1>
            <p>{slide.subtitle}</p>
          </div>
        </div>
      ))}

      <div className="home-hero-indicators">
        {slides.map((_, index) => (
          <button
            key={index}
            type="button"
            className={`home-hero-indicator ${index === active ? "active" : ""}`}
            onClick={() => setActive(index)}
            aria-label={`Vai alla slide ${index + 1}`}
          >
            <span />
          </button>
        ))}
      </div>
    </section>
  );
}