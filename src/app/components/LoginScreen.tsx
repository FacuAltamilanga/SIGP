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
    <main className="grid min-h-screen bg-slate-100 lg:grid-cols-[minmax(0,1.08fr)_minmax(480px,1fr)]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#0c315f] via-[#0e57ab] to-[#277bd7] p-9 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex items-center gap-3"><span className="grid size-9 place-items-center rounded-md bg-white/15"><ShieldCheck size={21} /></span><div><p className="text-lg font-bold leading-none">SIGP</p><p className="mt-1 text-[10px] font-medium tracking-widest text-blue-100">SISTEMA INTEGRAL DE GESTIÓN PEDIÁTRICA</p></div></div>
        <div className="relative my-auto space-y-7">
          <StatusCard label="Pacientes atendidos hoy" value="142" accent="bg-[var(--status-ok)]" detail="↑ 8% vs. ayer" />
          <StatusCard label="Alertas activas" value="3" accent="bg-[var(--status-critical)]" detail="Requieren atención inmediata" critical />
          <StatusCard label="Cobertura validada en línea" value="98.4%" accent="bg-[var(--status-ok)]" detail="Último sync hace 2 min" />
        </div>
        <p className="relative text-xs text-blue-100/75">Ministerio de Salud — Sistema certificado ISO 27001</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10"><div className="w-full max-w-md">
        <div className="mb-9 lg:hidden"><p className="text-xl font-bold text-blue-800">SIGP</p><p className="text-xs font-medium tracking-wide text-slate-500">SISTEMA INTEGRAL DE GESTIÓN PEDIÁTRICA</p></div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Iniciar sesión</h1><p className="mt-2 text-sm leading-6 text-slate-500">Acceso seguro al sistema clínico. Ingresá tus credenciales institucionales.</p>
        <form className="mt-7 space-y-5" onSubmit={handleSubmit} noValidate>
          <label className="block text-sm font-semibold text-slate-700">Nombre de usuario o correo electrónico<span className="relative mt-2 block"><UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="w-full rounded-md border border-slate-300 bg-white py-3 pl-10 pr-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="usuario@sigp.ar" /></span></label>
          <label className="block text-sm font-semibold text-slate-700">Contraseña<span className="relative mt-2 block"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="w-full rounded-md border border-slate-300 bg-white py-3 pl-10 pr-11 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••••" /><button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          <button className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSubmitting}><ShieldCheck size={18} />{isSubmitting ? 'Verificando acceso…' : 'Iniciar sesión de forma segura'}</button>
        </form>
        <p className="mt-7 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Aviso de confidencialidad:</strong> el acceso a este sistema implica el tratamiento de datos sensibles de salud y está reservado exclusivamente a personal autorizado.</p>
      </div></section>
    </main>
  );
}

function StatusCard({ label, value, accent, detail, critical = false }: { label: string; value: string; accent: string; detail: string; critical?: boolean }) {
  return <article className="rounded-xl border border-white/20 bg-white/10 p-5 shadow-sm backdrop-blur-[2px]"><div className="flex gap-3"><span className={`mt-2 h-8 w-1 rounded-full ${accent}`} /><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-100">{label}</p><p className="mt-1 text-3xl font-bold leading-none">{value}</p><p className={`mt-2 text-xs font-medium ${critical ? 'text-red-200' : 'text-emerald-200'}`}>{detail}</p></div></div></article>;
}
