import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { LoginScreen } from './app/components/LoginScreen';
import { AdminView } from './app/components/AdminView';
import { NursingView } from './app/components/NursingView';
import { DoctorView } from './app/components/DoctorView';
import { DoctorPatientSearch } from './app/components/DoctorPatientSearch';
import { AlertsPanel } from './app/components/AlertsPanel';
import { LogoutButton } from './app/components/LogoutButton';
import { ProtectedRoute } from './app/components/ProtectedRoute';
import { getUserRole, type UserRole } from './lib/auth';

const defaultRouteByRole: Record<UserRole, string> = { admin: '/agenda', enfermeria: '/triaje', medico: '/hcd' };

function RoleHomeRedirect() {
  const role = getUserRole();
  return <Navigate replace to={role ? defaultRouteByRole[role] : '/login'} />;
}

function ClinicalScreen({ children }: { children: ReactNode }) {
  return <><div className="relative xl:pr-80">{children}<div className="fixed right-4 top-4 z-50 xl:right-84"><LogoutButton /></div></div><AlertsPanel /></>;
}

function AppRoutes() {
  const navigate = useNavigate();
  return <Routes>
    <Route path="/login" element={<LoginScreen onLogin={(role) => navigate(defaultRouteByRole[role], { replace: true })} />} />
    <Route path="/agenda" element={<ProtectedRoute allowedRoles={['admin']}><ClinicalScreen><AdminView /></ClinicalScreen></ProtectedRoute>} />
    <Route path="/triaje" element={<ProtectedRoute allowedRoles={['enfermeria']}><ClinicalScreen><NursingView /></ClinicalScreen></ProtectedRoute>} />
    <Route path="/hcd" element={<ProtectedRoute allowedRoles={['medico']}><ClinicalScreen><DoctorPatientSearch /></ClinicalScreen></ProtectedRoute>} />
    <Route path="/hcd/:pacienteId" element={<ProtectedRoute allowedRoles={['medico']}><ClinicalScreen><DoctorView /></ClinicalScreen></ProtectedRoute>} />
    <Route path="/" element={<RoleHomeRedirect />} />
    <Route path="*" element={<RoleHomeRedirect />} />
  </Routes>;
}

export default function App() {
  return <HashRouter><AppRoutes /></HashRouter>;
}
