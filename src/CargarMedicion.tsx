import { useState } from 'react';

const API_URL = "http://localhost:8000/api";

const METRICAS = [
  { valor: 'peso',       etiqueta: 'Peso',        unidad: 'kg' },
  { valor: 'talla',      etiqueta: 'Talla',       unidad: 'cm' },
  { valor: 'colesterol', etiqueta: 'Colesterol',  unidad: 'mg/dL' },
  { valor: 'glucosa',    etiqueta: 'Glucosa',     unidad: 'mg/dL' },
  { valor: 'presion',    etiqueta: 'Presión',     unidad: 'mmHg' },
];

export const CargarMedicion = () => {
  const [dni, setDni] = useState('');
  const [consultas, setConsultas] = useState<{id_consulta: string, motivo: string, fecha_hora: string}[]>([]);
  const [idConsultaSeleccionada, setIdConsultaSeleccionada] = useState('');
  const [metrica, setMetrica] = useState(METRICAS[0].valor);
  const [valor, setValor] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [paso, setPaso] = useState<1 | 2>(1); // Paso 1: buscar paciente, Paso 2: cargar medición

  const unidadActual = METRICAS.find(m => m.valor === metrica)?.unidad ?? '';

  const buscarConsultas = async () => {
    if (!dni.trim()) return;
    setCargando(true);
    setMensaje('');
    try {
      const res = await fetch(`${API_URL}/pacientes/${dni}/consultas`);
      if (!res.ok) {
        setMensaje('❌ Paciente no encontrado o sin consultas registradas.');
        setCargando(false);
        return;
      }
      const data = await res.json();
      setConsultas(data);
      setIdConsultaSeleccionada(data[0].id_consulta);
      setPaso(2);
    } catch {
      setMensaje('❌ No se pudo conectar con el servidor.');
    }
    setCargando(false);
  };

  const guardarMedicion = async () => {
    if (!valor || !idConsultaSeleccionada) {
      setMensaje('❌ Completá todos los campos.');
      return;
    }
    setCargando(true);
    setMensaje('');
    try {
      const res = await fetch(`${API_URL}/mediciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_consulta: idConsultaSeleccionada,
          tipo_metrica: metrica,
          valor: parseFloat(valor),
          unidad: unidadActual,
        }),
      });
      if (res.ok) {
        setMensaje('✅ Medición registrada exitosamente');
        setValor('');
      } else {
        const err = await res.json();
        setMensaje(`❌ ${err.detail}`);
      }
    } catch {
      setMensaje('❌ No se pudo conectar con el servidor.');
    }
    setCargando(false);
  };

  return (
    <div className="bg-white p-8 rounded-3xl shadow-xl border border-sky-100 animate-in fade-in duration-500">
      <h2 className="text-2xl font-extrabold text-slate-900 mb-6 flex items-center">
        <span className="mr-3">📏</span> Cargar Medición
      </h2>

      {/* PASO 1: Buscar paciente */}
      <div className="space-y-4 mb-6">
        <label className="font-bold text-slate-700">DNI del paciente</label>
        <div className="flex gap-3">
          <input
            className="flex-1 border-2 p-3 rounded-xl outline-none focus:border-blue-500"
            placeholder="Ej: 12345678"
            value={dni}
            onChange={e => setDni(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscarConsultas()}
          />
          <button
            onClick={buscarConsultas}
            disabled={cargando}
            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50"
          >
            {cargando ? '...' : 'Buscar'}
          </button>
        </div>
      </div>

      {/* PASO 2: Cargar medición */}
      {paso === 2 && (
        <div className="space-y-5 border-t pt-6">
          {/* Selector de consulta */}
          <div>
            <label className="font-bold text-slate-700 block mb-2">Consulta asociada</label>
            <select
              className="w-full border-2 p-3 rounded-xl"
              value={idConsultaSeleccionada}
              onChange={e => setIdConsultaSeleccionada(e.target.value)}
            >
              {consultas.map(c => (
                <option key={c.id_consulta} value={c.id_consulta}>
                  {new Date(c.fecha_hora).toLocaleDateString('es-AR')} — {c.motivo}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de métrica */}
          <div>
            <label className="font-bold text-slate-700 block mb-2">Tipo de métrica</label>
            <select
              className="w-full border-2 p-3 rounded-xl"
              value={metrica}
              onChange={e => setMetrica(e.target.value)}
            >
              {METRICAS.map(m => (
                <option key={m.valor} value={m.valor}>{m.etiqueta} ({m.unidad})</option>
              ))}
            </select>
          </div>

          {/* Valor */}
          <div>
            <label className="font-bold text-slate-700 block mb-2">
              Valor <span className="text-slate-400 font-normal">({unidadActual})</span>
            </label>
            <input
              className="w-full border-2 p-3 rounded-xl"
              type="number"
              step="0.1"
              placeholder={`Ej: ${metrica === 'peso' ? '15.5' : metrica === 'talla' ? '110' : '180'}`}
              value={valor}
              onChange={e => setValor(e.target.value)}
            />
          </div>

          <button
            onClick={guardarMedicion}
            disabled={cargando}
            className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black text-lg shadow-lg hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            {cargando ? 'Guardando...' : 'Guardar Medición'}
          </button>
        </div>
      )}

      {/* Mensaje */}
      {mensaje && (
        <div className={`mt-4 p-4 rounded-xl font-bold text-center ${mensaje.startsWith('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {mensaje}
        </div>
      )}
    </div>
  );
};