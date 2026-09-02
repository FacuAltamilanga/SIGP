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
from dotenv import load_dotenv

load_dotenv()
import psycopg
from psycopg.rows import dict_row

app = FastAPI(title="API SIGP")

API_PREFIX = "/api"
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-this-secret")
DEMO_USERS = {
    "admin@sigp.ar": ("admin123", "admin"),
    "enfermeria@sigp.ar": ("enfermeria123", "enfermeria"),
    "medico@sigp.ar": ("medico123", "medico"),
}

# UUID de las entidades creadas por migrations/001_seed_demo_data.sql.
# Se configuran como variables de entorno en Render.
SIGP_SEDE_CLINICA_ID = os.getenv("SIGP_SEDE_CLINICA_ID")
SIGP_USER_IDS = {
    "admin": os.getenv("SIGP_ADMIN_USER_ID"),
    "enfermeria": os.getenv("SIGP_ENFERMERIA_USER_ID"),
    "medico": os.getenv("SIGP_MEDICO_USER_ID"),
}

# Configurar CORS para que el Frontend (React) pueda hacer peticiones sin ser bloqueado
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,https://facualtamilanga.github.io").split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración de tu BD MySQL
DATABASE_URL = os.getenv("DATABASE_URL")
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
    "dbname": os.getenv("DB_NAME", "sigp_db"),
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
        payload["user_id"] = SIGP_USER_IDS.get(payload.get("role"))
        return payload
    except (ValueError, KeyError, json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

def get_db_connection():
    return psycopg.connect(DATABASE_URL) if DATABASE_URL else psycopg.connect(**DB_CONFIG)

def get_dict_cursor(conn):
    return conn.cursor(row_factory=dict_row)

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

class PacienteTurno(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    dni: Optional[str] = None
    fecha_nacimiento: Optional[str] = None
    sexo: Optional[str] = None

class NuevoTurno(BaseModel):
    fecha: str
    hora: str
    dni: Optional[str] = None
    nombre_paciente: Optional[str] = None
    apellido_paciente: Optional[str] = None
    fecha_nacimiento: Optional[str] = None
    sexo: Optional[str] = None
    paciente: Optional[PacienteTurno] = None
    tutor: Optional[str] = None
    consultorio_id: Optional[str] = None
    motivo: str = 'Consulta pediátrica'

# --- ENDPOINT 1: REGISTRAR CONSULTA (Y PACIENTE SI ES NUEVO) ---

@app.post("/api/consultas")
def registrar_consulta(consulta: NuevaConsulta, user=Depends(current_user)):
    conn = get_db_connection()
    cursor = get_dict_cursor(conn)
    
    try:
        # 1. Buscar si el paciente existe
        if not SIGP_SEDE_CLINICA_ID:
            raise HTTPException(status_code=500, detail="SIGP_SEDE_CLINICA_ID no está configurado.")
        cursor.execute("SELECT id FROM pacientes WHERE numero_documento = %s AND sede_clinica_id = %s", (consulta.dni_paciente, SIGP_SEDE_CLINICA_ID))
        paciente = cursor.fetchone()
        
        if not paciente:
            # Si no existe, asegurarse de que mandaron los datos del paciente nuevo
            if not consulta.datos_paciente:
                raise HTTPException(status_code=400, detail="El paciente es nuevo. Faltan datos del paciente.")
            
            datos = consulta.datos_paciente
            
            # A. Insertar Paciente
            cursor.execute("INSERT INTO pacientes (sede_clinica_id, numero_documento, nombres, apellidos, fecha_nacimiento, sexo) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id", (SIGP_SEDE_CLINICA_ID, consulta.dni_paciente, datos.nombre, datos.apellido, datos.fecha_nacimiento, datos.sexo))
            
            # Recuperar el ID generado (Como usas UUID() en BD, lo buscamos de nuevo)
            id_paciente = cursor.fetchone()['id']
            cursor.execute("INSERT INTO historias_clinicas (paciente_id, sede_clinica_id, numero_historia, creada_por) VALUES (%s,%s,%s,%s)", (id_paciente, SIGP_SEDE_CLINICA_ID, f'HCD-{consulta.dni_paciente}', user.get('user_id')))
            
        # 2. Obtener el ID de la HCD del paciente (sea nuevo o viejo)
        cursor.execute("""
            SELECT h.id FROM historias_clinicas h
            JOIN pacientes p ON p.id = h.paciente_id
            WHERE p.numero_documento = %s AND h.sede_clinica_id = %s AND h.estado = 'activa'
        """, (consulta.dni_paciente, SIGP_SEDE_CLINICA_ID))
        hcd = cursor.fetchone()
        
        if not hcd:
            raise HTTPException(status_code=500, detail="El paciente no tiene una Historia Clínica activa.")
            
        id_hcd = hcd['id']

        # 3. Registrar la Consulta Médica
        cursor.execute("""
            INSERT INTO atenciones (historia_clinica_id, tipo, medico_usuario_id, admitida_por)
            VALUES (%s, 'consulta', %s, %s) RETURNING id
        """, (id_hcd, consulta.id_medico, user.get('user_id') or consulta.id_medico))
        atencion_id = cursor.fetchone()['id']
        cursor.execute("INSERT INTO registros_consulta (historia_clinica_id, atencion_id, medico_usuario_id, motivo_consulta, diagnostico_resumen, prescripcion_resumen, plan_seguimiento) VALUES (%s,%s,%s,%s,%s,%s,%s)", (id_hcd, atencion_id, consulta.id_medico, consulta.motivo_consulta, consulta.descripcion_problema, 'Sin prescripción', 'Seguimiento según evolución'))
        
        # Confirmar todos los cambios (Transacción)
        conn.commit()
        return {"mensaje": "Consulta registrada exitosamente"}
        
    except psycopg.Error as err:
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
    cursor = get_dict_cursor(conn)
    
    try:
        column = {'peso': 'peso_kg', 'peso_kg': 'peso_kg', 'talla': 'talla_cm', 'talla_cm': 'talla_cm', 'temperatura': 'temperatura_c', 'frecuencia_cardiaca': 'frecuencia_cardiaca_lpm', 'saturacion_oxigeno': 'saturacion_oxigeno_pct'}.get(metrica)
        if not column: raise HTTPException(status_code=422, detail='Métrica no soportada.')
        query = f"SELECT sv.registrado_en AS fecha_hora, sv.{column} AS valor, %s AS unidad FROM signos_vitales sv JOIN historias_clinicas h ON h.id = sv.historia_clinica_id JOIN pacientes p ON p.id = h.paciente_id WHERE p.numero_documento = %s AND sv.{column} IS NOT NULL ORDER BY sv.registrado_en ASC"
        cursor.execute(query, (metrica, dni))
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
def registrar_medicion(medicion: NuevaMedicion, user=Depends(current_user)):
    conn = get_db_connection()
    cursor = get_dict_cursor(conn)
    try:
        # Verificar que la consulta existe
        column = {'peso': 'peso_kg', 'talla': 'talla_cm', 'temperatura': 'temperatura_c', 'frecuencia_cardiaca': 'frecuencia_cardiaca_lpm', 'saturacion_oxigeno': 'saturacion_oxigeno_pct'}.get(medicion.tipo_metrica)
        if not column: raise HTTPException(status_code=422, detail='Métrica no soportada.')
        cursor.execute("SELECT historia_clinica_id FROM atenciones WHERE id = %s", (medicion.id_consulta,))
        atencion = cursor.fetchone()
        if not atencion:
            raise HTTPException(status_code=404, detail="La consulta no existe.")
        cursor.execute(f"INSERT INTO signos_vitales (historia_clinica_id, atencion_id, registrado_por, edad_dias, {column}) VALUES (%s,%s,%s,0,%s)", (atencion['historia_clinica_id'], medicion.id_consulta, user.get('user_id'), medicion.valor))
        conn.commit()
        return {"mensaje": "Medición registrada exitosamente"}
    except psycopg.Error as err:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error en la base de datos: {str(err)}")
    finally:
        cursor.close()
        conn.close()

# --- ENDPOINT: OBTENER CONSULTAS DE UN PACIENTE (para el selector) ---
@app.get("/api/pacientes/{dni}/consultas")
def obtener_consultas(dni: str):
    conn = get_db_connection()
    cursor = get_dict_cursor(conn)
    try:
        cursor.execute("""
            SELECT a.id AS id_consulta, rc.motivo_consulta AS motivo, a.admitida_en AS fecha_hora
            FROM atenciones a JOIN historias_clinicas h ON h.id = a.historia_clinica_id
            JOIN registros_consulta rc ON rc.atencion_id = a.id
            JOIN pacientes p ON p.id = h.paciente_id
            WHERE p.numero_documento = %s ORDER BY a.admitida_en DESC
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
    conn = get_db_connection(); cursor = get_dict_cursor(conn)
    try:
        cursor.execute("SELECT id, nombres AS nombre, apellidos AS apellido, numero_documento AS dni, fecha_nacimiento FROM pacientes WHERE numero_documento ILIKE %s OR nombres ILIKE %s OR apellidos ILIKE %s LIMIT 20", (f"%{q}%", f"%{q}%", f"%{q}%"))
        return {"pacientes": cursor.fetchall()}
    finally:
        cursor.close(); conn.close()

@app.get("/api/turnos")
def listar_turnos(fecha: str, consultorio_id: str = "all", user=Depends(current_user)):
    conn = get_db_connection(); cursor = get_dict_cursor(conn)
    try:
        query = "SELECT id, fecha_hora_inicio AS fecha_hora, paciente_id, medico_usuario_id, estado AS cobertura, NULL AS nombre_paciente, NULL AS dni, tutor_nombre AS tutor, NULL AS obra_social, NULL AS consultorio_id FROM turnos WHERE DATE(fecha_hora_inicio) = %s"
        params = [fecha]
        if consultorio_id != "all": query += " AND consultorio_id = %s"; params.append(consultorio_id)
        query += " ORDER BY fecha_hora"
        cursor.execute(query, tuple(params)); return {"turnos": cursor.fetchall()}
    finally:
        cursor.close(); conn.close()

@app.post("/api/turnos")
def crear_turno(turno: NuevoTurno, user=Depends(current_user)):
    if not SIGP_SEDE_CLINICA_ID or not user.get('user_id'):
        raise HTTPException(status_code=500, detail="Faltan configurar los UUID de sede o usuario.")
    try:
        inicio = datetime.fromisoformat(f"{turno.fecha}T{turno.hora}")
    except ValueError:
        raise HTTPException(status_code=422, detail="Fecha u hora inválida.")
    paciente_enviado = turno.paciente
    dni = (turno.dni or (paciente_enviado.dni if paciente_enviado else None) or '').strip()
    if not dni:
        raise HTTPException(status_code=422, detail="El DNI del paciente es obligatorio.")
    fin = inicio + timedelta(minutes=30)
    medico_id = SIGP_USER_IDS.get('medico') or user['user_id']
    conn = get_db_connection(); cursor = get_dict_cursor(conn)
    try:
        cursor.execute("SELECT id FROM pacientes WHERE numero_documento = %s AND sede_clinica_id = %s", (dni, SIGP_SEDE_CLINICA_ID))
        paciente = cursor.fetchone()
        if not paciente:
            nombre = (turno.nombre_paciente or (paciente_enviado.nombre if paciente_enviado else None) or '').strip()
            apellido = (turno.apellido_paciente or (paciente_enviado.apellido if paciente_enviado else None) or '').strip()
            fecha_nacimiento_texto = turno.fecha_nacimiento or (paciente_enviado.fecha_nacimiento if paciente_enviado else None)
            sexo = turno.sexo or (paciente_enviado.sexo if paciente_enviado else None)
            if not nombre or not apellido or not fecha_nacimiento_texto or not sexo:
                raise HTTPException(status_code=422, detail="Para un paciente nuevo se requieren nombres, apellidos, fecha de nacimiento y sexo.")
            if sexo not in {'femenino', 'masculino', 'intersexual', 'no_informado'}:
                raise HTTPException(status_code=422, detail="El sexo informado no es válido.")
            try:
                fecha_nacimiento = datetime.strptime(fecha_nacimiento_texto, '%Y-%m-%d').date()
            except ValueError:
                raise HTTPException(status_code=422, detail="La fecha de nacimiento debe tener formato AAAA-MM-DD.")
            if fecha_nacimiento > datetime.now().date():
                raise HTTPException(status_code=422, detail="La fecha de nacimiento no puede estar en el futuro.")
            cursor.execute(
                """INSERT INTO pacientes (sede_clinica_id, numero_documento, nombres, apellidos, fecha_nacimiento, sexo)
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                (SIGP_SEDE_CLINICA_ID, dni, nombre, apellido, fecha_nacimiento, sexo),
            )
            paciente = cursor.fetchone()
        cursor.execute("""INSERT INTO turnos (sede_clinica_id, paciente_id, medico_usuario_id, solicitado_por, motivo, tutor_nombre, fecha_hora_inicio, fecha_hora_fin)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, fecha_hora_inicio AS hora, paciente_id, estado""", (SIGP_SEDE_CLINICA_ID, paciente['id'], medico_id, user['user_id'], turno.motivo, (turno.tutor or '').strip() or None, inicio, fin))
        creado = cursor.fetchone(); conn.commit()
        return {"turnos": [{
            "id": creado["id"],
            "hora": inicio.strftime('%H:%M'),
            "nombre_paciente": turno.nombre_paciente,
            "dni": dni,
            "tutor": (turno.tutor or '').strip() or None,
            "cobertura": "pending",
            "consultorio_id": turno.consultorio_id or "general",
            "consultorio": "Agenda general",
        }]}
    except HTTPException:
        conn.rollback(); raise
    except psycopg.errors.ExclusionViolation:
        conn.rollback()
        raise HTTPException(status_code=409, detail="El horario seleccionado se superpone con otro turno del médico. Elegí otro horario.")
    except psycopg.Error as err:
        conn.rollback(); raise HTTPException(status_code=500, detail=f"Error en la base de datos: {err}")
    finally:
        cursor.close(); conn.close()

@app.post("/api/triaje")
def guardar_triaje(triaje: TriajeRequest, user=Depends(current_user)):
    if min(triaje.temperatura, triaje.frecuencia_cardiaca, triaje.saturacion_oxigeno, triaje.peso_kg, triaje.talla_cm) < 0:
        raise HTTPException(status_code=422, detail="Los signos vitales no pueden ser negativos.")
    conn = get_db_connection(); cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM historias_clinicas WHERE paciente_id = %s AND sede_clinica_id = %s AND estado = 'activa'", (triaje.paciente_id, SIGP_SEDE_CLINICA_ID)); history = cursor.fetchone()
        if not history: raise HTTPException(status_code=404, detail="El paciente no tiene historia clínica activa.")
        cursor.execute("INSERT INTO signos_vitales (historia_clinica_id, registrado_por, edad_dias, temperatura_c, frecuencia_cardiaca_lpm, saturacion_oxigeno_pct, peso_kg, talla_cm) VALUES (%s,%s,0,%s,%s,%s,%s,%s)", (history['id'], user.get('user_id'), triaje.temperatura, triaje.frecuencia_cardiaca, triaje.saturacion_oxigeno, triaje.peso_kg, triaje.talla_cm)); conn.commit(); return {"mensaje": "Triaje guardado correctamente"}
    finally:
        cursor.close(); conn.close()

@app.get("/api/pacientes/{paciente_id}/hcd")
def obtener_hcd(paciente_id: str, user=Depends(current_user)):
    conn = get_db_connection(); cursor = get_dict_cursor(conn)
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
    conn = get_db_connection(); cursor = get_dict_cursor(conn)
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
