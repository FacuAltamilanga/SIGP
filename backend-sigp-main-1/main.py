from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import mysql.connector
import uuid

app = FastAPI(title="API SIGP - Sprint 1")

# Configurar CORS para que el Frontend (React) pueda hacer peticiones sin ser bloqueado
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En producción cambiar por la URL de React (ej. http://localhost:5173)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración de tu BD MySQL
DB_CONFIG = {
    "host": "localhost",
    "user": "root", # Cambia por tu usuario
    "password": "pepsibraidiota1", # Cambia por tu contraseña
    "database": "sigp_db"
}

def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)

# --- MODELOS DE DATOS (Lo que el frontend debe enviar) ---

class DatosPacienteNuevo(BaseModel):
    nombre: str
    apellido: str
    fecha_nacimiento: str # Formato YYYY-MM-DD
    sexo: str
    cobertura_medica: Optional[str] = None
    enfermedades_previas: Optional[str] = None
    cirugias_internaciones: Optional[str] = None
    habitos: Optional[str] = None
    medicacion_habitual: Optional[str] = None
    alergias: Optional[str] = None

class NuevaConsulta(BaseModel):
    dni_paciente: str
    motivo_consulta: str
    descripcion_problema: str
    id_medico: str # Tu compañero debe enviarte el UUID de un médico de prueba
    datos_paciente: Optional[DatosPacienteNuevo] = None

# --- ENDPOINT 1: REGISTRAR CONSULTA (Y PACIENTE SI ES NUEVO) ---

@app.post("/api/consultas")
def registrar_consulta(consulta: NuevaConsulta):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # 1. Buscar si el paciente existe
        cursor.execute("SELECT id_paciente FROM pacientes WHERE dni = %s", (consulta.dni_paciente,))
        paciente = cursor.fetchone()
        
        if not paciente:
            # Si no existe, asegurarse de que mandaron los datos del paciente nuevo
            if not consulta.datos_paciente:
                raise HTTPException(status_code=400, detail="El paciente es nuevo. Faltan datos del paciente.")
            
            datos = consulta.datos_paciente
            
            # A. Insertar Paciente
            cursor.execute("""
                INSERT INTO pacientes (dni, nombre, apellido, fecha_nacimiento, sexo)
                VALUES (%s, %s, %s, %s, %s)
            """, (consulta.dni_paciente, datos.nombre, datos.apellido, datos.fecha_nacimiento, datos.sexo))
            
            # Recuperar el ID generado (Como usas UUID() en BD, lo buscamos de nuevo)
            cursor.execute("SELECT id_paciente FROM pacientes WHERE dni = %s", (consulta.dni_paciente,))
            id_paciente = cursor.fetchone()['id_paciente']
            
            # B. Insertar Antecedentes Médicos
            cursor.execute("""
                INSERT INTO antecedentes_medicos 
                (id_paciente, cobertura_medica, enfermedades_previas, cirugias_internaciones, habitos, medicacion_habitual, alergias)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (id_paciente, datos.cobertura_medica, datos.enfermedades_previas, datos.cirugias_internaciones, datos.habitos, datos.medicacion_habitual, datos.alergias))
            
            # C. Crear la Historia Clínica Digital (Requisito para tu tabla de consultas)
            cursor.execute("""
                INSERT INTO historias_clinicas_digitales (id_paciente, estado)
                VALUES (%s, 'activa')
            """, (id_paciente,))
            
        # 2. Obtener el ID de la HCD del paciente (sea nuevo o viejo)
        cursor.execute("""
            SELECT h.id_hcd FROM historias_clinicas_digitales h
            JOIN pacientes p ON p.id_paciente = h.id_paciente
            WHERE p.dni = %s
        """, (consulta.dni_paciente,))
        hcd = cursor.fetchone()
        
        if not hcd:
            raise HTTPException(status_code=500, detail="El paciente no tiene una Historia Clínica activa.")
            
        id_hcd = hcd['id_hcd']

        # 3. Registrar la Consulta Médica
        cursor.execute("""
            INSERT INTO consultas_medicas (id_hcd, id_medico, motivo, descripcion_problema)
            VALUES (%s, %s, %s, %s)
        """, (id_hcd, consulta.id_medico, consulta.motivo_consulta, consulta.descripcion_problema))
        
        # Confirmar todos los cambios (Transacción)
        conn.commit()
        return {"mensaje": "Consulta registrada exitosamente"}
        
    except mysql.connector.Error as err:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error en la base de datos: {str(err)}")
    finally:
        cursor.close()
        conn.close()

# --- ENDPOINT 2: EVOLUCIÓN DE MÉTRICAS ---

@app.get("/api/pacientes/{dni}/evolucion")
def obtener_evolucion(dni: str, metrica: str):
    # metrica puede ser 'peso', 'colesterol', etc.
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        query = """
            SELECT mp.fecha_hora, mp.valor, mp.unidad
            FROM mediciones_paciente mp
            JOIN consultas_medicas cm ON cm.id_consulta = mp.id_consulta
            JOIN historias_clinicas_digitales hcd ON hcd.id_hcd = cm.id_hcd
            JOIN pacientes p ON p.id_paciente = hcd.id_paciente
            WHERE p.dni = %s AND mp.tipo_metrica = %s
            ORDER BY mp.fecha_hora ASC
        """
        cursor.execute(query, (dni, metrica))
        resultados = cursor.fetchall()
        
        return {
            "dni": dni,
            "metrica": metrica,
            "evolucion": resultados
        }
    finally:
        cursor.close()
        conn.close()


        # --- MODELO PARA MEDICIONES ---
class NuevaMedicion(BaseModel):
    id_consulta: str
    tipo_metrica: str  # 'peso', 'talla', 'colesterol', etc.
    valor: float
    unidad: str        # 'kg', 'cm', 'mg/dL', etc.

# --- ENDPOINT: CARGAR MEDICIÓN ---
@app.post("/api/mediciones")
def registrar_medicion(medicion: NuevaMedicion):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verificar que la consulta existe
        cursor.execute("SELECT id_consulta FROM consultas_medicas WHERE id_consulta = %s", (medicion.id_consulta,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="La consulta no existe.")

        cursor.execute("""
            INSERT INTO mediciones_paciente (id_consulta, tipo_metrica, valor, unidad)
            VALUES (%s, %s, %s, %s)
        """, (medicion.id_consulta, medicion.tipo_metrica, medicion.valor, medicion.unidad))
        conn.commit()
        return {"mensaje": "Medición registrada exitosamente"}
    except mysql.connector.Error as err:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error en la base de datos: {str(err)}")
    finally:
        cursor.close()
        conn.close()

# --- ENDPOINT: OBTENER CONSULTAS DE UN PACIENTE (para el selector) ---
@app.get("/api/pacientes/{dni}/consultas")
def obtener_consultas(dni: str):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT cm.id_consulta, cm.motivo, cm.fecha_hora
            FROM consultas_medicas cm
            JOIN historias_clinicas_digitales hcd ON hcd.id_hcd = cm.id_hcd
            JOIN pacientes p ON p.id_paciente = hcd.id_paciente
            WHERE p.dni = %s
            ORDER BY cm.fecha_hora DESC
        """, (dni,))
        consultas = cursor.fetchall()
        if not consultas:
            raise HTTPException(status_code=404, detail="No se encontraron consultas para este paciente.")
        return consultas
    finally:
        cursor.close()
        conn.close()