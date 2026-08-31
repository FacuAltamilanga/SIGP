import { Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { getApiUrl, getToken, getUserRole, saveAuth, toUserRole, type UserRole } from '../../lib/auth';

interface LoginScreenProps { onLogin: (role: UserRole) => void; }
interface LoginResponse { token?: unknown; role?: unknown; detail?: unknown; message?: unknown; }

function errorFrom(payload: LoginResponse | null) {
  if (typeof payload?.detail === 'string') return payload.detail;
  if (typeof payload?.message === 'string') return payload.message;
  return 'No fue posible iniciar sesión. Revisá tus credenciales e intentá nuevamente.';
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeRole = getUserRole();

  if (getToken() && activeRole) return <Navigate replace to="/" />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Ingresá tu usuario o correo electrónico y contraseña.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${getApiUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const payload = (await response.json().catch(() => null)) as LoginResponse | null;
      if (!response.ok) { setError(errorFrom(payload)); return; }

      const role = toUserRole(payload?.role);
      if (typeof payload?.token !== 'string' || !role) {
        setError('La respuesta del servidor no incluye una sesión válida.');
        return;
      }
      saveAuth({ token: payload.token, role });
      onLogin(role);
    } catch (caughtError) {
      setError(caughtError instanceof Error && caughtError.message.startsWith('Falta configurar') ? caughtError.message : 'No se pudo conectar con el sistema. Verificá tu conexión e intentá nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f1f3f7] lg:grid-cols-[52%_48%]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#123b73] via-[#1459a8] to-[#287bd1] px-9 py-4 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex items-center gap-3"><span className="grid size-9 place-items-center rounded-md border border-white/20 bg-white/15"><ShieldCheck size={21} /></span><div><p className="text-lg font-bold leading-none">SIGP</p><p className="mt-1 text-[10px] font-medium tracking-wide text-blue-100">SISTEMA INTEGRAL DE GESTIÓN PEDIÁTRICA</p></div></div>
        <div className="relative my-auto space-y-8">
          <StatusCard label="Pacientes atendidos hoy" value="142" accent="bg-[var(--status-ok)]" detail="↑ 8% vs. ayer" />
          <StatusCard label="Alertas activas" value="3" accent="bg-[var(--status-critical)]" detail="Requieren atención inmediata" critical />
          <StatusCard label="Cobertura validada en línea" value="98.4%" accent="bg-[var(--status-ok)]" detail="Último sync hace 2 min" />
        </div>
        <p className="relative text-xs text-blue-100/75">Ministerio de Salud — Sistema certificado ISO 27001</p>
      </section>

      <section className="flex items-center justify-center px-6 py-8 sm:px-10"><div className="w-full max-w-[390px]">
        <div className="mb-9 lg:hidden"><p className="text-xl font-bold text-blue-800">SIGP</p><p className="text-xs font-medium tracking-wide text-slate-500">SISTEMA INTEGRAL DE GESTIÓN PEDIÁTRICA</p></div>
        <h1 className="text-[24px] font-bold tracking-tight text-slate-900">Iniciar sesión</h1><p className="mt-1 text-sm leading-5 text-slate-500">Acceso seguro al sistema clínico. Ingrese sus credenciales institucionales.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="block text-sm font-semibold text-slate-700">Nombre de usuario o correo electrónico<span className="relative mt-2 block"><UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="w-full rounded-md border border-slate-300 bg-white py-3 pl-10 pr-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="usuario@sigp" /></span></label>
          <label className="block text-sm font-semibold text-slate-700">Contraseña<span className="relative mt-2 block"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="w-full rounded-md border border-slate-300 bg-white py-3 pl-10 pr-11 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••••" /><button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          <button className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-[#e5ebf3] px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-[#dce5f0] focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSubmitting}><ShieldCheck size={18} />{isSubmitting ? 'Verificando acceso…' : 'Iniciar Sesión de Forma Segura'}</button>
        </form>
        <section className="mt-5 rounded-md border border-blue-200 bg-[#d5e4f7] p-3.5 text-xs leading-6 text-slate-600"><p className="font-bold text-blue-800">Credenciales de demostración</p><p>Recepción: <code className="font-mono text-blue-800">admin@sigp.ar / admin123</code></p><p>Enfermería: <code className="font-mono text-blue-800">enfermeria@sigp.ar / enfermeria123</code></p><p>Médico: <code className="font-mono text-blue-800">medico@sigp.ar / medico123</code></p></section>
        <p className="mt-4 rounded-md border border-slate-200 bg-[#e7ecf2] p-3 text-[11px] leading-[1.45] text-slate-500"><strong className="text-slate-700">Aviso de confidencialidad:</strong> El acceso a este sistema implica el tratamiento de datos sensibles de salud protegidos por la Ley Nacional N° 25.326 de Protección de Datos Personales. Su uso está reservado exclusivamente al personal autorizado. El uso no autorizado constituye una infracción legal.</p>
      </div></section>
    </main>
  );
}

function StatusCard({ label, value, accent, detail, critical = false }: { label: string; value: string; accent: string; detail: string; critical?: boolean }) {
  return <article className="rounded-xl border border-white/20 bg-white/10 p-5 shadow-sm backdrop-blur-[2px]"><div className="flex gap-3"><span className={`mt-2 h-8 w-1 rounded-full ${accent}`} /><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-100">{label}</p><p className="mt-1 text-3xl font-bold leading-none">{value}</p><p className={`mt-2 text-xs font-medium ${critical ? 'text-red-200' : 'text-emerald-200'}`}>{detail}</p></div></div></article>;
}
