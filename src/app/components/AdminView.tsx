import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Clock3, RefreshCw, Search, ShieldCheck, Stethoscope, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getApiUrl, getAuthHeaders } from '../../lib/auth';
import { LogoutButton } from './LogoutButton';

type Coverage = 'authorized' | 'restricted' | 'pending';

interface ApiAppointment {
  id: string | number;
  hora?: string;
  hora_inicio?: string;
  paciente?: { nombre?: string; apellido?: string; nombre_completo?: string; dni?: string | number };
  nombre_paciente?: string;
  dni?: string | number;
  tutor?: string;
  tutor_nombre?: string;
  obra_social?: string;
  cobertura?: string;
  estado_cobertura?: string;
  consultorio_id?: string | number;
  consultorio?: { id?: string | number; nombre?: string } | string;
}

interface Appointment {
  id: string | number;
  time: string;
  patient: string;
  dni: string;
  guardian: string;
  insurer: string;
  coverage: Coverage;
  consultoryId: string;
  consultoryName: string;
}

const today = new Date().toISOString().slice(0, 10);

function toCoverage(value: string | undefined): Coverage {
  if (value?.toLowerCase() === 'authorized') return 'authorized';
  if (value?.toLowerCase() === 'restricted') return 'restricted';
  return 'pending';
}

function normalizeAppointment(turno: ApiAppointment): Appointment {
  const patient = turno.paciente;
  const inferredName = [patient?.nombre, patient?.apellido].filter(Boolean).join(' ');
  const name = (patient?.nombre_completo ?? turno.nombre_paciente ?? inferredName) || 'Paciente sin identificar';
  const consultory = typeof turno.consultorio === 'object' ? turno.consultorio : undefined;
  const consultoryId = String(turno.consultorio_id ?? consultory?.id ?? turno.consultorio ?? 'sin-asignar');
  return {
    id: turno.id,
    time: turno.hora ?? turno.hora_inicio ?? '--:--',
    patient: name,
    dni: String(patient?.dni ?? turno.dni ?? 'Sin DNI'),
    guardian: turno.tutor ?? turno.tutor_nombre ?? 'Sin tutor informado',
    insurer: turno.obra_social ?? 'Sin cobertura informada',
    coverage: toCoverage(turno.cobertura ?? turno.estado_cobertura),
    consultoryId,
    consultoryName: consultory?.nombre ?? (typeof turno.consultorio === 'string' ? turno.consultorio : `Consultorio ${consultoryId}`),
  };
}

