import { useState } from 'react';
import { RegistroConsulta } from './RegistroConsulta';
import { CurvasDesarrollo } from './CurvasDesarrollo';
import { CargarMedicion } from './CargarMedicion';

type Vista = 'registro' | 'medicion' | 'grafico';

function App() {
  const [vistaActual, setVistaActual] = useState<Vista>('registro');

  return (
    <div className="min-h-screen bg-sky-50 font-sans text-slate-800">
      <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-sky-100 p-6 flex justify-between items-center z-10">
        <div>
          <h1 className="text-2xl font-black text-blue-900 tracking-tight">
            SIGP<span className="text-blue-500">.Med</span>
          </h1>
        </div>

        <div className="bg-sky-100 p-1 rounded-full flex gap-1">
          <button
            onClick={() => setVistaActual('registro')}
            className={`px-6 py-2 rounded-full font-bold transition-all ${vistaActual === 'registro' ? 'bg-blue-600 text-white shadow-lg' : 'text-blue-700 hover:bg-sky-200'}`}
          >
            Consulta
          </button>
          <button
            onClick={() => setVistaActual('medicion')}
            className={`px-6 py-2 rounded-full font-bold transition-all ${vistaActual === 'medicion' ? 'bg-blue-600 text-white shadow-lg' : 'text-blue-700 hover:bg-sky-200'}`}
          >
            Mediciones
          </button>
          <button
            onClick={() => setVistaActual('grafico')}
            className={`px-6 py-2 rounded-full font-bold transition-all ${vistaActual === 'grafico' ? 'bg-blue-600 text-white shadow-lg' : 'text-blue-700 hover:bg-sky-200'}`}
          >
            Evolución
          </button>
        </div>
      </header>

      <main className="p-8 max-w-5xl mx-auto">
        {vistaActual === 'registro'  && <RegistroConsulta />}
        {vistaActual === 'medicion'  && <CargarMedicion />}
        {vistaActual === 'grafico'   && <CurvasDesarrollo />}
      </main>
    </div>
  );
}

export default App;