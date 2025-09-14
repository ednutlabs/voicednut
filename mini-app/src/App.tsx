import { type FC, useEffect, useState } from 'react';
import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import { IndexPage } from '@/pages/IndexPage/IndexPage';
import { WebSocketProvider } from '@/services/WebSocketContext';
import { WebSocketOptions } from '@/hooks/useWebSocket';

export const App: FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Check if we're in development mode
      if (import.meta.env.DEV) {
        // Mock launch params for development
        console.log('Development mode: Using mock launch params');
        setTimeout(() => {
          setIsLoading(false);
        }, 1000);
      } else {
        // Production mode: Use actual launch params
        const launchParams = retrieveLaunchParams();
        console.log('Launch params:', launchParams);
        setTimeout(() => {
          setIsLoading(false);
        }, 1000);
      }
    } catch (err) {
      console.error('Failed to initialize app:', err);
      setError('Failed to initialize application. If you are running in development mode, please use the Telegram interface or mock the launch params.');
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

  const wsOptions: WebSocketOptions = {
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws',
    reconnectAttempts: 5,
    onMessage: (message) => {
      console.log('WebSocket message received:', message);
    }
  };

  return (
    <WebSocketProvider options={wsOptions}>
      <div style={{
        minHeight: '100vh',
        background: 'var(--tg-theme-bg-color)',
        color: 'var(--tg-theme-text-color)'
      }}>
        <IndexPage />
      </div>
    </WebSocketProvider>
  );
};