function appointmentsFrom(payload: unknown): Appointment[] {
  const records = Array.isArray(payload) ? payload : payload && typeof payload === 'object' && 'turnos' in payload && Array.isArray(payload.turnos) ? payload.turnos : [];
  return (records as ApiAppointment[]).map(normalizeAppointment);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

export function AdminView() {
  const [selectedDate, setSelectedDate] = useState(today);
  const [consultoryId, setConsultoryId] = useState('all');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadAppointments() {
      setIsLoading(true);
      setError(null);
      try {
        const searchParams = new URLSearchParams({ fecha: selectedDate, consultorio_id: consultoryId });
        const response = await fetch(`${getApiUrl()}/turnos?${searchParams}`, { headers: getAuthHeaders(), signal: controller.signal });
        if (!response.ok) throw new Error('No se pudo cargar la agenda de turnos.');
        setAppointments(appointmentsFrom(await response.json()));
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === 'AbortError') return;
        setError(caughtError instanceof Error ? caughtError.message : 'Ocurrió un error inesperado.');
        setAppointments([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    void loadAppointments();
    return () => controller.abort();
  }, [consultoryId, refreshIndex, selectedDate]);

  const consultories = useMemo(() => Array.from(new Map(appointments.map((appointment) => [appointment.consultoryId, appointment.consultoryName])).entries()), [appointments]);
  const visibleAppointments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-AR');
    return normalizedQuery ? appointments.filter((appointment) => `${appointment.patient} ${appointment.dni} ${appointment.guardian} ${appointment.insurer}`.toLocaleLowerCase('es-AR').includes(normalizedQuery)) : appointments;
  }, [appointments, query]);
  const authorizedCount = appointments.filter((appointment) => appointment.coverage === 'authorized').length;
  const restrictedCount = appointments.filter((appointment) => appointment.coverage === 'restricted').length;
  const pendingCount = appointments.filter((appointment) => appointment.coverage === 'pending').length;

  function changeDay(days: number) {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().slice(0, 10));
  }

  return <main className="min-h-screen bg-slate-100 text-slate-800"><header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-md bg-blue-700 text-white"><ShieldCheck size={20} /></span><div><p className="text-lg font-bold leading-none text-slate-900">SIGP</p><p className="mt-1 text-[10px] font-medium tracking-wide text-slate-500">SISTEMA INTEGRAL DE GESTIÓN PEDIÁTRICA</p></div></div><LogoutButton /></div></header>
    <section className="mx-auto max-w-7xl px-5 py-7 sm:px-8"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><h1 className="text-2xl font-bold text-slate-900">Agenda de turnos</h1><p className="mt-1 capitalize text-sm text-slate-500">{dateLabel(selectedDate)}</p></div><button className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50" type="button" onClick={() => setRefreshIndex((value) => value + 1)} disabled={isLoading}><RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />Actualizar</button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<CalendarDays size={19} />} label="Turnos del día" value={appointments.length} tone="blue" /><Metric icon={<CheckCircle2 size={19} />} label="Cobertura autorizada" value={authorizedCount} tone="green" /><Metric icon={<CircleAlert size={19} />} label="Restricciones" value={restrictedCount} tone="orange" /><Metric icon={<Clock3 size={19} />} label="Pendientes" value={pendingCount} tone="slate" /></div>
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center"><div className="flex items-center gap-2"><button className="rounded-md p-2 hover:bg-slate-100" type="button" aria-label="Día anterior" onClick={() => changeDay(-1)}><ChevronLeft size={18} /></button><input className="rounded-md border border-slate-300 px-3 py-2 text-sm" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><button className="rounded-md p-2 hover:bg-slate-100" type="button" aria-label="Día siguiente" onClick={() => changeDay(1)}><ChevronRight size={18} /></button></div><select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={consultoryId} onChange={(event) => setConsultoryId(event.target.value)}><option value="all">Todos los consultorios</option>{consultories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><label className="relative block flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por paciente, DNI, tutor u obra social" /></label></div>
        {error && <p className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Hora</th><th className="px-5 py-3 font-semibold">Paciente</th><th className="px-5 py-3 font-semibold">Tutor/a</th><th className="px-5 py-3 font-semibold">Obra social</th><th className="px-5 py-3 font-semibold">Cobertura</th></tr></thead><tbody className="divide-y divide-slate-100">{isLoading ? <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={5}>Cargando agenda…</td></tr> : visibleAppointments.length === 0 ? <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={5}>No hay turnos para los filtros seleccionados.</td></tr> : visibleAppointments.map((appointment) => <tr key={appointment.id} className="hover:bg-slate-50"><td className="whitespace-nowrap px-5 py-4 font-mono font-semibold text-blue-700">{appointment.time}</td><td className="px-5 py-4"><p className="font-semibold text-slate-900">{appointment.patient}</p><p className="mt-0.5 font-mono text-xs text-slate-500">DNI {appointment.dni}</p></td><td className="px-5 py-4 text-slate-600">{appointment.guardian}</td><td className="px-5 py-4 text-slate-600">{appointment.insurer}</td><td className="px-5 py-4"><CoverageBadge coverage={appointment.coverage} /></td></tr>)}</tbody></table></div></section>
    </section></main>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'blue' | 'green' | 'orange' | 'slate' }) {
  const tones = { blue: 'border-blue-100 text-blue-700', green: 'border-green-100 text-green-700', orange: 'border-orange-100 text-orange-700', slate: 'border-slate-200 text-slate-700' };
  return <article className={`rounded-lg border bg-white p-4 shadow-sm ${tones[tone]}`}><span>{icon}</span><p className="mt-3 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-sm font-medium text-slate-500">{label}</p></article>;
}

function CoverageBadge({ coverage }: { coverage: Coverage }) {
  if (coverage === 'authorized') return <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700"><CheckCircle2 size={14} />Autorizada</span>;
  if (coverage === 'restricted') return <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700"><XCircle size={14} />Restringida</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"><Stethoscope size={14} />Pendiente</span>;
}
