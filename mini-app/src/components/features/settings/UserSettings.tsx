import React from 'react';
import './UserSettings.css';

interface UserPreferences {
    defaultPrompt: string;
    defaultGreeting: string;
    voiceStyle: 'friendly' | 'professional' | 'casual';
    responseLength: 'concise' | 'detailed';
    notifications: boolean;
}

export const UserSettings: React.FC = () => {
    const [preferences, setPreferences] = React.useState<UserPreferences>(() => {
        const saved = localStorage.getItem('userPreferences');
        return saved ? JSON.parse(saved) : {
            defaultPrompt: 'You are a helpful AI assistant',
            defaultGreeting: 'Hello! How can I help you today?',
            voiceStyle: 'professional',
            responseLength: 'concise',
            notifications: true
        };
    });

    const handleChange = (field: keyof UserPreferences, value: any) => {
        setPreferences(prev => {
            const updated = { ...prev, [field]: value };
            localStorage.setItem('userPreferences', JSON.stringify(updated));
            return updated;
        });
    };

    return (
        <div className="user-settings">
            <h2 className="settings-title">Settings</h2>

            <div className="settings-section">
                <h3>AI Behavior</h3>

                <div className="setting-item">
                    <label htmlFor="defaultPrompt">Default Agent Prompt</label>
                    <textarea
                        id="defaultPrompt"
                        value={preferences.defaultPrompt}
                        onChange={e => handleChange('defaultPrompt', e.target.value)}
                        placeholder="Enter the default prompt for the AI agent..."
                        rows={3}
                    />
                </div>

                <div className="setting-item">
                    <label htmlFor="defaultGreeting">Default Greeting</label>
                    <input
                        type="text"
                        id="defaultGreeting"
                        value={preferences.defaultGreeting}
                        onChange={e => handleChange('defaultGreeting', e.target.value)}
                        placeholder="Enter the default greeting message..."
                    />
                </div>

                <div className="setting-item">
                    <label htmlFor="voiceStyle">Voice Style</label>
                    <select
                        id="voiceStyle"
                        value={preferences.voiceStyle}
                        onChange={e => handleChange('voiceStyle', e.target.value)}
                    >
                        <option value="friendly">Friendly</option>
                        <option value="professional">Professional</option>
                        <option value="casual">Casual</option>
                    </select>
                </div>

                <div className="setting-item">
                    <label htmlFor="responseLength">Response Length</label>
                    <select
                        id="responseLength"
                        value={preferences.responseLength}
                        onChange={e => handleChange('responseLength', e.target.value)}
                    >
                        <option value="concise">Concise</option>
                        <option value="detailed">Detailed</option>
                    </select>
                </div>
            </div>

            <div className="settings-section">
                <h3>Notifications</h3>

                <div className="setting-item">
                    <label htmlFor="notifications" className="toggle-label">
                        Enable Notifications
                        <input
                            type="checkbox"
                            id="notifications"
                            checked={preferences.notifications}
                            onChange={e => handleChange('notifications', e.target.checked)}
                        />
                        <span className="toggle-switch"></span>
                    </label>
                </div>
            </div>

            <div className="settings-info">
                <p>Settings are automatically saved to your device</p>
            </div>
        </div>
    );
};