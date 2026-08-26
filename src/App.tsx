import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { LoginScreen } from './app/components/LoginScreen';
import { AdminView } from './app/components/AdminView';
import { NursingView } from './app/components/NursingView';
import { ProtectedRoute } from './app/components/ProtectedRoute';
import { getUserRole, type UserRole } from './lib/auth';

const defaultRouteByRole: Record<UserRole, string> = { admin: '/agenda', enfermeria: '/triaje', medico: '/triaje' };

function PendingView({ title }: { title: string }) {
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-slate-800"><section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"><p className="text-sm font-semibold uppercase tracking-wider text-blue-700">SIGP</p><h1 className="mt-2 text-2xl font-bold">{title}</h1><p className="mt-3 text-slate-600">Esta vista se incorporará en la próxima etapa de implementación.</p></section></main>;
}

function RoleHomeRedirect() {
  const role = getUserRole();
  return <Navigate replace to={role ? defaultRouteByRole[role] : '/login'} />;
}

function AppRoutes() {
  const navigate = useNavigate();
  return <Routes>
    <Route path="/login" element={<LoginScreen onLogin={(role) => navigate(defaultRouteByRole[role], { replace: true })} />} />
    <Route path="/agenda" element={<ProtectedRoute allowedRoles={['admin']}><AdminView /></ProtectedRoute>} />
    <Route path="/triaje" element={<ProtectedRoute allowedRoles={['enfermeria', 'medico']}><NursingView /></ProtectedRoute>} />
    <Route path="/hcd/:pacienteId" element={<ProtectedRoute allowedRoles={['medico']}><PendingView title="Historia clínica digital" /></ProtectedRoute>} />
    <Route path="/" element={<RoleHomeRedirect />} />
    <Route path="*" element={<RoleHomeRedirect />} />
  </Routes>;
}

export default function App() {
  return <HashRouter><AppRoutes /></HashRouter>;
}
