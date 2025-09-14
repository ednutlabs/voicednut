import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import './Navigation.css';

export const Navigation: React.FC = () => {
    const { user, logout } = useAuth();
    const location = useLocation();

    // Define navigation items based on user role
    const getNavItems = () => {
        const items = [];

        if (user?.role === 'admin') {
            items.push(
                { to: '/admin', icon: '🎛️', label: 'Admin Panel' },
                { to: '/admin/users', icon: '👥', label: 'Users' },
                { to: '/admin/analytics', icon: '📊', label: 'Analytics' },
                { to: '/admin/settings', icon: '⚙️', label: 'System Settings' }
            );
        } else {
            items.push(
                { to: '/dashboard', icon: '🏠', label: 'Dashboard' },
                { to: '/calls', icon: '📞', label: 'Make Calls' },
                { to: '/history', icon: '📝', label: 'Call History' },
                { to: '/settings', icon: '⚙️', label: 'Settings' }
            );
        }

        return items;
    };

    return (
        <nav className="navigation">
            <div className="nav-header">
                <div className="app-logo">🤖 VoicedNut</div>
                <div className="user-info">
                    <span className="username">{user?.username}</span>
                    <span className={`role-badge ${user?.role}`}>
                        {user?.role.charAt(0).toUpperCase() + user?.role.slice(1)}
                    </span>
                </div>
            </div>

            <div className="nav-links">
                {getNavItems().map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `nav-link ${isActive ? 'active' : ''}`
                        }
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span className="nav-label">{item.label}</span>
                    </NavLink>
                ))}
            </div>

            <div className="nav-footer">
                <button className="logout-button" onClick={logout}>
                    🚪 Logout
                </button>
            </div>
        </nav>
    );
};