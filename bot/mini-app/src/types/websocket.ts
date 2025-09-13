export interface WebSocketMessage<T = unknown> {
  type: string;
  data: T;
}

export interface WebSocketService {
  send: (event: string, data?: unknown) => void;
  subscribe: <T>(event: string, callback: (data: T) => void) => void;
  unsubscribe: (event: string, callback?: () => void) => void;
}

export interface AnalyticsData {
  callMetrics: CallMetrics;
  voiceMetrics: VoiceMetrics;
  aiMetrics: AIMetrics;
}

export interface CallMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageDuration: number;
  callsByHour: Array<{ hour: number; count: number }>;
  callsByDay: Array<{ date: string; count: number }>;
  responseMetrics: {
    averageResponseTime: number;
    totalResponses: number;
    successRate: number;
  };
}

export interface VoiceMetrics {
  quality: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  latency: number[];
  packetLoss: number[];
}

export interface Subscription {
  unsubscribe: () => void;
}

export interface WebSocketServiceWithSubscriptions extends WebSocketService {
  subscribeWithAck: <T>(event: string, callback: (data: T) => void) => Subscription;
}


export interface AIMetrics {
  modelPerformance: {
    averageResponseTime: number;
    tokenUsage: number;
    costPerCall: number;
  };
  contextAccuracy: number;
  personalityAdaptation: number;
}