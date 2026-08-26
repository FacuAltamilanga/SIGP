import { BellRing, Check, CircleAlert, HeartPulse, LoaderCircle, Pill, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getApiUrl, getAuthHeaders } from '../../lib/auth';

type Severity = 'critical' | 'warning' | 'info';
interface AlertItem { id: string; severity: Severity; title: string; patient: string; time: string; }
type ConnectionState = 'connected' | 'connecting' | 'disconnected';

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function string(value: unknown, fallback = '') { return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback; }
function severity(value: unknown): Severity { const level = string(value).toLowerCase(); return level === 'critical' || level === 'critico' || level === 'crítico' ? 'critical' : level === 'warning' || level === 'alerta' ? 'warning' : 'info'; }
function formatTime(value: unknown) { const raw = string(value); if (!raw) return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date()); const date = new Date(raw); return Number.isNaN(date.getTime()) ? raw : new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(date); }
function toAlert(value: unknown): AlertItem | null { const envelope = object(value); const source = object(envelope.alerta ?? envelope.alert ?? envelope.data ?? envelope); const patient = object(source.paciente); const patientName = string(patient.nombre_completo) || [string(patient.nombre), string(patient.apellido)].filter(Boolean).join(' ') || string(source.paciente_nombre); const id = string(source.id ?? source.alerta_id); const title = string(source.titulo ?? source.title ?? source.mensaje ?? source.message); return id && title ? { id, severity: severity(source.severidad ?? source.nivel ?? source.tipo), title, patient: patientName || 'Paciente no informado', time: formatTime(source.fecha ?? source.created_at ?? source.timestamp) } : null; }

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    let isActive = true;
    let socket: WebSocket | null = null;
    const wsUrl = import.meta.env.VITE_WS_URL;
    function connect() {
      if (!wsUrl) { if (isActive) setConnection('disconnected'); return; }
      socket = new WebSocket(wsUrl);
      socket.onopen = () => { if (isActive) setConnection('connected'); };
      socket.onmessage = (event) => { try { const alert = toAlert(JSON.parse(String(event.data))); if (!alert || !isActive) return; setAlerts((current) => [alert, ...current.filter((item) => item.id !== alert.id)]); } catch { /* Ignore malformed messages without interrupting the connection. */ } };
      socket.onerror = () => { if (isActive) setConnection('disconnected'); };
      socket.onclose = () => { if (!isActive) return; setConnection('disconnected'); reconnectTimer.current = window.setTimeout(connect, 3000); };
    }
    connect();
    return () => { isActive = false; if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current); socket?.close(); };
  }, []);

  async function confirmAlert(id: string) {
    setConfirmingId(id); setError(null);
    try {
      const response = await fetch(`${getApiUrl()}/alertas/${encodeURIComponent(id)}/confirmar`, { method: 'PATCH', headers: getAuthHeaders() });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(object(payload).detail ? string(object(payload).detail) : 'No se pudo confirmar la recepción de la alerta.');
      setAlerts((current) => current.filter((alert) => alert.id !== id));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'No se pudo confirmar la alerta.');
    } finally { setConfirmingId(null); }
  }

  return <aside className="fixed inset-y-0 right-0 z-40 hidden w-80 flex-col border-l border-slate-200 bg-white xl:flex" aria-label="Monitor de alertas"><header className="flex items-center justify-between border-b border-slate-200 px-4 py-5"><span className="flex items-center gap-2 text-sm font-bold text-slate-800"><BellRing size={18} />Monitor de alertas</span><span className="grid size-6 place-items-center rounded-full bg-red-500 text-xs font-bold text-white">{alerts.length}</span></header><div className="border-b border-slate-100 px-4 py-3"><span className={`flex items-center gap-2 text-xs font-medium ${connection === 'connected' ? 'text-green-700' : 'text-slate-500'}`}>{connection === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}{connection === 'connected' ? 'Conectado en tiempo real' : 'Reconectando alertas…'}</span>{error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}</div><section className="flex-1 overflow-y-auto p-3"><p className="mb-3 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Pendientes</p>{alerts.length === 0 ? <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No hay alertas pendientes.</div> : <div className="space-y-3">{alerts.map((alert) => <AlertCard key={alert.id} alert={alert} isConfirming={confirmingId === alert.id} onConfirm={confirmAlert} />)}</div>}</section><footer className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">Actualización automática</footer></aside>;
}

function AlertCard({ alert, isConfirming, onConfirm }: { alert: AlertItem; isConfirming: boolean; onConfirm: (id: string) => void }) {
  const critical = alert.severity === 'critical'; const warning = alert.severity === 'warning'; const theme = critical ? 'border-red-300 bg-red-50' : warning ? 'border-orange-300 bg-orange-50' : 'border-blue-200 bg-blue-50'; const badge = critical ? 'bg-red-500' : warning ? 'bg-orange-500' : 'bg-blue-600'; const Icon = critical ? HeartPulse : warning ? Pill : CircleAlert;
  return <article className={`rounded-lg border p-3 ${theme}`}><div className="flex gap-2"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-white/70"><Icon size={16} /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${badge}`}>{critical ? 'CRÍTICO' : warning ? 'ALERTA' : 'INFORMACIÓN'}</span><span className="font-mono text-[10px] text-slate-500">{alert.time}</span></div><p className="mt-1 text-sm font-bold leading-4 text-slate-800">{alert.title}</p><p className="mt-1 text-xs text-slate-600">{alert.patient}</p></div></div><button className="mt-3 inline-flex items-center gap-1 rounded-md border border-current bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60" type="button" disabled={isConfirming} onClick={() => onConfirm(alert.id)}>{isConfirming ? <LoaderCircle className="animate-spin" size={14} /> : <Check size={14} />}{isConfirming ? 'Confirmando…' : 'Confirmar recepción'}</button></article>;
}
