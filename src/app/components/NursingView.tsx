import { CheckCircle2, HeartPulse, LoaderCircle, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getApiUrl, getAuthHeaders } from '../../lib/auth';

interface ApiPatient {
  id?: string | number;
  paciente_id?: string | number;
  nombre?: string;
  apellido?: string;
  nombre_completo?: string;
  dni?: string | number;
  fecha_nacimiento?: string;
}

interface Patient { id: string; name: string; dni: string; birthDate?: string; }

type VitalFields = { temperatura: string; frecuencia_cardiaca: string; saturacion_oxigeno: string; peso_kg: string; talla_cm: string; };

const emptyVitals: VitalFields = { temperatura: '', frecuencia_cardiaca: '', saturacion_oxigeno: '', peso_kg: '', talla_cm: '' };

function patientsFrom(payload: unknown): Patient[] {
  const records = Array.isArray(payload) ? payload : payload && typeof payload === 'object' && 'pacientes' in payload && Array.isArray(payload.pacientes) ? payload.pacientes : [];
  return (records as ApiPatient[]).flatMap((patient) => {
    const id = patient.id ?? patient.paciente_id;
    if (id === undefined || id === null) return [];
    const inferredName = [patient.nombre, patient.apellido].filter(Boolean).join(' ');
    return [{ id: String(id), name: (patient.nombre_completo ?? inferredName) || 'Paciente sin identificar', dni: String(patient.dni ?? 'Sin DNI'), birthDate: patient.fecha_nacimiento }];
  });
}

function ageFrom(birthDate?: string) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  return months < 24 ? `${Math.max(months, 0)} meses` : `${Math.floor(months / 12)} años ${months % 12} meses`;
}

function responseError(payload: unknown) {
  return payload && typeof payload === 'object' && 'detail' in payload && typeof payload.detail === 'string' ? payload.detail : 'No se pudo completar la operación.';
}

