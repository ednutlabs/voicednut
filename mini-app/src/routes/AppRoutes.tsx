import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/common/ProtectedRoute/ProtectedRoute';
import { AdminDashboard } from '@/components/features/admin/AdminDashboard';
import { UserDashboard } from '@/components/features/users/UserDashboard';
import { CallFeatures } from '@/components/features/calls/CallFeatures';
import { Settings } from '@/components/features/settings/Settings';
import { Navigation } from './Navigation';
import './AppRoutes.css';

export const AppRoutes: React.FC = () => {
    const { isAuthenticated, user } = useAuth();

    return (
        <div className="app-layout">
            {isAuthenticated && <Navigation />}

            <main className="app-content">
                <Routes>
                    {/* Public routes */}
                    <Route
                        path="/login"
                        element={
                            isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
                        }
                    />

                    {/* Protected routes */}
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                {user?.role === 'admin' ? <Navigate to="/admin" /> : <Navigate to="/dashboard" />}
                            </ProtectedRoute>
                        }
                    />

                    {/* Admin routes */}
                    <Route
                        path="/admin/*"
                        element={
                            <ProtectedRoute requiredRole="admin">
                                <AdminDashboard />
                            </ProtectedRoute>
                        }
                    />

                    {/* User routes */}
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <UserDashboard />
                            </ProtectedRoute>
                        }
                    />

                    <Route
                        path="/calls"
                        element={
                            <ProtectedRoute>
                                <CallFeatures />
                            </ProtectedRoute>
                        }
                    />

                    <Route
                        path="/settings"
                        element={
                            <ProtectedRoute>
                                <Settings />
                            </ProtectedRoute>
                        }
                    />

                    {/* Catch-all route */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
        </div>
    );
};