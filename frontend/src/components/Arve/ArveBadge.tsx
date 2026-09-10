import React from 'react';
import type { ArveSourceType } from '../../types/arve';

type Props = {
  sourceType: ArveSourceType;
  matches: number;
  marketReferences?: number;
};

function sourceLabel(sourceType: ArveSourceType) {
  switch (sourceType) {
    case 'OPENAI_HYBRID_DATASET':
      return 'AI + prezzi ARVE + dataset Ascari';
    case 'OPENAI_MARKET_REFERENCE':
      return 'AI + base prezzi ARVE';
    case 'OPENAI_PRIVATE_DATASET':
      return 'AI + dataset Ascari';
    case 'OPENAI_NO_PRIVATE_MATCHES':
      return 'AI, dataset in crescita';
    case 'HYBRID_FALLBACK':
      return 'Prezzi ARVE + dataset Ascari';
    case 'MARKET_REFERENCE_FALLBACK':
      return 'Base prezzi ARVE';
    case 'PRIVATE_DATASET_FALLBACK':
      return 'Dataset Ascari, fallback locale';
    default:
      return 'Stima locale iniziale';
  }
}

export default function ArveBadge({
  sourceType,
  matches,
  marketReferences = 0,
}: Props) {
  return (
    <div className="arve-badge-row">
      <span className="arve-badge">{sourceLabel(sourceType)}</span>
      <span className="arve-badge arve-badge--muted">
        {marketReferences} {marketReferences === 1 ? 'riferimento prezzi' : 'riferimenti prezzi'}
      </span>
      <span className="arve-badge arve-badge--muted">
        {matches} {matches === 1 ? 'comparabile Ascari' : 'comparabili Ascari'}
      </span>
    </div>
  );
}