export function NursingView() {
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [vitals, setVitals] = useState<VitalFields>(emptyVitals);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function searchPatients(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchTerm.trim();
    if (query.length < 2) { setSearchMessage('Ingresá al menos 2 caracteres para realizar la búsqueda.'); return; }
    setIsSearching(true); setSearchMessage(null); setSelectedPatient(null); setPatients([]); setFormMessage(null);
    try {
      const response = await fetch(`${getApiUrl()}/pacientes/buscar?${new URLSearchParams({ q: query })}`, { headers: getAuthHeaders() });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(payload));
      const results = patientsFrom(payload);
      setPatients(results);
      if (results.length === 0) setSearchMessage('No se encontraron pacientes con esos datos.');
    } catch (caughtError) {
      setSearchMessage(caughtError instanceof Error ? caughtError.message : 'No se pudo realizar la búsqueda.');
    } finally { setIsSearching(false); }
  }

  function updateVital(field: keyof VitalFields, value: string) {
    setVitals((current) => ({ ...current, [field]: value }));
  }

  async function saveTriage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPatient) { setFormMessage({ type: 'error', text: 'Seleccioná un paciente antes de guardar el triaje.' }); return; }
    const values = Object.values(vitals);
    if (values.some((value) => value.trim() === '') || values.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      setFormMessage({ type: 'error', text: 'Completá todos los signos vitales con valores numéricos válidos.' }); return;
    }
    setIsSaving(true); setFormMessage(null);
    try {
      const headers = new Headers(getAuthHeaders());
      headers.set('Content-Type', 'application/json');
      const response = await fetch(`${getApiUrl()}/triaje`, {
        method: 'POST', headers,
        body: JSON.stringify({ paciente_id: selectedPatient.id, temperatura: Number(vitals.temperatura), frecuencia_cardiaca: Number(vitals.frecuencia_cardiaca), saturacion_oxigeno: Number(vitals.saturacion_oxigeno), peso_kg: Number(vitals.peso_kg), talla_cm: Number(vitals.talla_cm) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(payload));
      setFormMessage({ type: 'success', text: 'Triaje guardado correctamente.' });
      setVitals(emptyVitals);
    } catch (caughtError) {
      setFormMessage({ type: 'error', text: caughtError instanceof Error ? caughtError.message : 'No se pudo guardar el triaje.' });
    } finally { setIsSaving(false); }
  }

  return <main className="min-h-screen bg-slate-100 text-slate-800"><header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8"><div className="mx-auto flex max-w-5xl items-center gap-3"><span className="grid size-9 place-items-center rounded-md bg-blue-700 text-white"><ShieldCheck size={20} /></span><div><p className="text-lg font-bold leading-none text-slate-900">SIGP</p><p className="mt-1 text-[10px] font-medium tracking-wide text-slate-500">SISTEMA INTEGRAL DE GESTIÓN PEDIÁTRICA</p></div></div></header>
    <section className="mx-auto max-w-5xl px-5 py-7 sm:px-8"><h1 className="text-2xl font-bold text-slate-900">Carga rápida de triaje</h1><p className="mt-1 text-sm text-slate-500">Ingreso de signos vitales pediátricos.</p>
      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-blue-50 px-5 py-3 text-sm font-bold uppercase tracking-wide text-blue-700">Paso 1 — Identificar paciente</div><form className="p-5" onSubmit={searchPatients}><label className="text-sm font-semibold text-slate-700">Buscar por DNI o nombre del paciente</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="w-full rounded-md border border-slate-300 py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Ej.: 48221003 o Martina López" /></div><button className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60" type="submit" disabled={isSearching}>{isSearching && <LoaderCircle className="animate-spin" size={17} />}{isSearching ? 'Buscando…' : 'Buscar'}</button></div>{searchMessage && <p className="mt-3 text-sm text-slate-600" role="status">{searchMessage}</p>}</form>
        {patients.length > 0 && <div className="border-t border-slate-200 p-5"><p className="mb-3 text-sm font-semibold text-slate-700">Resultados encontrados</p><div className="grid gap-2">{patients.map((patient) => <button key={patient.id} className={`flex items-center justify-between rounded-lg border p-4 text-left transition ${selectedPatient?.id === patient.id ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`} type="button" onClick={() => { setSelectedPatient(patient); setFormMessage(null); }}><span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-blue-100 text-blue-700"><UserRound size={18} /></span><span><strong className="block">{patient.name}</strong><span className="text-xs text-slate-500">DNI {patient.dni}{ageFrom(patient.birthDate) ? ` · ${ageFrom(patient.birthDate)}` : ''}</span></span></span>{selectedPatient?.id === patient.id && <CheckCircle2 className="text-blue-700" size={20} />}</button>)}</div></div>}
      </section>
      {selectedPatient && <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 bg-blue-50 px-5 py-3"><span className="text-sm font-bold uppercase tracking-wide text-blue-700">Paso 2 — Registrar signos vitales</span><button className="text-slate-500 hover:text-slate-800" type="button" onClick={() => setSelectedPatient(null)} aria-label="Quitar paciente seleccionado"><X size={18} /></button></div><div className="border-b border-slate-100 px-5 py-4"><p className="font-semibold text-slate-900">{selectedPatient.name}</p><p className="mt-1 text-sm text-slate-500">DNI {selectedPatient.dni}</p></div><form className="p-5" onSubmit={saveTriage}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><VitalInput label="Temperatura" unit="°C" value={vitals.temperatura} onChange={(value) => updateVital('temperatura', value)} step="0.1" /><VitalInput label="Frecuencia cardíaca" unit="lpm" value={vitals.frecuencia_cardiaca} onChange={(value) => updateVital('frecuencia_cardiaca', value)} /><VitalInput label="Saturación de oxígeno" unit="%" value={vitals.saturacion_oxigeno} onChange={(value) => updateVital('saturacion_oxigeno', value)} /><VitalInput label="Peso" unit="kg" value={vitals.peso_kg} onChange={(value) => updateVital('peso_kg', value)} step="0.1" /><VitalInput label="Talla" unit="cm" value={vitals.talla_cm} onChange={(value) => updateVital('talla_cm', value)} step="0.1" /></div>{formMessage && <p className={`mt-5 rounded-md border px-3 py-2 text-sm ${formMessage.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`} role="alert">{formMessage.text}</p>}<button className="mt-5 inline-flex items-center gap-2 rounded-md bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60" type="submit" disabled={isSaving}><HeartPulse size={18} />{isSaving ? 'Guardando…' : 'Guardar triaje'}</button></form></section>}
    </section></main>;
}

function VitalInput({ label, unit, value, onChange, step = '1' }: { label: string; unit: string; value: string; onChange: (value: string) => void; step?: string }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}<span className="relative mt-2 block"><input className="w-full rounded-md border border-slate-300 px-3 py-3 pr-12 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" min="0" step={step} inputMode="decimal" type="number" value={value} onChange={(event) => onChange(event.target.value)} required /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">{unit}</span></span></label>;
}
