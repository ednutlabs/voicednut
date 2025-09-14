import { useEffect, useRef, useState } from 'react';

export interface WebSocketMessage {
  type: string;
  payload: any;
}

export interface WebSocketOptions {
  url: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  onMessage?: (message: WebSocketMessage) => void;
}

export const useWebSocket = ({ 
  url, 
  reconnectAttempts = 5, 
  reconnectInterval = 1000,
  onMessage 
}: WebSocketOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);

  const connect = () => {
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        attemptRef.current = 0;
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        if (attemptRef.current < reconnectAttempts) {
          attemptRef.current++;
          setTimeout(connect, reconnectInterval * attemptRef.current);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError(new Error('WebSocket error occurred'));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          onMessage?.(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect'));
    }
  };

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [url, reconnectAttempts, reconnectInterval]);

  const sendMessage = (message: WebSocketMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return false;
    }
    
    try {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } catch (err) {
      console.error('Failed to send message:', err);
      return false;
    }
  };

  return { 
    isConnected, 
    error, 
    sendMessage,
    ws: wsRef.current 
  };
};
