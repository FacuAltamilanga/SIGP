import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clearAuth } from '../../lib/auth';

export function LogoutButton() {
  const navigate = useNavigate();
  function logout() {
    clearAuth();
    navigate('/login', { replace: true });
  }
  return <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700" aria-label="Cerrar sesión"><LogOut size={16} />Cerrar sesión</button>;
}
