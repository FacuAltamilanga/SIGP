import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Clock3, Plus, RefreshCw, Search, ShieldCheck, Stethoscope, X, XCircle } from 'lucide-react';
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
  estado?: string;
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
  status: string;
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
    status: turno.estado ?? 'solicitado',
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
  const [showBooking, setShowBooking] = useState(false);
  const [booking, setBooking] = useState({ nombre: '', apellido: '', dni: '', fecha_nacimiento: '', sexo: 'no_informado', tutor: '', consultorio: 'Consultorio 1', cobertura_medica: 'Sin cobertura', fecha: today, hora: '', motivo: 'Consulta pediátrica' });
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadAppointments() {
      setIsLoading(true);
      setError(null);
      try {
        const searchParams = new URLSearchParams({ fecha: selectedDate, consultorio_id: consultoryId });
        const response = await fetch(`${getApiUrl()}/turnos?${searchParams}`, { headers: getAuthHeaders(), signal: controller.signal });
        if (!response.ok) throw new Error('No se pudo cargar la agenda de turnos.');
        const remote = appointmentsFrom(await response.json());
        setAppointments(remote.filter((item) => consultoryId === 'all' || item.consultoryId === consultoryId));
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === 'AbortError') return;
        setAppointments([]);
        setError(caughtError instanceof Error ? caughtError.message : 'No se pudo cargar la agenda de turnos.');
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

  async function createAppointment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBookingError(null); setIsBooking(true);
    try {
      const headers = new Headers(getAuthHeaders()); headers.set('Content-Type', 'application/json');
      const response = await fetch(`${getApiUrl()}/turnos`, { method: 'POST', headers, body: JSON.stringify({ fecha: booking.fecha, hora: booking.hora, dni: booking.dni, nombre_paciente: booking.nombre, apellido_paciente: booking.apellido, fecha_nacimiento: booking.fecha_nacimiento, sexo: booking.sexo, paciente: { nombre: booking.nombre, apellido: booking.apellido, dni: booking.dni, fecha_nacimiento: booking.fecha_nacimiento, sexo: booking.sexo }, tutor: booking.tutor, consultorio: booking.consultorio, cobertura_medica: booking.cobertura_medica, motivo: booking.motivo }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.detail ?? 'No se pudo agendar el turno.');
      const created = appointmentsFrom(payload)[0];
      if (!created) throw new Error('El servidor no devolvió el turno registrado.');
      if (booking.fecha === selectedDate) setAppointments((current) => [...current, created]);
      setShowBooking(false); setBooking({ nombre: '', apellido: '', dni: '', fecha_nacimiento: '', sexo: 'no_informado', tutor: '', consultorio: 'Consultorio 1', cobertura_medica: 'Sin cobertura', fecha: selectedDate, hora: '', motivo: 'Consulta pediátrica' });
    } catch (caughtError) { setBookingError(caughtError instanceof Error ? caughtError.message : 'No se pudo agendar el turno.'); }
    finally { setIsBooking(false); }
  }

  async function updateAppointment(id: string | number, action: 'cancelar' | 'finalizar') {
    const isCancellation = action === 'cancelar';
    if (isCancellation && !window.confirm('¿Querés cancelar este turno?')) return;
    setError(null);
    try {
      const headers = new Headers(getAuthHeaders());
      const options: RequestInit = { method: 'PATCH', headers };
      if (isCancellation) {
        headers.set('Content-Type', 'application/json');
        options.body = JSON.stringify({ motivo: 'Cancelado desde la agenda' });
      }
      const response = await fetch(`${getApiUrl()}/turnos/${id}/${action}`, options);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.detail ?? `No se pudo ${action} el turno.`);
      setAppointments((current) => current.filter((appointment) => String(appointment.id) !== String(id)));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'No se pudo actualizar el turno.');
    }
  }

  return <main className="min-h-screen bg-slate-100 text-slate-800"><header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-md bg-blue-700 text-white"><ShieldCheck size={20} /></span><div><p className="text-lg font-bold leading-none text-slate-900">SIGP</p><p className="mt-1 text-[10px] font-medium tracking-wide text-slate-500">SISTEMA INTEGRAL DE GESTIÓN PEDIÁTRICA</p></div></div><div className="flex items-center gap-2"><button className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800" type="button" onClick={() => { setBooking((current) => ({ ...current, fecha: selectedDate })); setShowBooking(true); }}><Plus size={16} />Registrar nuevo turno</button><LogoutButton /></div></div></header>
    <section className="mx-auto max-w-7xl px-5 py-7 sm:px-8"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><h1 className="text-2xl font-bold text-slate-900">Agenda de turnos</h1><p className="mt-1 capitalize text-sm text-slate-500">{dateLabel(selectedDate)}</p></div><button className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50" type="button" onClick={() => setRefreshIndex((value) => value + 1)} disabled={isLoading}><RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />Actualizar</button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<CalendarDays size={19} />} label="Turnos del día" value={appointments.length} tone="blue" /><Metric icon={<CheckCircle2 size={19} />} label="Cobertura autorizada" value={authorizedCount} tone="green" /><Metric icon={<CircleAlert size={19} />} label="Restricciones" value={restrictedCount} tone="orange" /><Metric icon={<Clock3 size={19} />} label="Pendientes" value={pendingCount} tone="slate" /></div>
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center"><div className="flex items-center gap-2"><button className="rounded-md p-2 hover:bg-slate-100" type="button" aria-label="Día anterior" onClick={() => changeDay(-1)}><ChevronLeft size={18} /></button><input className="rounded-md border border-slate-300 px-3 py-2 text-sm" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><button className="rounded-md p-2 hover:bg-slate-100" type="button" aria-label="Día siguiente" onClick={() => changeDay(1)}><ChevronRight size={18} /></button></div><select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={consultoryId} onChange={(event) => setConsultoryId(event.target.value)}><option value="all">Todos los consultorios</option>{consultories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><label className="relative block flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por paciente, DNI, tutor u obra social" /></label></div>
        {error && <p className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Hora</th><th className="px-5 py-3 font-semibold">Estado y acciones</th><th className="px-5 py-3 font-semibold">Paciente</th><th className="px-5 py-3 font-semibold">Tutor/a</th><th className="px-5 py-3 font-semibold">Obra social</th><th className="px-5 py-3 font-semibold">Cobertura</th></tr></thead><tbody className="divide-y divide-slate-100">{isLoading ? <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={6}>Cargando agenda…</td></tr> : visibleAppointments.length === 0 ? <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={6}>No hay turnos para los filtros seleccionados.</td></tr> : visibleAppointments.map((appointment) => <tr key={appointment.id} className="hover:bg-slate-50"><td className="whitespace-nowrap px-5 py-4 font-mono font-semibold text-blue-700">{appointment.time}</td><td className="px-5 py-4">{appointment.status === 'cancelado' ? <span className="font-semibold text-red-700">Cancelado</span> : appointment.status === 'completado' ? <span className="font-semibold text-emerald-700">Finalizado</span> : <div className="flex flex-wrap gap-2"><button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700" type="button" onClick={() => void updateAppointment(appointment.id, 'finalizar')}>Finalizar</button><button className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50" type="button" onClick={() => void updateAppointment(appointment.id, 'cancelar')}>Cancelar</button></div>}</td><td className="px-5 py-4"><p className="font-semibold text-slate-900">{appointment.patient}</p><p className="mt-0.5 font-mono text-xs text-slate-500">DNI {appointment.dni}</p></td><td className="px-5 py-4 text-slate-600">{appointment.guardian}</td><td className="px-5 py-4 text-slate-600">{appointment.insurer}</td><td className="px-5 py-4"><CoverageBadge coverage={appointment.coverage} /></td></tr>)}</tbody></table></div></section>
    </section>{showBooking && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><section className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">Registrar nuevo turno</h2><button type="button" onClick={() => setShowBooking(false)} aria-label="Cerrar"><X size={20} /></button></div><form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={createAppointment}><BookingInput label="Nombres" value={booking.nombre} onChange={(value) => setBooking({ ...booking, nombre: value })} required /><BookingInput label="Apellidos" value={booking.apellido} onChange={(value) => setBooking({ ...booking, apellido: value })} required /><BookingInput label="DNI" value={booking.dni} onChange={(value) => setBooking({ ...booking, dni: value })} required /><label className="text-sm font-semibold text-slate-700">Consultorio<select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" value={booking.consultorio} onChange={(event) => setBooking({ ...booking, consultorio: event.target.value })}><option>Consultorio 1</option><option>Consultorio 2</option><option>Consultorio 3</option><option>Consultorio 4</option></select></label><label className="text-sm font-semibold text-slate-700">Cobertura médica<select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" value={booking.cobertura_medica} onChange={(event) => setBooking({ ...booking, cobertura_medica: event.target.value })}><option>Sin cobertura</option><option>Particular</option><option>Obra social</option><option>OSDE</option><option>Swiss Medical</option><option>PAMI</option><option>Otra</option></select></label><BookingInput label="Fecha de nacimiento" type="date" value={booking.fecha_nacimiento} onChange={(value) => setBooking({ ...booking, fecha_nacimiento: value })} required /><label className="text-sm font-semibold text-slate-700">Sexo biológico<select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" value={booking.sexo} onChange={(event) => setBooking({ ...booking, sexo: event.target.value })}><option value="no_informado">No informado</option><option value="femenino">Femenino</option><option value="masculino">Masculino</option><option value="intersexual">Intersexual</option></select></label><BookingInput label="Tutor/a" value={booking.tutor} onChange={(value) => setBooking({ ...booking, tutor: value })} required /><BookingInput label="Motivo" value={booking.motivo} onChange={(value) => setBooking({ ...booking, motivo: value })} required /><BookingInput label="Fecha del turno" type="date" value={booking.fecha} onChange={(value) => setBooking({ ...booking, fecha: value })} required /><BookingInput label="Hora" type="time" value={booking.hora} onChange={(value) => setBooking({ ...booking, hora: value })} required />{bookingError && <p className="sm:col-span-2 rounded-md bg-red-50 p-2 text-sm text-red-700" role="alert">{bookingError}</p>}<div className="flex justify-end gap-2 sm:col-span-2"><button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold" type="button" onClick={() => setShowBooking(false)}>Cancelar</button><button className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={isBooking}>{isBooking ? 'Agendando…' : 'Agendar turno'}</button></div></form></section></div>}</main>;
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

function BookingInput({ label, value, onChange, type = 'text', required = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) { return <label className="text-sm font-semibold text-slate-700">{label}<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} /></label>; }
