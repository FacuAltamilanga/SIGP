export const USER_ROLES = ['admin', 'enfermeria', 'medico'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export interface AuthSession { token: string; role: UserRole; }

const TOKEN_KEY = 'sigp.auth.token';
const ROLE_KEY = 'sigp.auth.role';

export function getApiUrl() {
  const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
  if (!apiUrl) throw new Error('Falta configurar VITE_API_URL.');
  return apiUrl;
}

export function toUserRole(value: unknown): UserRole | null {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole) ? value as UserRole : null;
}

export function saveAuth(session: AuthSession) { localStorage.setItem(TOKEN_KEY, session.token); localStorage.setItem(ROLE_KEY, session.role); }
export function clearAuth() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ROLE_KEY); }
export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function getUserRole() { return toUserRole(localStorage.getItem(ROLE_KEY)); }

/** Returns the JWT authorization header for authenticated API calls. */
export function getAuthHeaders(): HeadersInit { const token = getToken(); return token ? { Authorization: `Bearer ${token}` } : {}; }
