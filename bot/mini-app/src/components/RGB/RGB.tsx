// bot/mini-app/src/components/RGB/RGB.tsx
import { type FC } from 'react';

interface RGBProps {
  color: string;
}

export const RGB: FC<RGBProps> = ({ color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <div
      style={{
        width: '20px',
        height: '20px',
        backgroundColor: color,
        border: '1px solid var(--tg-theme-hint-color)',
        borderRadius: '4px'
      }}
    />
    <span>{color}</span>
  </div>
);