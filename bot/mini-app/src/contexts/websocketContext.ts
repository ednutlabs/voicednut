// create websocket context
import { createContext } from 'react';
import type { WebSocketService } from '@/types/websocket';

export const WebSocketContext = createContext<WebSocketService | null>(null);