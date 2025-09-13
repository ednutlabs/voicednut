import React from 'react';
import { useWebSocket } from '../../../services/WebSocketContext';

interface CallData {
  id: string;
  phoneNumber: string;
  duration: number;
  status: string;
  timestamp: string;
}

const CallMonitor: React.FC = () => {
  const wsService = useWebSocket();
  const [activeCall, setActiveCall] = React.useState<CallData | null>(null);
  const [callHistory, setCallHistory] = React.useState<CallData[]>([]);

  React.useEffect(() => {
    // Subscribe to call updates
    wsService.subscribe('call_update', (data: CallData) => {
      setActiveCall(data);
    });

    // Subscribe to call history updates
    wsService.subscribe('call_history', (data: CallData[]) => {
      setCallHistory(data);
    });

    // Request initial call history
    wsService.send('get_call_history', {});

    return () => {
      wsService.unsubscribe('call_update', setActiveCall);
      wsService.unsubscribe('call_history', setCallHistory);
    };
  }, [wsService]);

  return (
    <div className="call-monitor">
      <h2>Active Call</h2>
      {activeCall ? (
        <div className="call-info">
          <p>Phone Number: {activeCall.phoneNumber}</p>
          <p>Duration: {activeCall.duration}s</p>
          <p>Status: {activeCall.status}</p>
          <p>Started: {new Date(activeCall.timestamp).toLocaleTimeString()}</p>
        </div>
      ) : (
        <p>No active calls</p>
      )}

      <h3>Recent Calls</h3>
      <div className="call-history">
        {callHistory.map(call => (
          <div key={call.id} className="call-history-item">
            <p>To: {call.phoneNumber}</p>
            <p>Duration: {call.duration}s</p>
            <p>Status: {call.status}</p>
            <p>Time: {new Date(call.timestamp).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CallMonitor;