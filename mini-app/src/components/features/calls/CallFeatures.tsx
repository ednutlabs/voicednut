import React, { useState } from 'react';
import { useWebSocketContext } from '@/services/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types/auth';
import './CallFeatures.css';

interface CallSettings {
    phoneNumber: string;
    prompt: string;
    firstMessage: string;
    voiceStyle: string;
    maxDuration: number;
}

export const CallFeatures: React.FC = () => {
    const { isConnected, error, sendMessage } = useWebSocketContext();
    const { user } = useAuth();
    const [settings, setSettings] = useState<CallSettings>({
        phoneNumber: '',
        prompt: '',
        firstMessage: '',
        voiceStyle: 'professional',
        maxDuration: 300 // 5 minutes default
    });
    const [showAdvanced, setShowAdvanced] = useState(false);

    const handleStartCall = () => {
        if (!validateSettings()) return;

        sendMessage({
            type: 'call_start',
            payload: {
                ...settings,
                userId: user?.id
            }
        });
    };

    const validateSettings = () => {
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        return phoneRegex.test(settings.phoneNumber) &&
            settings.prompt.length > 0 &&
            settings.firstMessage.length > 0;
    };

    const handleSettingsChange = (field: keyof CallSettings, value: string | number) => {
        setSettings(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const getCallCredits = () => {
        if (!user) return 0;

        switch (user.role) {
            case 'admin':
                return 'Unlimited';
            case 'user':
                return '50 credits';
            default:
                return '0 credits';
        }
    };

    return (
        <div className="call-features">
            <div className="call-header">
                <h2>Make a Call</h2>
                <div className="credits-display">
                    💎 {getCallCredits()} remaining
                </div>
            </div>

            <div className="connection-status">
                Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
                {error && <div className="error-message">Error: {error.message}</div>}
            </div>

            <div className="call-form">
                <div className="form-group">
                    <label htmlFor="phoneNumber">Phone Number (E.164 format)</label>
                    <input
                        id="phoneNumber"
                        type="tel"
                        placeholder="+1234567890"
                        value={settings.phoneNumber}
                        onChange={e => handleSettingsChange('phoneNumber', e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="prompt">AI Agent Prompt</label>
                    <textarea
                        id="prompt"
                        placeholder="Describe how the AI should behave..."
                        value={settings.prompt}
                        onChange={e => handleSettingsChange('prompt', e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="firstMessage">First Message</label>
                    <textarea
                        id="firstMessage"
                        placeholder="Enter the first message the AI will say..."
                        value={settings.firstMessage}
                        onChange={e => handleSettingsChange('firstMessage', e.target.value)}
                    />
                </div>

                <button
                    className="advanced-toggle"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                >
                    {showAdvanced ? '▼' : '▶'} Advanced Settings
                </button>

                {showAdvanced && (
                    <div className="advanced-settings">
                        <div className="form-group">
                            <label htmlFor="voiceStyle">Voice Style</label>
                            <select
                                id="voiceStyle"
                                value={settings.voiceStyle}
                                onChange={e => handleSettingsChange('voiceStyle', e.target.value)}
                            >
                                <option value="professional">Professional</option>
                                <option value="friendly">Friendly</option>
                                <option value="casual">Casual</option>
                            </select>
                        </div>

                        {user?.role === 'admin' && (
                            <div className="form-group">
                                <label htmlFor="maxDuration">Max Duration (seconds)</label>
                                <input
                                    id="maxDuration"
                                    type="number"
                                    min="60"
                                    max="3600"
                                    value={settings.maxDuration}
                                    onChange={e => handleSettingsChange('maxDuration', parseInt(e.target.value, 10))}
                                />
                            </div>
                        )}
                    </div>
                )}

                <div className="call-controls">
                    <button
                        className="call-button"
                        onClick={handleStartCall}
                        disabled={!isConnected || !validateSettings()}
                    >
                        {isConnected ? '📞 Start Call' : '⌛ Connecting...'}
                    </button>
                </div>
            </div>

            {user?.role === 'admin' && (
                <div className="admin-tools">
                    <h3>Admin Tools</h3>
                    <div className="admin-buttons">
                        <button onClick={() => sendMessage({ type: 'monitor_calls' })}>
                            🔍 Monitor Active Calls
                        </button>
                        <button onClick={() => sendMessage({ type: 'system_health' })}>
                            🏥 Check System Health
                        </button>
                        <button onClick={() => sendMessage({ type: 'clear_errors' })}>
                            🧹 Clear Error Logs
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};