import { useContext } from 'react';
import { WebSocketContext } from '@/contexts/WebSocketContext';
import type { WebSocketService } from '@/types/websocket';

export function useWebSocket(): WebSocketService {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
