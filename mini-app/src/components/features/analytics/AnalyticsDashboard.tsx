import React from 'react';
import { useWebSocketContext } from '@/services/WebSocketContext';
import type { AnalyticsMessage } from '@/types/websocket';
import './AnalyticsDashboard.css';

interface CallStats {
    totalCalls: number;
    averageDuration: number;
    averageSentiment: number;
    commonTopics: { topic: string; count: number }[];
}

export const AnalyticsDashboard: React.FC = () => {
    const [stats, setStats] = React.useState<CallStats>({
        totalCalls: 0,
        averageDuration: 0,
        averageSentiment: 0,
        commonTopics: []
    });

    const { isConnected } = useWebSocketContext();

    // Subscribe to analytics messages
    React.useEffect(() => {
        const handleAnalytics = (message: AnalyticsMessage) => {
            const { duration, sentiment, topics } = message.payload;

            setStats(prev => {
                const newTotal = prev.totalCalls + 1;

                // Update topic counts
                const topicCounts = new Map<string, number>();
                [...prev.commonTopics, ...topics.map(t => ({ topic: t, count: 1 }))]
                    .forEach(({ topic, count }) => {
                        topicCounts.set(topic, (topicCounts.get(topic) || 0) + count);
                    });

                const sortedTopics = Array.from(topicCounts.entries())
                    .map(([topic, count]) => ({ topic, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5);

                return {
                    totalCalls: newTotal,
                    averageDuration: (prev.averageDuration * (newTotal - 1) + duration) / newTotal,
                    averageSentiment: (prev.averageSentiment * (newTotal - 1) + sentiment) / newTotal,
                    commonTopics: sortedTopics
                };
            });
        };

        // Add WebSocket message handler
        const unsubscribe = subscribeToAnalytics(handleAnalytics);
        return () => unsubscribe();
    }, []);

    return (
        <div className="analytics-dashboard">
            <h2 className="dashboard-title">Call Analytics</h2>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">{stats.totalCalls}</div>
                    <div className="stat-label">Total Calls</div>
                </div>

                <div className="stat-card">
                    <div className="stat-value">
                        {Math.round(stats.averageDuration / 60)}m {Math.round(stats.averageDuration % 60)}s
                    </div>
                    <div className="stat-label">Average Duration</div>
                </div>

                <div className="stat-card">
                    <div className="stat-value">
                        {stats.averageSentiment > 0 ? '😊' : stats.averageSentiment < 0 ? '😕' : '😐'}
                        {Math.abs(stats.averageSentiment).toFixed(1)}
                    </div>
                    <div className="stat-label">Average Sentiment</div>
                </div>
            </div>

            <div className="topics-section">
                <h3 className="section-title">Common Topics</h3>
                <div className="topics-list">
                    {stats.commonTopics.map(({ topic, count }, index) => (
                        <div key={topic} className="topic-item">
                            <span className="topic-name">{topic}</span>
                            <span className="topic-count">{count}</span>
                        </div>
                    ))}
                </div>
            </div>

            {!isConnected && (
                <div className="connection-warning">
                    ⚠️ Disconnected - Some data may be unavailable
                </div>
            )}
        </div>
    );
};

// Helper function to subscribe to analytics messages
function subscribeToAnalytics(handler: (message: AnalyticsMessage) => void) {
    const ws = new WebSocket(import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws');

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'analytics') {
                handler(message as AnalyticsMessage);
            }
        } catch (error) {
            console.error('Error processing analytics message:', error);
        }
    };

    return () => ws.close();
}