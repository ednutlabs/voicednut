import { useState, useEffect, type FC } from 'react';
import { useWebSocket } from '@/services/WebSocketContext';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import type { CallMetrics, VoiceMetrics, AIMetrics } from '@/types/websocket';
import 'chartjs-adapter-date-fns';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

const AnalyticsDashboard: FC = () => {
  const wsService = useWebSocket();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d'>('24h');
  const [callMetrics, setCallMetrics] = useState<CallMetrics | null>(null);
  const [voiceMetrics, setVoiceMetrics] = useState<VoiceMetrics | null>(null);
  const [aiMetrics, setAiMetrics] = useState<AIMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Request metrics for the selected time range
    wsService.send('get_analytics', { timeRange });
    
    wsService.subscribe<{
      callMetrics: CallMetrics;
      voiceMetrics: VoiceMetrics;
      aiMetrics: AIMetrics;
    }>('analytics_data', (data) => {
      setCallMetrics(data.callMetrics);
      setVoiceMetrics(data.voiceMetrics);
      setAiMetrics(data.aiMetrics);
      setIsLoading(false);
    });

    wsService.subscribe<string>('analytics_error', (error) => {
      setError(error);
      setIsLoading(false);
    });

    // Subscribe to real-time updates
    wsService.subscribe<{
      type: 'call' | 'voice' | 'ai';
      metrics: CallMetrics | VoiceMetrics | AIMetrics;
    }>('metrics_update', (data) => {
      switch (data.type) {
        case 'call':
          setCallMetrics(prev => prev ? { ...prev, ...data.metrics as CallMetrics } : data.metrics as CallMetrics);
          break;
        case 'voice':
          setVoiceMetrics(prev => prev ? { ...prev, ...data.metrics as VoiceMetrics } : data.metrics as VoiceMetrics);
          break;
        case 'ai':
          setAiMetrics(prev => prev ? { ...prev, ...data.metrics as AIMetrics } : data.metrics as AIMetrics);
          break;
      }
    });

    return () => {
      wsService.unsubscribe('analytics_data', () => {});
      wsService.unsubscribe('analytics_error', () => {});
      wsService.unsubscribe('metrics_update', () => {});
    };
  }, [wsService, timeRange]);

  const callVolumeData = {
    labels: callMetrics?.callsByHour.map(d => d.hour),
    datasets: [
      {
        label: 'Call Volume',
        data: callMetrics?.callsByHour.map(d => d.count),
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }
    ]
  };

  const callStatusData = {
    labels: ['Successful', 'Failed'],
    datasets: [
      {
        data: [
          callMetrics?.successfulCalls || 0,
          callMetrics?.failedCalls || 0
        ],
        backgroundColor: [
          'rgb(75, 192, 192)',
          'rgb(255, 99, 132)'
        ]
      }
    ]
  };

  const voiceQualityData = {
    labels: ['Excellent', 'Good', 'Fair', 'Poor'],
    datasets: [
      {
        data: [
          voiceMetrics?.quality.excellent || 0,
          voiceMetrics?.quality.good || 0,
          voiceMetrics?.quality.fair || 0,
          voiceMetrics?.quality.poor || 0
        ],
        backgroundColor: [
          'rgb(75, 192, 192)',
          'rgb(255, 205, 86)',
          'rgb(255, 159, 64)',
          'rgb(255, 99, 132)'
        ]
      }
    ]
  };

  const latencyData = {
    labels: voiceMetrics?.latency.map((_, i) => i),
    datasets: [
      {
        label: 'Latency (ms)',
        data: voiceMetrics?.latency,
        fill: false,
        borderColor: 'rgb(153, 102, 255)',
        tension: 0.1
      }
    ]
  };

  if (isLoading) {
    return <div className="loading">Loading analytics...</div>;
  }

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <h2>Analytics Dashboard</h2>
        <div className="time-range-selector">
          <button
            className={timeRange === '24h' ? 'active' : ''}
            onClick={() => setTimeRange('24h')}
          >
            24h
          </button>
          <button
            className={timeRange === '7d' ? 'active' : ''}
            onClick={() => setTimeRange('7d')}
          >
            7d
          </button>
          <button
            className={timeRange === '30d' ? 'active' : ''}
            onClick={() => setTimeRange('30d')}
          >
            30d
          </button>
          <button
            className={timeRange === '90d' ? 'active' : ''}
            onClick={() => setTimeRange('90d')}
          >
            90d
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Call Overview</h3>
          <div className="metric-stats">
            <div className="stat-item">
              <span className="stat-label">Total Calls</span>
              <span className="stat-value">{callMetrics?.totalCalls}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Success Rate</span>
              <span className="stat-value">
                {((callMetrics?.successfulCalls || 0) / (callMetrics?.totalCalls || 1) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Avg Duration</span>
              <span className="stat-value">
                {formatDuration(callMetrics?.averageDuration || 0)}
              </span>
            </div>
          </div>
          <div className="chart-container">
            <Doughnut data={callStatusData} options={{
              plugins: {
                legend: {
                  position: 'bottom'
                }
              }
            }} />
          </div>
        </div>

        <div className="metric-card">
          <h3>Call Volume Trends</h3>
          <div className="chart-container">
            <Line data={callVolumeData} options={{
              scales: {
                y: {
                  beginAtZero: true
                }
              },
              plugins: {
                legend: {
                  position: 'bottom'
                }
              }
            }} />
          </div>
        </div>

        <div className="metric-card">
          <h3>Voice Quality</h3>
          <div className="metric-stats">
            <div className="stat-item">
              <span className="stat-label">Avg Latency</span>
              <span className="stat-value">
                {((voiceMetrics?.latency?.reduce((a, b) => a + b, 0) ?? 0) / (voiceMetrics?.latency?.length || 1)).toFixed(1)}ms
              </span>
            </div>
          </div>
          <div className="chart-container">
            <Doughnut data={voiceQualityData} options={{
              plugins: {
                legend: {
                  position: 'bottom'
                }
              }
            }} />
          </div>
        </div>

        <div className="metric-card">
          <h3>Network Performance</h3>
          <div className="chart-container">
            <Line data={latencyData} options={{
              scales: {
                y: {
                  beginAtZero: true
                }
              },
              plugins: {
                legend: {
                  position: 'bottom'
                }
              }
            }} />
          </div>
        </div>

        <div className="metric-card">
          <h3>AI Performance</h3>
          <div className="metric-stats">
            <div className="stat-item">
              <span className="stat-label">Response Time</span>
              <span className="stat-value">
                {aiMetrics?.modelPerformance.averageResponseTime.toFixed(2)}s
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Token Usage</span>
              <span className="stat-value">
                {aiMetrics?.modelPerformance.tokenUsage}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Cost/Call</span>
              <span className="stat-value">
                ${aiMetrics?.modelPerformance.costPerCall.toFixed(3)}
              </span>
            </div>
          </div>
          <div className="metric-stats">
            <div className="stat-item">
              <span className="stat-label">Context Accuracy</span>
              <div className="progress-bar">
                <div
                  className="progress"
                  style={{ width: `${(aiMetrics?.contextAccuracy || 0) * 100}%` }}
                />
              </div>
            </div>
            <div className="stat-item">
              <span className="stat-label">Personality Adaptation</span>
              <div className="progress-bar">
                <div
                  className="progress"
                  style={{ width: `${(aiMetrics?.personalityAdaptation || 0) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default AnalyticsDashboard;