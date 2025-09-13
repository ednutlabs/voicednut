import { createContext, type PropsWithChildren } from 'react';
import type { WebSocketService } from '@/types/websocket';

export const WebSocketContext = createContext<WebSocketService | null>(null);

export const WebSocketProvider: React.FC<PropsWithChildren<{ service: WebSocketService }>> = ({ 
  children, 
  service 
}) => {
  return (
    <WebSocketContext.Provider value={service}>
      {children}
    </WebSocketContext.Provider>
  );
};
