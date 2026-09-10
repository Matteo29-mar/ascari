import React from 'react';

function formatEuro(value: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  price: number;
  tone: 'quick' | 'reserve' | 'democratic';
};

export default function ArvePriceCard({
  eyebrow,
  title,
  description,
  price,
  tone,
}: Props) {
  return (
    <article className={`arve-price-card arve-price-card--${tone}`}>
      <div className="arve-price-card__copy">
        <span>{eyebrow}</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="arve-price-card__price">{formatEuro(price)}</div>
    </article>
  );
}
