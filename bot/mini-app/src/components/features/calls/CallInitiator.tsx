import { useState, type FC, type FormEvent, type ChangeEvent } from 'react';
import { useWebSocket } from '@/services/WebSocketContext';

interface CallInitiatorProps {
  onCallInitiated?: () => void;
}

interface CallResponse {
  success: boolean;
  error?: string;
}

const CallInitiator: FC<CallInitiatorProps> = ({ onCallInitiated }) => {
  const wsService = useWebSocket();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      wsService.send('initiate_call', { phoneNumber });
      
      // Subscribe to call initiation response
      wsService.subscribe<CallResponse>('call_initiated', (response) => {
        if (response.success) {
          setPhoneNumber('');
          onCallInitiated?.();
        } else {
          setError(response.error || 'Failed to initiate call');
        }
        setIsLoading(false);
        // Unsubscribe after receiving response
        wsService.unsubscribe('call_initiated', () => {});
      });

      // Set timeout for response
      setTimeout(() => {
        setIsLoading(false);
        setError('Request timed out');
        wsService.unsubscribe('call_initiated', () => {});
      }, 10000);

    } catch {
      setError('Failed to send call request');
      setIsLoading(false);
    }
  };

  const handlePhoneNumberChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Only allow digits, +, and spaces
    const value = e.target.value.replace(/[^\d\s+]/g, '');
    setPhoneNumber(value);
  };

  return (
    <div className="call-initiator">
      <h2>Start New Call</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label htmlFor="phoneNumber">Phone Number:</label>
          <input
            id="phoneNumber"
            type="tel"
            value={phoneNumber}
            onChange={handlePhoneNumberChange}
            placeholder="+1 234 567 8900"
            required
            disabled={isLoading}
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        <button 
          type="submit" 
          disabled={isLoading || !phoneNumber.trim()}
          className={`call-button ${isLoading ? 'loading' : ''}`}
        >
          {isLoading ? 'Initiating Call...' : 'Start Call'}
        </button>
      </form>
    </div>
  );
};

export default CallInitiator;