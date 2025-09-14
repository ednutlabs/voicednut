import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types/auth';
import { Skeleton } from '@/components/common/Skeleton/Skeleton';
import './UserList.css';

export const UserList: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    // Fetch users
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await fetch('/api/admin/users');
                const data = await response.json();

                if (data.success) {
                    setUsers(data.users);
                } else {
                    setError(data.error || 'Failed to fetch users');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch users');
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, []);

    const handleUserAction = async (action: 'activate' | 'deactivate' | 'delete', userId: number) => {
        if (!currentUser?.role === 'admin') return;

        try {
            const response = await fetch(`/api/admin/users/${userId}/${action}`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                // Update local state based on action
                setUsers(prevUsers => {
                    switch (action) {
                        case 'delete':
                            return prevUsers.filter(u => u.id !== userId);
                        case 'activate':
                        case 'deactivate':
                            return prevUsers.map(u =>
                                u.id === userId ? { ...u, isActive: action === 'activate' } : u
                            );
                        default:
                            return prevUsers;
                    }
                });
            } else {
                setError(data.error || `Failed to ${action} user`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to ${action} user`);
        }
    };

    if (loading) {
        return (
            <div className="user-list-loading">
                <Skeleton height={50} className="user-skeleton" />
                <Skeleton height={50} className="user-skeleton" />
                <Skeleton height={50} className="user-skeleton" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="user-list-error">
                <p>❌ {error}</p>
                <button onClick={() => window.location.reload()}>
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="user-list">
            <div className="user-list-header">
                <h2>User Management</h2>
                <div className="user-stats">
                    <span>Total Users: {users.length}</span>
                    <span>Active: {users.filter(u => u.isActive).length}</span>
                </div>
            </div>

            <div className="user-table">
                <div className="table-header">
                    <div className="col-user">User</div>
                    <div className="col-role">Role</div>
                    <div className="col-status">Status</div>
                    <div className="col-actions">Actions</div>
                </div>

                {users.map(user => (
                    <div key={user.id} className="table-row">
                        <div className="col-user">
                            <span className="username">{user.username}</span>
                            <span className="telegram-id">ID: {user.telegramId}</span>
                        </div>

                        <div className="col-role">
                            <span className={`role-badge ${user.role}`}>
                                {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                            </span>
                        </div>

                        <div className="col-status">
                            <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                                {user.isActive ? '🟢 Active' : '⭘ Inactive'}
                            </span>
                        </div>

                        <div className="col-actions">
                            {user.isActive ? (
                                <button
                                    className="action-button deactivate"
                                    onClick={() => handleUserAction('deactivate', user.id)}
                                >
                                    Deactivate
                                </button>
                            ) : (
                                <button
                                    className="action-button activate"
                                    onClick={() => handleUserAction('activate', user.id)}
                                >
                                    Activate
                                </button>
                            )}

                            <button
                                className="action-button delete"
                                onClick={() => handleUserAction('delete', user.id)}
                            >
                                Delete
                            </button>

                            <button
                                className="action-button view"
                                onClick={() => setSelectedUser(user)}
                            >
                                View
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {selectedUser && (
                <div className="user-details-modal">
                    <div className="modal-content">
                        <h3>User Details</h3>
                        <div className="user-details">
                            <p><strong>Username:</strong> {selectedUser.username}</p>
                            <p><strong>Telegram ID:</strong> {selectedUser.telegramId}</p>
                            <p><strong>Role:</strong> {selectedUser.role}</p>
                            <p><strong>Status:</strong> {selectedUser.isActive ? 'Active' : 'Inactive'}</p>
                            <p><strong>Created:</strong> {new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                            <p><strong>Last Active:</strong> {new Date(selectedUser.lastActive).toLocaleDateString()}</p>
                        </div>
                        <button onClick={() => setSelectedUser(null)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
};