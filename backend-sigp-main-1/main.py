from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import base64
import hashlib
import hmac
import json
import os
import mysql.connector

app = FastAPI(title="API SIGP")

API_PREFIX = "/api"
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-this-secret")
DEMO_USERS = {
    "admin@sigp.ar": ("admin123", "admin"),
    "enfermeria@sigp.ar": ("enfermeria123", "enfermeria"),
    "medico@sigp.ar": ("medico123", "medico"),
}

# Configurar CORS para que el Frontend (React) pueda hacer peticiones sin ser bloqueado
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración de tu BD MySQL
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "sigp_db"),
}

def _token_for(username: str, role: str) -> str:
    payload = {"sub": username, "role": role, "exp": int((datetime.utcnow() + timedelta(hours=8)).timestamp())}
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(JWT_SECRET.encode(), encoded.encode(), hashlib.sha256).digest()
    return f"{encoded}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}"

def current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Autenticación requerida.")
    try:
        encoded, provided = authorization[7:].split(".", 1)
        expected = base64.urlsafe_b64encode(hmac.new(JWT_SECRET.encode(), encoded.encode(), hashlib.sha256).digest()).decode().rstrip("=")
        if not hmac.compare_digest(provided, expected):
            raise ValueError
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=="))
        if int(payload.get("exp", 0)) < int(datetime.utcnow().timestamp()):
            raise ValueError
        return payload
    except (ValueError, KeyError, json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

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

# --- CONTRATOS DE INTEGRACIÓN V1 ---
class LoginRequest(BaseModel):
    username: str
    password: str

class TriajeRequest(BaseModel):
    paciente_id: str
    temperatura: float
    frecuencia_cardiaca: float
    saturacion_oxigeno: float
    peso_kg: float
    talla_cm: float

class PrescriptionRequest(BaseModel):
    nombre: str
    dosis: str
    frecuencia: str
    duracion: str

class HcdConsultationRequest(BaseModel):
    motivo: str
    diagnostico: str
    plan: str
    prescripciones: list[PrescriptionRequest] = []
    firma_digital: bool = False

@app.post("/api/auth/login")
def login(credentials: LoginRequest):
    configured = DEMO_USERS.get(credentials.username.lower())
    if not configured or not hmac.compare_digest(credentials.password, configured[0]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas.")
    return {"token": _token_for(credentials.username.lower(), configured[1]), "role": configured[1]}

@app.get("/api/pacientes/buscar")
def buscar_pacientes(q: str, user=Depends(current_user)):
    if len(q.strip()) < 2:
        raise HTTPException(status_code=422, detail="La búsqueda debe tener al menos 2 caracteres.")
    conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id_paciente AS id, nombre, apellido, dni, fecha_nacimiento FROM pacientes WHERE dni LIKE %s OR nombre LIKE %s OR apellido LIKE %s LIMIT 20", (f"%{q}%", f"%{q}%", f"%{q}%"))
        return {"pacientes": cursor.fetchall()}
    finally:
        cursor.close(); conn.close()

@app.get("/api/turnos")
def listar_turnos(fecha: str, consultorio_id: str = "all", user=Depends(current_user)):
    conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
    try:
        query = "SELECT * FROM turnos WHERE DATE(fecha_hora) = %s"
        params = [fecha]
        if consultorio_id != "all": query += " AND consultorio_id = %s"; params.append(consultorio_id)
        query += " ORDER BY fecha_hora"
        cursor.execute(query, tuple(params)); return {"turnos": cursor.fetchall()}
    finally:
        cursor.close(); conn.close()

@app.post("/api/triaje")
def guardar_triaje(triaje: TriajeRequest, user=Depends(current_user)):
    if min(triaje.temperatura, triaje.frecuencia_cardiaca, triaje.saturacion_oxigeno, triaje.peso_kg, triaje.talla_cm) < 0:
        raise HTTPException(status_code=422, detail="Los signos vitales no pueden ser negativos.")
    conn = get_db_connection(); cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO triajes (id_paciente, temperatura, frecuencia_cardiaca, saturacion_oxigeno, peso_kg, talla_cm) VALUES (%s,%s,%s,%s,%s,%s)", (triaje.paciente_id, triaje.temperatura, triaje.frecuencia_cardiaca, triaje.saturacion_oxigeno, triaje.peso_kg, triaje.talla_cm)); conn.commit(); return {"mensaje": "Triaje guardado correctamente"}
    finally:
        cursor.close(); conn.close()

@app.get("/api/pacientes/{paciente_id}/hcd")
def obtener_hcd(paciente_id: str, user=Depends(current_user)):
    conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id_paciente AS id, nombre, apellido, dni, fecha_nacimiento FROM pacientes WHERE id_paciente = %s", (paciente_id,)); paciente = cursor.fetchone()
        if not paciente: raise HTTPException(status_code=404, detail="Paciente no encontrado.")
        cursor.execute("SELECT * FROM antecedentes_medicos WHERE id_paciente = %s", (paciente_id,)); antecedentes = cursor.fetchone() or {}
        return {"paciente": paciente, "antecedentes": antecedentes, "curvas_crecimiento": {"peso": [], "talla": [], "perimetro_cefalico": []}}
    finally:
        cursor.close(); conn.close()

@app.post("/api/hcd/{paciente_id}/consultas")
def guardar_consulta_hcd(paciente_id: str, consulta: HcdConsultationRequest, user=Depends(current_user)):
    if user.get("role") != "medico": raise HTTPException(status_code=403, detail="Solo un médico puede firmar consultas.")
    if not consulta.firma_digital: raise HTTPException(status_code=422, detail="La firma digital es obligatoria.")
    conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id_hcd FROM historias_clinicas_digitales WHERE id_paciente = %s AND estado = 'activa'", (paciente_id,)); hcd = cursor.fetchone()
        if not hcd: raise HTTPException(status_code=404, detail="Historia clínica activa no encontrada.")
        cursor.execute("INSERT INTO consultas_medicas (id_hcd, id_medico, motivo, descripcion_problema) VALUES (%s,%s,%s,%s)", (hcd["id_hcd"], user["sub"], consulta.motivo, f"Diagnóstico: {consulta.diagnostico}\nPlan: {consulta.plan}")); conn.commit(); return {"mensaje": "Consulta guardada y firmada digitalmente"}
    finally:
        cursor.close(); conn.close()

@app.get("/api/vademecum/buscar")
def buscar_vademecum(q: str, paciente_id: str, user=Depends(current_user)):
    return {"medicamentos": []}

@app.patch("/api/alertas/{alerta_id}/confirmar")
def confirmar_alerta(alerta_id: str, user=Depends(current_user)):
    return {"mensaje": "Alerta confirmada", "id": alerta_id}

@app.websocket("/ws")
async def alertas_websocket(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
