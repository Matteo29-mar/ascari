import React from 'react';
import { getCarColorHex } from '../../constants/carColors';
import './CarColorPicker.css';

type CarColorValueProps = {
  color?: string | null;
};

export default function CarColorValue({ color }: CarColorValueProps) {
  if (!color) return <>—</>;

  return (
    <span className="ascari-car-color-value">
      <span
        className="ascari-car-color-detail-swatch"
        style={{ backgroundColor: getCarColorHex(color) ?? '#94a3b8' }}
        aria-hidden="true"
      />
      <span>{color}</span>
    </span>
  );
}
