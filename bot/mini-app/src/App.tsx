// bot/mini-app/src/App.tsx
import { type FC, useEffect, useState } from 'react';
import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import { IndexPage } from '@/pages/IndexPage/IndexPage';

export const App: FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const launchParams = retrieveLaunchParams();
      console.log('Launch params:', launchParams);
      
      setTimeout(() => {
        setIsLoading(false);
      }, 1000);
      
    } catch (err) {
      console.error('Failed to initialize app:', err);
      setError('Failed to initialize application');
      setIsLoading(false);
    }
  }, []);
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'var(--tg-theme-bg-color)',
        color: 'var(--tg-theme-text-color)'
      }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'var(--tg-theme-bg-color)',
        color: 'var(--tg-theme-text-color)',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div>
          <h2>Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--tg-theme-bg-color)',
      color: 'var(--tg-theme-text-color)'
    }}>
      <IndexPage />
    </div>
  );
};