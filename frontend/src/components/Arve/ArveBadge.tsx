import React from 'react';
import type { ArveSourceType } from '../../types/arve';

type Props = {
  sourceType: ArveSourceType;
  matches: number;
};

function sourceLabel(sourceType: ArveSourceType) {
  switch (sourceType) {
    case 'OPENAI_PRIVATE_DATASET':
      return 'AI + dataset Ascari';
    case 'OPENAI_NO_PRIVATE_MATCHES':
      return 'AI, dataset in crescita';
    case 'PRIVATE_DATASET_FALLBACK':
      return 'Dataset Ascari, fallback locale';
    default:
      return 'Stima locale iniziale';
  }
}

export default function ArveBadge({ sourceType, matches }: Props) {
  return (
    <div className="arve-badge-row">
      <span className="arve-badge">{sourceLabel(sourceType)}</span>
      <span className="arve-badge arve-badge--muted">
        {matches} {matches === 1 ? 'comparabile' : 'comparabili'}
      </span>
    </div>
  );
}
