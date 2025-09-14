// bot/mini-app/src/pages/IndexPage/IndexPage.tsx
import { type FC, useState, useEffect, type FormEvent, useCallback } from 'react';

interface UserStats {
  total_calls: number;
  total_sms: number;
  this_month_calls: number;
  this_month_sms: number;
  success_rate: number;
  last_activity: string;
}

interface CallFormData {
  phone: string;
  prompt: string;
  first_message: string;
}

interface ApiResponse {
  success: boolean;
  error?: string;
}

export const IndexPage: FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'call' | 'sms'>('dashboard');
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callForm, setCallForm] = useState<CallFormData>({
    phone: '',
    prompt: '',
    first_message: ''
  });

  const fetchUserStats = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/user-stats/demo');
      const data = await response.json() as UserStats;
      setUserStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setError('Failed to load user statistics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUserStats();
  }, [fetchUserStats]);

  const handleCallSubmit = useCallback(async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    
    if (!callForm.phone || !callForm.prompt || !callForm.first_message) {
      setError('All fields are required');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/outbound-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: callForm.phone,
          prompt: callForm.prompt,
          first_message: callForm.first_message,
          initData: 'demo'
        })
      });

      const result = await response.json() as ApiResponse;

      if (result.success) {
        alert('Call initiated successfully!');
        setCallForm({ phone: '', prompt: '', first_message: '' });
        await fetchUserStats(); // Refresh stats
      } else {
        setError(result.error ?? 'Call failed');
      }
    } catch (err) {
      console.error('Call error:', err);
      setError('Failed to initiate call');
    } finally {
      setIsLoading(false);
    }
  }, [callForm, fetchUserStats]);

  const renderDashboard = (): JSX.Element => (
    <div style={{ padding: '20px' }}>
      <h1>VoicedNut Dashboard</h1>
      
      {isLoading && <p>Loading...</p>}
      {error && (
        <div style={{
          padding: '16px',
          marginBottom: '20px',
          background: 'rgba(255, 99, 132, 0.1)',
          color: 'rgb(255, 99, 132)',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}
      
      {userStats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div style={{
            background: 'var(--tg-theme-secondary-bg-color)',
            padding: '16px',
            borderRadius: '8px'
          }}>
            <h3>Total Calls</h3>
            <p style={{ fontSize: '2em', margin: '0' }}>{userStats.total_calls}</p>
          </div>
          <div style={{
            background: 'var(--tg-theme-secondary-bg-color)',
            padding: '16px',
            borderRadius: '8px'
          }}>
            <h3>Total SMS</h3>
            <p style={{ fontSize: '2em', margin: '0' }}>{userStats.total_sms}</p>
          </div>
          <div style={{
            background: 'var(--tg-theme-secondary-bg-color)',
            padding: '16px',
            borderRadius: '8px'
          }}>
            <h3>This Month</h3>
            <p>Calls: {userStats.this_month_calls}</p>
            <p>SMS: {userStats.this_month_sms}</p>
          </div>
          <div style={{
            background: 'var(--tg-theme-secondary-bg-color)',
            padding: '16px',
            borderRadius: '8px'
          }}>
            <h3>Success Rate</h3>
            <p style={{ fontSize: '2em', margin: '0' }}>{userStats.success_rate}%</p>
          </div>
        </div>
      )}
    </div>
  );

  const renderCallForm = (): JSX.Element => (
    <div style={{ padding: '20px' }}>
      <h2>Start AI Call</h2>
      <form onSubmit={(e) => { void handleCallSubmit(e); }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: 'var(--tg-theme-text-color)'
          }}>
            Phone Number:
          </label>
          <input
            type="tel"
            value={callForm.phone}
            onChange={(e) => setCallForm(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="+1234567890"
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid var(--tg-theme-hint-color)',
              borderRadius: '4px',
              background: 'var(--tg-theme-bg-color)',
              color: 'var(--tg-theme-text-color)'
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: 'var(--tg-theme-text-color)'
          }}>
            AI Prompt:
          </label>
          <textarea
            value={callForm.prompt}
            onChange={(e) => setCallForm(prev => ({ ...prev, prompt: e.target.value }))}
            placeholder="Describe the AI's personality and behavior..."
            required
            rows={4}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid var(--tg-theme-hint-color)',
              borderRadius: '4px',
              background: 'var(--tg-theme-bg-color)',
              color: 'var(--tg-theme-text-color)',
              resize: 'vertical'
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: 'var(--tg-theme-text-color)'
          }}>
            First Message:
          </label>
          <textarea
            value={callForm.first_message}
            onChange={(e) => setCallForm(prev => ({ ...prev, first_message: e.target.value }))}
            placeholder="What the AI should say when the call connects..."
            required
            rows={3}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid var(--tg-theme-hint-color)',
              borderRadius: '4px',
              background: 'var(--tg-theme-bg-color)',
              color: 'var(--tg-theme-text-color)',
              resize: 'vertical'
            }}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '16px',
            background: 'var(--tg-theme-button-color)',
            color: 'var(--tg-theme-button-text-color)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '16px',
            opacity: isLoading ? 0.7 : 1
          }}
        >
          {isLoading ? 'Starting Call...' : 'Start AI Call'}
        </button>
      </form>
    </div>
  );

  const renderContent = (): JSX.Element => {
    switch (activeTab) {
      case 'call':
        return renderCallForm();
      case 'sms':
        return (
          <div style={{ padding: '20px' }}>
            <h2>SMS Feature</h2>
            <p>SMS functionality coming soon...</p>
          </div>
        );
      default:
        return renderDashboard();
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid var(--tg-theme-hint-color)',
        background: 'var(--tg-theme-secondary-bg-color)'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>VoicedNut</h1>
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        {renderContent()}
      </div>

      {/* Navigation */}
      <div style={{
        display: 'flex',
        borderTop: '1px solid var(--tg-theme-hint-color)',
        background: 'var(--tg-theme-secondary-bg-color)'
      }}>
        <button
          onClick={() => setActiveTab('dashboard')}
          style={{
            flex: 1,
            padding: '12px',
            border: 'none',
            background: activeTab === 'dashboard' ? 'var(--tg-theme-button-color)' : 'transparent',
            color: activeTab === 'dashboard' ? 'var(--tg-theme-button-text-color)' : 'var(--tg-theme-text-color)',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('call')}
          style={{
            flex: 1,
            padding: '12px',
            border: 'none',
            background: activeTab === 'call' ? 'var(--tg-theme-button-color)' : 'transparent',
            color: activeTab === 'call' ? 'var(--tg-theme-button-text-color)' : 'var(--tg-theme-text-color)',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          AI Call
        </button>
        <button
          onClick={() => setActiveTab('sms')}
          style={{
            flex: 1,
            padding: '12px',
            border: 'none',
            background: activeTab === 'sms' ? 'var(--tg-theme-button-color)' : 'transparent',
            color: activeTab === 'sms' ? 'var(--tg-theme-button-text-color)' : 'var(--tg-theme-text-color)',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          SMS
        </button>
      </div>
    </div>
  );
};