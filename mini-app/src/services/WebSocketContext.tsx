import React, { createContext, useContext, ReactNode } from 'react';
import { useWebSocket, WebSocketOptions, WebSocketMessage } from '../hooks/useWebSocket';

interface WebSocketContextType {
  isConnected: boolean;
  error: Error | null;
  sendMessage: (message: WebSocketMessage) => boolean;
  ws: WebSocket | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export interface WebSocketProviderProps {
  children: ReactNode;
  options: WebSocketOptions;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
  options
}) => {
  const wsState = useWebSocket(options);

  return (
    <WebSocketContext.Provider value={wsState}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};
