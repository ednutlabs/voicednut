import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { UserList } from '@/components/features/users/UserList';
import { SystemSettings } from '@/components/features/settings/SystemSettings';
import { CallAnalytics } from '@/components/features/analytics/CallAnalytics';
import './AdminDashboard.css';

export const AdminDashboard: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = React.useState<'users' | 'settings' | 'analytics'>('users');

    if (!user || user.role !== 'admin') {
        return null;
    }

    return (
        <div className="admin-dashboard">
            <header className="admin-header">
                <h1>Admin Dashboard</h1>
                <div className="admin-info">
                    <span>👤 {user.username}</span>
                    <span className="role-badge">Administrator</span>
                </div>
            </header>

            <nav className="admin-nav">
                <button
                    className={`nav-button ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    👥 Users
                </button>
                <button
                    className={`nav-button ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setActiveTab('settings')}
                >
                    ⚙️ System Settings
                </button>
                <button
                    className={`nav-button ${activeTab === 'analytics' ? 'active' : ''}`}
                    onClick={() => setActiveTab('analytics')}
                >
                    📊 Analytics
                </button>
            </nav>

            <main className="admin-content">
                {activeTab === 'users' && <UserList />}
                {activeTab === 'settings' && <SystemSettings />}
                {activeTab === 'analytics' && <CallAnalytics />}
            </main>

            <div className="quick-stats">
                <div className="stat-card">
                    <h3>Active Users</h3>
                    <div className="stat-value">247</div>
                    <div className="stat-trend positive">↑ 12% this week</div>
                </div>
                <div className="stat-card">
                    <h3>Total Calls</h3>
                    <div className="stat-value">1,892</div>
                    <div className="stat-trend positive">↑ 8% this week</div>
                </div>
                <div className="stat-card">
                    <h3>Avg. Call Duration</h3>
                    <div className="stat-value">4m 12s</div>
                    <div className="stat-trend negative">↓ 2% this week</div>
                </div>
                <div className="stat-card">
                    <h3>System Status</h3>
                    <div className="stat-value">98.9%</div>
                    <div className="stat-trend neutral">No changes</div>
                </div>
            </div>
        </div>
    );
};