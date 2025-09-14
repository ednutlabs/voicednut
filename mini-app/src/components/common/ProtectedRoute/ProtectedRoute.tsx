import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types/auth';
import { Skeleton } from '@/components/common/Skeleton/Skeleton';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole?: UserRole | UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    children,
    requiredRole
}) => {
    const { isAuthenticated, isLoading, user } = useAuth();

    // Show loading state
    if (isLoading) {
        return (
            <div style={{ padding: '20px' }}>
                <Skeleton height={200} />
            </div>
        );
    }

    // Check authentication
    if (!isAuthenticated || !user) {
        return <Navigate to="/login" replace />;
    }

    // If no role is required, just check authentication
    if (!requiredRole) {
        return <>{children}</>;
    }

    // Check if user has required role
    const hasRequiredRole = Array.isArray(requiredRole)
        ? requiredRole.includes(user.role)
        : user.role === requiredRole;

    if (!hasRequiredRole) {
        return <Navigate to="/unauthorized" replace />;
    }

    return <>{children}</>;
};