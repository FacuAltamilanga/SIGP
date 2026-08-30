import { useState } from 'react';
import { getApiUrl, getAuthHeaders } from './lib/auth';
const ID_MEDICO_PRUEBA = "69510217-7363-11f1-9477-19bb61b157a0"; // ← pegá el UUID de tu tabla medicos

type TipoPaciente = 'nuevo' | 'registrado';

export const RegistroConsulta = () => {
  const [tipoPaciente, setTipoPaciente] = useState<TipoPaciente>('registrado');
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);

  // Campos paciente registrado
  const [dni, setDni] = useState('');
  const [motivo, setMotivo] = useState('');
  const [descripcion, setDescripcion] = useState('');

  // Campos paciente nuevo
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [dniNuevo, setDniNuevo] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [cobertura, setCobertura] = useState('');
  const [enfermedades, setEnfermedades] = useState('');
  const [cirugias, setCirugias] = useState('');
  const [habitos, setHabitos] = useState('');
  const [medicamentos, setMedicamentos] = useState('');
  const [alergias, setAlergias] = useState('');
  const [motivoNuevo, setMotivoNuevo] = useState('');
  const [descripcionNuevo, setDescripcionNuevo] = useState('');

  const handleSubmit = async () => {
    setCargando(true);
    setMensaje('');

    try {
      let body: object;

      if (tipoPaciente === 'registrado') {
        if (!dni || !motivo || !descripcion) {
          setMensaje('❌ Completá todos los campos obligatorios');
          setCargando(false);
          return;
        }
        body = {
          dni_paciente: dni,
          motivo_consulta: motivo,
          descripcion_problema: descripcion,
          id_medico: ID_MEDICO_PRUEBA,
        };
      } else {
        // Separar nombre y apellido (toma la última palabra como apellido)
        const partes = nombreCompleto.trim().split(' ');
        const apellido = partes.pop() ?? '';
        const nombre = partes.join(' ');

        body = {
          dni_paciente: dniNuevo,
          motivo_consulta: motivoNuevo,
          descripcion_problema: descripcionNuevo,
          id_medico: ID_MEDICO_PRUEBA,
          datos_paciente: {
            nombre,
            apellido,
            fecha_nacimiento: fechaNacimiento,
            sexo: 'F', // podés agregar un selector después
            cobertura_medica: cobertura,
            enfermedades_previas: enfermedades,
            cirugias_internaciones: cirugias,
            habitos,
            medicacion_habitual: medicamentos,
            alergias,
          },
        };
      }

      const headers = new Headers(getAuthHeaders());
      headers.set('Content-Type', 'application/json');
      const response = await fetch(`${getApiUrl()}/consultas`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setMensaje('✅ Consulta registrada exitosamente');
      } else {
        const error = await response.json();
        setMensaje(`❌ Error: ${error.detail}`);
      }
    } catch {
      setMensaje('❌ No se pudo conectar con el servidor. ¿Está corriendo el backend?');
    }

    setCargando(false);
  };

  return (
    <div className="bg-white p-8 rounded-3xl shadow-xl border border-sky-100 animate-in fade-in duration-500">
      <h2 className="text-2xl font-extrabold text-slate-900 mb-6 flex items-center">
        <span className="mr-3">🩺</span> Admisión de Consulta
      </h2>

      <div className="flex gap-4 mb-8 bg-sky-50 p-2 rounded-2xl">
        <button
          onClick={() => setTipoPaciente('registrado')}
          className={`flex-1 py-3 rounded-xl font-bold transition-all ${tipoPaciente === 'registrado' ? 'bg-white shadow text-blue-900' : 'text-slate-500'}`}
        >
          Paciente Registrado
        </button>
        <button
          onClick={() => setTipoPaciente('nuevo')}
          className={`flex-1 py-3 rounded-xl font-bold transition-all ${tipoPaciente === 'nuevo' ? 'bg-white shadow text-blue-900' : 'text-slate-500'}`}
        >
          Paciente Nuevo
        </button>
      </div>

      <div className="space-y-6">
        {tipoPaciente === 'nuevo' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <h3 className="col-span-2 text-lg font-bold text-blue-900 border-b pb-2">Información Personal</h3>
            <input className="border-2 p-3 rounded-xl w-full" placeholder="Nombre completo *" value={nombreCompleto} onChange={e => setNombreCompleto(e.target.value)} />
            <input className="border-2 p-3 rounded-xl w-full" placeholder="DNI *" value={dniNuevo} onChange={e => setDniNuevo(e.target.value)} />
            <input className="border-2 p-3 rounded-xl w-full" type="date" placeholder="Fecha de nacimiento *" value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)} />

            <h3 className="col-span-2 text-lg font-bold text-blue-900 border-b pb-2 mt-4">Consulta</h3>
            <input className="col-span-2 border-2 p-3 rounded-xl w-full" placeholder="Motivo de consulta *" value={motivoNuevo} onChange={e => setMotivoNuevo(e.target.value)} />
            <textarea className="col-span-2 border-2 p-3 rounded-xl" placeholder="Descripción del problema *" value={descripcionNuevo} onChange={e => setDescripcionNuevo(e.target.value)} />

            <h3 className="col-span-2 text-lg font-bold text-blue-900 border-b pb-2 mt-4">Antecedentes Médicos</h3>
            <input className="border-2 p-3 rounded-xl w-full" placeholder="Cobertura médica" value={cobertura} onChange={e => setCobertura(e.target.value)} />
            <textarea className="col-span-2 border-2 p-3 rounded-xl" placeholder="Enfermedades previas" value={enfermedades} onChange={e => setEnfermedades(e.target.value)} />
            <textarea className="col-span-2 border-2 p-3 rounded-xl" placeholder="Cirugías e Internaciones" value={cirugias} onChange={e => setCirugias(e.target.value)} />
            <textarea className="col-span-2 border-2 p-3 rounded-xl" placeholder="Hábitos" value={habitos} onChange={e => setHabitos(e.target.value)} />
            <textarea className="col-span-2 border-2 p-3 rounded-xl" placeholder="Medicamentos actuales" value={medicamentos} onChange={e => setMedicamentos(e.target.value)} />
            <textarea className="col-span-2 border-2 p-3 rounded-xl" placeholder="Alergias" value={alergias} onChange={e => setAlergias(e.target.value)} />
          </div>
        ) : (
          <div className="space-y-4">
            <input className="w-full border-2 p-3 rounded-xl" placeholder="DNI del paciente *" value={dni} onChange={e => setDni(e.target.value)} />
            <input className="w-full border-2 p-3 rounded-xl" placeholder="Motivo de consulta *" value={motivo} onChange={e => setMotivo(e.target.value)} />
            <textarea className="w-full border-2 p-3 rounded-xl h-32" placeholder="Descripción del problema actual *" value={descripcion} onChange={e => setDescripcion(e.target.value)} />
          </div>
        )}

        {mensaje && (
          <div className={`p-4 rounded-xl font-bold text-center ${mensaje.startsWith('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {mensaje}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={cargando}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-lg shadow-lg hover:bg-blue-700 transition-all disabled:opacity-50"
        >
          {cargando ? 'Registrando...' : 'Finalizar Admisión'}
        </button>
      </div>
    </div>
  );
};
