import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { User, AuthState, AuthContextType } from '@/types/auth';

// Initial state
const initialState: AuthState = {
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null
};

// Auth reducer
type AuthAction =
    | { type: 'LOGIN_START' }
    | { type: 'LOGIN_SUCCESS'; payload: User }
    | { type: 'LOGIN_FAILURE'; payload: string }
    | { type: 'LOGOUT' }
    | { type: 'CLEAR_ERROR' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
    switch (action.type) {
        case 'LOGIN_START':
            return {
                ...state,
                isLoading: true,
                error: null
            };
        case 'LOGIN_SUCCESS':
            return {
                ...state,
                isAuthenticated: true,
                user: action.payload,
                isLoading: false,
                error: null
            };
        case 'LOGIN_FAILURE':
            return {
                ...state,
                isAuthenticated: false,
                user: null,
                isLoading: false,
                error: action.payload
            };
        case 'LOGOUT':
            return {
                ...state,
                isAuthenticated: false,
                user: null,
                isLoading: false,
                error: null
            };
        case 'CLEAR_ERROR':
            return {
                ...state,
                error: null
            };
        default:
            return state;
    }
}

// Create context
const AuthContext = createContext<AuthContextType | null>(null);

// Provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(authReducer, initialState);

    const login = useCallback(async (telegramId: string) => {
        dispatch({ type: 'LOGIN_START' });
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId })
            });

            const data = await response.json();

            if (data.success) {
                dispatch({ type: 'LOGIN_SUCCESS', payload: data.user });
            } else {
                dispatch({ type: 'LOGIN_FAILURE', payload: data.error || 'Login failed' });
            }
        } catch (error) {
            dispatch({
                type: 'LOGIN_FAILURE',
                payload: error instanceof Error ? error.message : 'Login failed'
            });
        }
    }, []);

    const logout = useCallback(() => {
        dispatch({ type: 'LOGOUT' });
        // Clear any stored auth data
        localStorage.removeItem('auth_token');
    }, []);

    const checkAuth = useCallback(async () => {
        dispatch({ type: 'LOGIN_START' });
        try {
            const response = await fetch('/api/auth/check');
            const data = await response.json();

            if (data.success) {
                dispatch({ type: 'LOGIN_SUCCESS', payload: data.user });
            } else {
                dispatch({ type: 'LOGIN_FAILURE', payload: data.error || 'Authentication check failed' });
            }
        } catch (error) {
            dispatch({
                type: 'LOGIN_FAILURE',
                payload: error instanceof Error ? error.message : 'Authentication check failed'
            });
        }
    }, []);

    const value = {
        ...state,
        login,
        logout,
        checkAuth
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook to use auth context
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};