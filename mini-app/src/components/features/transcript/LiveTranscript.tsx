import React from 'react';
import { useWebSocketContext } from '@/services/WebSocketContext';
import type { TranscriptMessage } from '@/types/websocket';
import { Skeleton } from '@/components/common/Skeleton/Skeleton';
import './LiveTranscript.css';

interface TranscriptEntry {
    id: string;
    text: string;
    timestamp: number;
    speaker: 'user' | 'agent';
}

export const LiveTranscript: React.FC = () => {
    const [entries, setEntries] = React.useState<TranscriptEntry[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const transcriptRef = React.useRef<HTMLDivElement>(null);
    const { isConnected } = useWebSocketContext();

    // Auto-scroll to bottom when new messages arrive
    React.useEffect(() => {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
        }
    }, [entries]);

    // Subscribe to transcript messages
    React.useEffect(() => {
        setIsLoading(true);

        const handleTranscript = (message: TranscriptMessage) => {
            setIsLoading(false);
            setEntries(prev => [...prev, {
                id: Math.random().toString(36).slice(2),
                ...message.payload
            }]);
        };

        const unsubscribe = subscribeToTranscript(handleTranscript);
        return () => unsubscribe();
    }, []);

    if (isLoading) {
        return (
            <div className="live-transcript">
                <div className="transcript-header">
                    <h3>Live Transcript</h3>
                    <div className="status-indicator loading">Loading...</div>
                </div>
                <div className="transcript-content">
                    <Skeleton height={60} className="transcript-skeleton" />
                    <Skeleton height={40} className="transcript-skeleton" />
                    <Skeleton height={50} className="transcript-skeleton" />
                </div>
            </div>
        );
    }

    return (
        <div className="live-transcript">
            <div className="transcript-header">
                <h3>Live Transcript</h3>
                <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
                    {isConnected ? 'Live' : 'Disconnected'}
                </div>
            </div>

            <div className="transcript-content" ref={transcriptRef}>
                {entries.map(entry => (
                    <div
                        key={entry.id}
                        className={`transcript-entry ${entry.speaker}`}
                    >
                        <div className="entry-content">
                            <div className="speaker-label">
                                {entry.speaker === 'user' ? '👤' : '🤖'}
                                {entry.speaker === 'user' ? 'User' : 'AI Agent'}
                            </div>
                            <div className="entry-text">{entry.text}</div>
                            <div className="entry-time">
                                {new Date(entry.timestamp).toLocaleTimeString()}
                            </div>
                        </div>
                    </div>
                ))}

                {entries.length === 0 && (
                    <div className="no-entries">
                        No transcript available yet. Start a call to see the conversation.
                    </div>
                )}
            </div>
        </div>
    );
};

function subscribeToTranscript(handler: (message: TranscriptMessage) => void) {
    const ws = new WebSocket(import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws');

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'transcript') {
                handler(message as TranscriptMessage);
            }
        } catch (error) {
            console.error('Error processing transcript message:', error);
        }
    };

    return () => ws.close();
}