import { AuthUser } from '@/types';

const TOKEN_KEY = 'expense_token';
const USER_KEY = 'expense_user';

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeToken = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const setCurrentUser = (user: AuthUser): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getCurrentUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      return JSON.parse(stored) as AuthUser;
    }
    // Fallback: decode JWT
    const token = getToken();
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload as AuthUser;
  } catch {
    return null;
  }
};

export const isLoggedIn = (): boolean => {
  const token = getToken();
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      removeToken();
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const hasRole = (role: string): boolean => {
  const user = getCurrentUser();
  if (!user) return false;
  return user.roles.includes(role);
};
