/**
 * API Client — Cookie-based Authentication
 *
 * Security model:
 *  - access_token   → HttpOnly, Secure (prod), SameSite=Lax cookie  [set by backend]
 *  - refresh_token  → HttpOnly, Secure (prod), SameSite=Lax cookie  [set by backend]
 *
 * The browser sends cookies automatically on every same-origin request.
 * withCredentials: true is required for cross-origin (dev: 3000 → 3001).
 *
 * We no longer read/write localStorage for tokens.
 * The auth store persists only the user profile (non-sensitive).
 *
 * CSRF: Bearer-token model (Authorization header) is immune to CSRF.
 * Cookie-only flow uses SameSite=Lax which blocks cross-site POSTs.
 * No additional CSRF token is required for this SPA architecture.
 */
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  // REQUIRED: sends HttpOnly cookies with every cross-origin request
  withCredentials: true,
});

// No request interceptor needed — browser sends HttpOnly cookies automatically.
// The Authorization: Bearer fallback for API clients is handled by jwt.strategy.ts.

// Handle 401 globally — attempt cookie-based refresh then redirect
let isRefreshing = false;
let failedQueue: { resolve: (v: any) => void; reject: (e: any) => void }[] = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => apiClient(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // POST /auth/refresh — sends refresh_token cookie automatically
        await axios.post(
          `${API_URL}/api/v1/auth/refresh`,
          {},
          { withCredentials: true },
        );
        // Backend sets new access_token cookie; retry original request
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr);
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
