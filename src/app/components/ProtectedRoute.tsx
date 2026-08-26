import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken, getUserRole, type UserRole } from '../../lib/auth';

interface ProtectedRouteProps { allowedRoles: UserRole[]; children: ReactNode; }

/** Redirects anonymous or unauthorized users before rendering protected content. */
export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const location = useLocation();
  const token = getToken();
  const role = getUserRole();
  if (!token || !role) return <Navigate replace to="/login" state={{ from: location }} />;
  if (!allowedRoles.includes(role)) return <Navigate replace to="/" />;
  return <>{children}</>;
}
