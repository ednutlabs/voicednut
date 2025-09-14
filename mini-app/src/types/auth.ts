export type UserRole = 'admin' | 'user' | 'guest';

export interface User {
    id: number;
    username: string;
    role: UserRole;
    telegramId: string;
    createdAt: string;
    lastActive: string;
    isActive: boolean;
}

export interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
}

export interface AuthContextType extends AuthState {
    login: (telegramId: string) => Promise<void>;
    logout: () => void;
    checkAuth: () => Promise<void>;
}

export interface LoginResponse {
    user: User;
    success: boolean;
    error?: string;
}