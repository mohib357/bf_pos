/**
 * Auth Store — Cookie-based Session
 *
 * Tokens (access_token, refresh_token) live ONLY in HttpOnly cookies
 * set by the backend. This store holds only the user profile, which
 * is non-sensitive and safe to persist in localStorage.
 *
 * Token storage summary:
 *  BEFORE: localStorage.setItem('accessToken', ...)  ← XSS-readable ❌
 *  AFTER:  HttpOnly cookie set by backend             ← XSS-proof   ✓
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '@/lib/api';

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  firstName: string;
  lastName?: string;
  firstNameBn?: string;
  lastNameBn?: string;
  avatar?: string | null;
  branchId?: string;
  isSuperAdmin: boolean;
  roles: string[];
  permissions: string[];
  mustChangePwd?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,

      login: async (username, password) => {
        // POST login — backend sets access_token + refresh_token HttpOnly cookies
        const res = await apiClient.post('/auth/login', { username, password });
        const { user } = res.data.data;
        // Store only user profile — no tokens in JS memory or localStorage
        set({ user, isAuthenticated: true });
      },

      logout: async () => {
        try {
          // POST logout — backend revokes DB refresh token, clears cookies
          await apiClient.post('/auth/logout', {});
        } catch {
          // Even if the request fails, clear local state
        }
        set({ user: null, isAuthenticated: false });
      },

      refreshUser: async () => {
        try {
          const res = await apiClient.get('/auth/profile');
          const user = res.data.data;
          const { passwordHash: _, ...safeUser } = user;
          set({ user: safeUser, isAuthenticated: true });
        } catch {
          set({ user: null, isAuthenticated: false });
        }
      },

      hasPermission: (permission: string) => {
        const { user } = get();
        if (!user) return false;
        if (user.isSuperAdmin) return true;
        return user.permissions.includes(permission);
      },
    }),
    {
      name: 'bf-pos-auth',
      // Only persist the user profile — never tokens
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
