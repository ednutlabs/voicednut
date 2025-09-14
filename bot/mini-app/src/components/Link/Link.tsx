// bot/mini-app/src/components/Link/Link.tsx
import { type FC, type PropsWithChildren } from 'react';

interface LinkProps {
  to?: string;
  onClick?: () => void;
}

export const Link: FC<PropsWithChildren<LinkProps>> = ({ 
  to, 
  onClick, 
  children 
}) => {
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      window.open(to, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--tg-theme-link-color)',
        cursor: 'pointer',
        textDecoration: 'underline',
        padding: 0,
        font: 'inherit'
      }}
    >
      {children}
    </button>
  );
};