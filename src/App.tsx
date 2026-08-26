import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { LoginScreen } from './app/components/LoginScreen';
import { AdminView } from './app/components/AdminView';
import { NursingView } from './app/components/NursingView';
import { DoctorView } from './app/components/DoctorView';
import { ProtectedRoute } from './app/components/ProtectedRoute';
import { getUserRole, type UserRole } from './lib/auth';

const defaultRouteByRole: Record<UserRole, string> = { admin: '/agenda', enfermeria: '/triaje', medico: '/triaje' };

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
    <Route path="/hcd/:pacienteId" element={<ProtectedRoute allowedRoles={['medico']}><DoctorView /></ProtectedRoute>} />
    <Route path="/" element={<RoleHomeRedirect />} />
    <Route path="*" element={<RoleHomeRedirect />} />
  </Routes>;
}

export default function App() {
  return <HashRouter><AppRoutes /></HashRouter>;
}
