-- Sistema Integral de Gestion Pediatrica (SIGP)
-- Capa de datos para PostgreSQL 15+
-- Modelo derivado de los TP1, TP2 y TP4 del Grupo 4.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE estado_usuario AS ENUM ('pendiente', 'activo', 'bloqueado', 'deshabilitado');
CREATE TYPE estado_membresia AS ENUM ('activa', 'suspendida', 'finalizada');
CREATE TYPE sexo_biologico AS ENUM ('femenino', 'masculino', 'intersexual', 'no_informado');
CREATE TYPE estado_consentimiento AS ENUM ('otorgado', 'revocado', 'vencido');
CREATE TYPE estado_cobertura AS ENUM ('pendiente', 'vigente', 'suspendida', 'vencida', 'rechazada');
CREATE TYPE estado_turno AS ENUM ('solicitado', 'confirmado', 'arribado', 'en_atencion', 'completado', 'cancelado', 'ausente');
CREATE TYPE tipo_atencion AS ENUM ('consulta', 'control', 'guardia', 'teleconsulta');
CREATE TYPE estado_atencion AS ENUM ('admitida', 'en_curso', 'finalizada', 'anulada');
CREATE TYPE estado_registro_clinico AS ENUM ('borrador', 'firmado', 'anulado');
CREATE TYPE prioridad_alerta AS ENUM ('advertencia', 'critica');
CREATE TYPE estado_alerta AS ENUM ('activa', 'confirmada', 'resuelta', 'anulada');
CREATE TYPE origen_alerta AS ENUM ('signo_vital', 'metrica_crecimiento', 'interaccion_medicamentosa', 'sintoma_critico', 'vacuna_vencida', 'manual');
CREATE TYPE metrica_crecimiento AS ENUM ('peso_kg', 'talla_cm', 'perimetro_cefalico_cm');
CREATE TYPE fuente_estudio AS ENUM ('carga_manual', 'hl7_oru_r01', 'api_externa');
CREATE TYPE direccion_hl7 AS ENUM ('entrante', 'saliente');
CREATE TYPE estado_procesamiento_hl7 AS ENUM ('recibido', 'validado', 'procesado', 'rechazado');
CREATE TYPE canal_notificacion AS ENUM ('push', 'sms', 'email', 'in_app');
CREATE TYPE estado_notificacion AS ENUM ('pendiente', 'enviada', 'entregada', 'fallida', 'leida', 'cancelada');

-- -----------------------------------------------------------------------------
-- Organizacion, identidad y control de acceso (RF1, RNF1)
-- -----------------------------------------------------------------------------

CREATE TABLE sedes_clinicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    cuit VARCHAR(13) UNIQUE,
    direccion VARCHAR(250),
    ciudad VARCHAR(100) NOT NULL,
    provincia VARCHAR(100) NOT NULL,
    zona_horaria VARCHAR(60) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_sede_cuit CHECK (cuit IS NULL OR cuit ~ '^[0-9]{11}$')
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(40) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    es_rol_sistema BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE permisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(80) NOT NULL UNIQUE,
    descripcion TEXT NOT NULL
);

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    telefono VARCHAR(30),
    estado estado_usuario NOT NULL DEFAULT 'pendiente',
    ultimo_acceso_en TIMESTAMPTZ,
    credenciales_actualizadas_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    deshabilitado_en TIMESTAMPTZ,
    CONSTRAINT ck_usuario_email CHECK (position('@' IN email) > 1),
    CONSTRAINT ck_usuario_deshabilitado CHECK (
        (estado = 'deshabilitado' AND deshabilitado_en IS NOT NULL)
        OR (estado <> 'deshabilitado' AND deshabilitado_en IS NULL)
    )
);

CREATE UNIQUE INDEX uq_usuarios_email_normalizado ON usuarios (lower(email));

CREATE TABLE rol_permisos (
    rol_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permiso_id UUID NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
    PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE usuario_roles (
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    rol_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    sede_clinica_id UUID NOT NULL REFERENCES sedes_clinicas(id) ON DELETE RESTRICT,
    asignado_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    asignado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    vigente_hasta TIMESTAMPTZ,
    PRIMARY KEY (usuario_id, rol_id, sede_clinica_id),
    CONSTRAINT ck_usuario_rol_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta > asignado_en)
);

CREATE TABLE membresias_clinica (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sede_clinica_id UUID NOT NULL REFERENCES sedes_clinicas(id) ON DELETE RESTRICT,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    legajo VARCHAR(40),
    cargo VARCHAR(100),
    estado estado_membresia NOT NULL DEFAULT 'activa',
    inicio_en DATE NOT NULL,
    fin_en DATE,
    UNIQUE (sede_clinica_id, usuario_id),
    UNIQUE (sede_clinica_id, legajo),
    CONSTRAINT ck_membresia_fechas CHECK (fin_en IS NULL OR fin_en >= inicio_en)
);

CREATE TABLE perfiles_profesionales (
    usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE RESTRICT,
    matricula VARCHAR(50) NOT NULL UNIQUE,
    especialidad VARCHAR(120) NOT NULL,
    firma_publica TEXT,
    certificado_firma_id VARCHAR(200),
    certificado_valido_hasta TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- Pacientes, tutores, privacidad y cobertura (RF9, RNF1)
-- -----------------------------------------------------------------------------

CREATE TABLE pacientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sede_clinica_id UUID NOT NULL REFERENCES sedes_clinicas(id) ON DELETE RESTRICT,
    tipo_documento VARCHAR(20) NOT NULL DEFAULT 'DNI',
    numero_documento VARCHAR(30) NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    sexo sexo_biologico NOT NULL DEFAULT 'no_informado',
    grupo_sanguineo VARCHAR(5),
    direccion VARCHAR(250),
    ciudad VARCHAR(100),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo_documento, numero_documento),
    UNIQUE (id, sede_clinica_id),
    CONSTRAINT ck_paciente_nacimiento CHECK (fecha_nacimiento <= CURRENT_DATE),
    CONSTRAINT ck_paciente_grupo_sanguineo CHECK (
        grupo_sanguineo IS NULL OR grupo_sanguineo IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    )
);

CREATE INDEX ix_pacientes_sede_apellido ON pacientes (sede_clinica_id, apellidos, nombres);

CREATE TABLE paciente_tutores (
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    tutor_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    vinculo VARCHAR(40) NOT NULL,
    es_tutor_legal BOOLEAN NOT NULL DEFAULT TRUE,
    es_contacto_principal BOOLEAN NOT NULL DEFAULT FALSE,
    puede_ver_hcd BOOLEAN NOT NULL DEFAULT TRUE,
    puede_gestionar_turnos BOOLEAN NOT NULL DEFAULT TRUE,
    telefono_emergencia VARCHAR(30),
    vigente_desde DATE NOT NULL DEFAULT CURRENT_DATE,
    vigente_hasta DATE,
    PRIMARY KEY (paciente_id, tutor_usuario_id),
    CONSTRAINT ck_paciente_tutor_fechas CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

CREATE UNIQUE INDEX uq_paciente_tutor_principal
    ON paciente_tutores (paciente_id)
    WHERE es_contacto_principal AND vigente_hasta IS NULL;

CREATE TABLE consentimientos_privacidad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    tutor_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    tipo VARCHAR(60) NOT NULL,
    version_documento VARCHAR(30) NOT NULL,
    estado estado_consentimiento NOT NULL,
    otorgado_en TIMESTAMPTZ,
    revocado_en TIMESTAMPTZ,
    vence_en TIMESTAMPTZ,
    evidencia_url TEXT,
    UNIQUE (paciente_id, tutor_usuario_id, tipo, version_documento),
    CONSTRAINT ck_consentimiento_otorgado CHECK (
        (estado = 'otorgado' AND otorgado_en IS NOT NULL AND revocado_en IS NULL)
        OR (estado = 'revocado' AND otorgado_en IS NOT NULL AND revocado_en IS NOT NULL)
        OR (estado = 'vencido' AND otorgado_en IS NOT NULL)
    )
);

CREATE TABLE obras_sociales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    cuit VARCHAR(13) UNIQUE,
    endpoint_validacion TEXT,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_obra_social_cuit CHECK (cuit IS NULL OR cuit ~ '^[0-9]{11}$')
);

CREATE TABLE coberturas_paciente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    obra_social_id UUID NOT NULL REFERENCES obras_sociales(id) ON DELETE RESTRICT,
    numero_afiliado VARCHAR(80) NOT NULL,
    plan VARCHAR(100),
    estado estado_cobertura NOT NULL DEFAULT 'pendiente',
    vigente_desde DATE,
    vigente_hasta DATE,
    es_principal BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (obra_social_id, numero_afiliado),
    CONSTRAINT ck_cobertura_fechas CHECK (
        vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta >= vigente_desde
    )
);

CREATE UNIQUE INDEX uq_cobertura_principal_vigente
    ON coberturas_paciente (paciente_id)
    WHERE es_principal AND estado = 'vigente';

-- -----------------------------------------------------------------------------
-- Historia clinica, turnos y atenciones (RF2, RF5)
-- -----------------------------------------------------------------------------

CREATE TABLE historias_clinicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL,
    sede_clinica_id UUID NOT NULL REFERENCES sedes_clinicas(id) ON DELETE RESTRICT,
    numero_historia VARCHAR(40) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'activa',
    creada_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    anulada_en TIMESTAMPTZ,
    anulada_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    motivo_anulacion TEXT,
    UNIQUE (sede_clinica_id, numero_historia),
    UNIQUE (sede_clinica_id, paciente_id),
    FOREIGN KEY (paciente_id, sede_clinica_id)
        REFERENCES pacientes(id, sede_clinica_id) ON DELETE RESTRICT,
    CONSTRAINT ck_hcd_estado CHECK (estado IN ('activa', 'anulada')),
    CONSTRAINT ck_hcd_anulacion CHECK (
        (estado = 'activa' AND anulada_en IS NULL AND anulada_por IS NULL AND motivo_anulacion IS NULL)
        OR (estado = 'anulada' AND anulada_en IS NOT NULL AND anulada_por IS NOT NULL
            AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '')
    )
);

CREATE TABLE turnos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sede_clinica_id UUID NOT NULL REFERENCES sedes_clinicas(id) ON DELETE RESTRICT,
    paciente_id UUID NOT NULL,
    medico_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    solicitado_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    tipo tipo_atencion NOT NULL DEFAULT 'consulta',
    motivo VARCHAR(250) NOT NULL,
    tutor_nombre VARCHAR(200),
    consultorio_nombre VARCHAR(100),
    cobertura_medica VARCHAR(150),
    fecha_hora_inicio TIMESTAMPTZ NOT NULL,
    fecha_hora_fin TIMESTAMPTZ NOT NULL,
    estado estado_turno NOT NULL DEFAULT 'solicitado',
    canal_solicitud VARCHAR(30) NOT NULL DEFAULT 'recepcion',
    cancelado_en TIMESTAMPTZ,
    cancelado_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    motivo_cancelacion TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (paciente_id, sede_clinica_id)
        REFERENCES pacientes(id, sede_clinica_id) ON DELETE RESTRICT,
    CONSTRAINT ck_turno_intervalo CHECK (fecha_hora_fin > fecha_hora_inicio),
    CONSTRAINT ck_turno_canal CHECK (canal_solicitud IN ('recepcion', 'app_tutor', 'telefono', 'derivacion')),
    CONSTRAINT ck_turno_cancelacion CHECK (
        (estado = 'cancelado' AND cancelado_en IS NOT NULL AND cancelado_por IS NOT NULL
            AND motivo_cancelacion IS NOT NULL AND btrim(motivo_cancelacion) <> '')
        OR (estado <> 'cancelado' AND cancelado_en IS NULL AND cancelado_por IS NULL AND motivo_cancelacion IS NULL)
    ),
    EXCLUDE USING gist (
        medico_usuario_id WITH =,
        tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)') WITH &&
    ) WHERE (estado IN ('solicitado', 'confirmado', 'arribado', 'en_atencion'))
);

CREATE INDEX ix_turnos_agenda ON turnos (sede_clinica_id, medico_usuario_id, fecha_hora_inicio);
CREATE INDEX ix_turnos_paciente ON turnos (paciente_id, fecha_hora_inicio DESC);

CREATE TABLE validaciones_cobertura (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cobertura_paciente_id UUID NOT NULL REFERENCES coberturas_paciente(id) ON DELETE RESTRICT,
    turno_id UUID REFERENCES turnos(id) ON DELETE RESTRICT,
    solicitada_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    solicitada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    respondida_en TIMESTAMPTZ,
    estado estado_cobertura NOT NULL,
    codigo_autorizacion VARCHAR(100),
    restricciones TEXT,
    solicitud JSONB NOT NULL DEFAULT '{}'::jsonb,
    respuesta JSONB,
    CONSTRAINT ck_validacion_respuesta CHECK (
        (respondida_en IS NULL AND respuesta IS NULL)
        OR (respondida_en IS NOT NULL AND respuesta IS NOT NULL)
    )
);

CREATE TABLE atenciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    historia_clinica_id UUID NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    turno_id UUID UNIQUE REFERENCES turnos(id) ON DELETE RESTRICT,
    tipo tipo_atencion NOT NULL,
    estado estado_atencion NOT NULL DEFAULT 'admitida',
    medico_usuario_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    admitida_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    admitida_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalizada_en TIMESTAMPTZ,
    anulada_en TIMESTAMPTZ,
    anulada_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    motivo_anulacion TEXT,
    UNIQUE (id, historia_clinica_id),
    CONSTRAINT ck_atencion_fechas CHECK (finalizada_en IS NULL OR finalizada_en >= admitida_en),
    CONSTRAINT ck_atencion_anulacion CHECK (
        (estado = 'anulada' AND anulada_en IS NOT NULL AND anulada_por IS NOT NULL
            AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '')
        OR (estado <> 'anulada' AND anulada_en IS NULL AND anulada_por IS NULL AND motivo_anulacion IS NULL)
    )
);

CREATE INDEX ix_atenciones_hcd_fecha ON atenciones (historia_clinica_id, admitida_en DESC);

CREATE TABLE registros_consulta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    historia_clinica_id UUID NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    atencion_id UUID NOT NULL UNIQUE,
    medico_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    motivo_consulta TEXT,
    diagnostico_resumen TEXT,
    prescripcion_resumen TEXT,
    plan_seguimiento TEXT,
    estado estado_registro_clinico NOT NULL DEFAULT 'borrador',
    version SMALLINT NOT NULL DEFAULT 1,
    hash_contenido VARCHAR(64),
    firma_digital TEXT,
    firmado_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    anulado_en TIMESTAMPTZ,
    anulado_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    motivo_anulacion TEXT,
    FOREIGN KEY (atencion_id, historia_clinica_id)
        REFERENCES atenciones(id, historia_clinica_id) ON DELETE RESTRICT,
    CONSTRAINT ck_registro_version CHECK (version > 0),
    CONSTRAINT ck_registro_hash CHECK (hash_contenido IS NULL OR hash_contenido ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_registro_firmado CHECK (
        estado = 'borrador'
        OR (
            motivo_consulta IS NOT NULL AND btrim(motivo_consulta) <> ''
            AND diagnostico_resumen IS NOT NULL AND btrim(diagnostico_resumen) <> ''
            AND prescripcion_resumen IS NOT NULL AND btrim(prescripcion_resumen) <> ''
            AND plan_seguimiento IS NOT NULL AND btrim(plan_seguimiento) <> ''
            AND hash_contenido IS NOT NULL
            AND firma_digital IS NOT NULL
            AND firmado_en IS NOT NULL
        )
    ),
    CONSTRAINT ck_registro_anulacion CHECK (
        (estado = 'anulado' AND anulado_en IS NOT NULL AND anulado_por IS NOT NULL
            AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '')
        OR (estado <> 'anulado' AND anulado_en IS NULL AND anulado_por IS NULL AND motivo_anulacion IS NULL)
    )
);

CREATE INDEX ix_registros_consulta_hcd ON registros_consulta (historia_clinica_id, firmado_en DESC);

CREATE TABLE diagnosticos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_consulta_id UUID NOT NULL REFERENCES registros_consulta(id) ON DELETE RESTRICT,
    codigo_cie10 VARCHAR(12),
    descripcion VARCHAR(300) NOT NULL,
    es_principal BOOLEAN NOT NULL DEFAULT FALSE,
    confirmado BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_diagnostico_principal
    ON diagnosticos (registro_consulta_id)
    WHERE es_principal;

-- -----------------------------------------------------------------------------
-- Vademecum, alergias y prescripciones (RF4, RF10, RNF9)
-- -----------------------------------------------------------------------------

CREATE TABLE medicamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_atc VARCHAR(20),
    principio_activo VARCHAR(180) NOT NULL,
    nombre_comercial VARCHAR(180),
    forma_farmaceutica VARCHAR(100) NOT NULL,
    concentracion VARCHAR(100) NOT NULL,
    contraindicaciones TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    version_catalogo VARCHAR(30) NOT NULL,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (principio_activo, forma_farmaceutica, concentracion, version_catalogo)
);

CREATE INDEX ix_medicamentos_principio_activo ON medicamentos (principio_activo);

CREATE TABLE interacciones_medicamentos (
    medicamento_a_id UUID NOT NULL REFERENCES medicamentos(id) ON DELETE RESTRICT,
    medicamento_b_id UUID NOT NULL REFERENCES medicamentos(id) ON DELETE RESTRICT,
    severidad prioridad_alerta NOT NULL,
    descripcion TEXT NOT NULL,
    recomendacion TEXT NOT NULL,
    PRIMARY KEY (medicamento_a_id, medicamento_b_id),
    CONSTRAINT ck_interaccion_orden CHECK (medicamento_a_id < medicamento_b_id)
);

CREATE TABLE alergias_paciente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    historia_clinica_id UUID NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    sustancia VARCHAR(180) NOT NULL,
    reaccion TEXT,
    severidad VARCHAR(20) NOT NULL,
    registrada_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    registrada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    anulada_en TIMESTAMPTZ,
    motivo_anulacion TEXT,
    CONSTRAINT ck_alergia_severidad CHECK (severidad IN ('leve', 'moderada', 'grave')),
    CONSTRAINT ck_alergia_anulacion CHECK (
        (anulada_en IS NULL AND motivo_anulacion IS NULL)
        OR (anulada_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '')
    )
);

CREATE TABLE prescripciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_consulta_id UUID NOT NULL REFERENCES registros_consulta(id) ON DELETE RESTRICT,
    medico_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    estado VARCHAR(20) NOT NULL DEFAULT 'activa',
    firma_digital TEXT,
    hash_contenido VARCHAR(64),
    emitida_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    valida_hasta DATE,
    anulada_en TIMESTAMPTZ,
    motivo_anulacion TEXT,
    CONSTRAINT ck_prescripcion_estado CHECK (estado IN ('activa', 'completada', 'anulada')),
    CONSTRAINT ck_prescripcion_hash CHECK (hash_contenido IS NULL OR hash_contenido ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_prescripcion_anulacion CHECK (
        (estado = 'anulada' AND anulada_en IS NOT NULL
            AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '')
        OR (estado <> 'anulada' AND anulada_en IS NULL AND motivo_anulacion IS NULL)
    )
);

CREATE TABLE items_prescripcion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescripcion_id UUID NOT NULL REFERENCES prescripciones(id) ON DELETE RESTRICT,
    medicamento_id UUID NOT NULL REFERENCES medicamentos(id) ON DELETE RESTRICT,
    dosis NUMERIC(10,3) NOT NULL,
    unidad_dosis VARCHAR(30) NOT NULL,
    via_administracion VARCHAR(50) NOT NULL,
    frecuencia_horas NUMERIC(6,2) NOT NULL,
    duracion_dias SMALLINT NOT NULL,
    indicaciones TEXT,
    CONSTRAINT ck_item_dosis CHECK (dosis > 0),
    CONSTRAINT ck_item_frecuencia CHECK (frecuencia_horas > 0),
    CONSTRAINT ck_item_duracion CHECK (duracion_dias > 0)
);

-- -----------------------------------------------------------------------------
-- Metricas, curvas de crecimiento y vacunacion (RF4, RF7)
-- -----------------------------------------------------------------------------

CREATE TABLE signos_vitales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    historia_clinica_id UUID NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    atencion_id UUID REFERENCES atenciones(id) ON DELETE RESTRICT,
    registrado_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    registrado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    edad_dias INTEGER NOT NULL,
    peso_kg NUMERIC(6,3),
    talla_cm NUMERIC(6,2),
    perimetro_cefalico_cm NUMERIC(5,2),
    temperatura_c NUMERIC(4,2),
    frecuencia_cardiaca_lpm SMALLINT,
    saturacion_oxigeno_pct NUMERIC(5,2),
    frecuencia_respiratoria_rpm SMALLINT,
    presion_sistolica_mmhg SMALLINT,
    presion_diastolica_mmhg SMALLINT,
    observaciones TEXT,
    anulado_en TIMESTAMPTZ,
    anulado_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    motivo_anulacion TEXT,
    CONSTRAINT ck_signos_al_menos_un_valor CHECK (num_nonnulls(
        peso_kg, talla_cm, perimetro_cefalico_cm, temperatura_c,
        frecuencia_cardiaca_lpm, saturacion_oxigeno_pct,
        frecuencia_respiratoria_rpm, presion_sistolica_mmhg,
        presion_diastolica_mmhg
    ) >= 1),
    CONSTRAINT ck_signos_edad CHECK (edad_dias >= 0),
    CONSTRAINT ck_signos_peso CHECK (peso_kg IS NULL OR peso_kg > 0),
    CONSTRAINT ck_signos_talla CHECK (talla_cm IS NULL OR talla_cm > 0),
    CONSTRAINT ck_signos_pc CHECK (perimetro_cefalico_cm IS NULL OR perimetro_cefalico_cm > 0),
    CONSTRAINT ck_signos_temperatura CHECK (temperatura_c IS NULL OR temperatura_c BETWEEN 25 AND 45),
    CONSTRAINT ck_signos_fc CHECK (frecuencia_cardiaca_lpm IS NULL OR frecuencia_cardiaca_lpm BETWEEN 20 AND 300),
    CONSTRAINT ck_signos_spo2 CHECK (saturacion_oxigeno_pct IS NULL OR saturacion_oxigeno_pct BETWEEN 0 AND 100),
    CONSTRAINT ck_signos_fr CHECK (frecuencia_respiratoria_rpm IS NULL OR frecuencia_respiratoria_rpm BETWEEN 5 AND 150),
    CONSTRAINT ck_signos_pa CHECK (
        (presion_sistolica_mmhg IS NULL AND presion_diastolica_mmhg IS NULL)
        OR (
            presion_sistolica_mmhg IS NOT NULL
            AND presion_diastolica_mmhg IS NOT NULL
            AND presion_sistolica_mmhg > presion_diastolica_mmhg
        )
    ),
    CONSTRAINT ck_signos_anulacion CHECK (
        (anulado_en IS NULL AND anulado_por IS NULL AND motivo_anulacion IS NULL)
        OR (anulado_en IS NOT NULL AND anulado_por IS NOT NULL
            AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '')
    )
);

CREATE INDEX ix_signos_vitales_hcd_fecha ON signos_vitales (historia_clinica_id, registrado_en DESC);

CREATE TABLE fuentes_referencia_clinica (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(30) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    version VARCHAR(40) NOT NULL,
    fecha_publicacion DATE,
    url_fuente TEXT,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (codigo, version)
);

CREATE TABLE valores_referencia_crecimiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fuente_id UUID NOT NULL REFERENCES fuentes_referencia_clinica(id) ON DELETE RESTRICT,
    sexo sexo_biologico NOT NULL,
    metrica metrica_crecimiento NOT NULL,
    edad_dias INTEGER NOT NULL,
    percentil SMALLINT NOT NULL,
    valor NUMERIC(8,3) NOT NULL,
    UNIQUE (fuente_id, sexo, metrica, edad_dias, percentil),
    CONSTRAINT ck_referencia_edad CHECK (edad_dias >= 0),
    CONSTRAINT ck_referencia_percentil CHECK (percentil IN (3, 10, 25, 50, 75, 90, 97)),
    CONSTRAINT ck_referencia_valor CHECK (valor > 0)
);

CREATE INDEX ix_referencia_curva
    ON valores_referencia_crecimiento (fuente_id, sexo, metrica, edad_dias, percentil);

CREATE TABLE umbrales_clinicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fuente_id UUID REFERENCES fuentes_referencia_clinica(id) ON DELETE RESTRICT,
    codigo_metrica VARCHAR(50) NOT NULL,
    sexo sexo_biologico,
    edad_min_dias INTEGER NOT NULL,
    edad_max_dias INTEGER NOT NULL,
    advertencia_min NUMERIC(10,3),
    advertencia_max NUMERIC(10,3),
    critico_min NUMERIC(10,3),
    critico_max NUMERIC(10,3),
    unidad VARCHAR(30) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_umbral_edad CHECK (edad_min_dias >= 0 AND edad_max_dias >= edad_min_dias),
    CONSTRAINT ck_umbral_limites CHECK (
        num_nonnulls(advertencia_min, advertencia_max, critico_min, critico_max) >= 1
    )
);

CREATE INDEX ix_umbrales_busqueda ON umbrales_clinicos (codigo_metrica, edad_min_dias, edad_max_dias) WHERE activo;

CREATE TABLE vacunas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    activa BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE reglas_esquema_vacunacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fuente_id UUID NOT NULL REFERENCES fuentes_referencia_clinica(id) ON DELETE RESTRICT,
    vacuna_id UUID NOT NULL REFERENCES vacunas(id) ON DELETE RESTRICT,
    numero_dosis SMALLINT NOT NULL,
    edad_objetivo_dias INTEGER NOT NULL,
    tolerancia_dias INTEGER NOT NULL DEFAULT 30,
    obligatoria BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (fuente_id, vacuna_id, numero_dosis),
    CONSTRAINT ck_vacuna_dosis CHECK (numero_dosis > 0),
    CONSTRAINT ck_vacuna_edad CHECK (edad_objetivo_dias >= 0 AND tolerancia_dias >= 0)
);

CREATE TABLE vacunaciones_paciente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    historia_clinica_id UUID NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    vacuna_id UUID NOT NULL REFERENCES vacunas(id) ON DELETE RESTRICT,
    numero_dosis SMALLINT NOT NULL,
    aplicada_en DATE NOT NULL,
    lote VARCHAR(80),
    institucion VARCHAR(180),
    registrada_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    comprobante_url TEXT,
    anulada_en TIMESTAMPTZ,
    motivo_anulacion TEXT,
    UNIQUE (historia_clinica_id, vacuna_id, numero_dosis),
    CONSTRAINT ck_vacunacion_dosis CHECK (numero_dosis > 0),
    CONSTRAINT ck_vacunacion_fecha CHECK (aplicada_en <= CURRENT_DATE),
    CONSTRAINT ck_vacunacion_anulacion CHECK (
        (anulada_en IS NULL AND motivo_anulacion IS NULL)
        OR (anulada_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '')
    )
);

-- -----------------------------------------------------------------------------
-- Seguimiento del tutor y motor de alertas (RF4, RF6)
-- -----------------------------------------------------------------------------

CREATE TABLE catalogo_sintomas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(40) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    icono VARCHAR(80) NOT NULL,
    requiere_detalle BOOLEAN NOT NULL DEFAULT FALSE,
    es_critico_por_defecto BOOLEAN NOT NULL DEFAULT FALSE,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE reportes_sintomas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    historia_clinica_id UUID NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    tutor_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    periodo_desde TIMESTAMPTZ NOT NULL,
    periodo_hasta TIMESTAMPTZ,
    notas TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    revisado_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    revisado_en TIMESTAMPTZ,
    anulado_en TIMESTAMPTZ,
    motivo_anulacion TEXT,
    CONSTRAINT ck_reporte_periodo CHECK (periodo_hasta IS NULL OR periodo_hasta >= periodo_desde),
    CONSTRAINT ck_reporte_revision CHECK (
        (revisado_por IS NULL AND revisado_en IS NULL)
        OR (revisado_por IS NOT NULL AND revisado_en IS NOT NULL)
    ),
    CONSTRAINT ck_reporte_anulacion CHECK (
        (anulado_en IS NULL AND motivo_anulacion IS NULL)
        OR (anulado_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '')
    )
);

CREATE TABLE reporte_sintoma_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporte_sintomas_id UUID NOT NULL REFERENCES reportes_sintomas(id) ON DELETE RESTRICT,
    sintoma_id UUID NOT NULL REFERENCES catalogo_sintomas(id) ON DELETE RESTRICT,
    observado_en TIMESTAMPTZ NOT NULL,
    intensidad SMALLINT,
    temperatura_c NUMERIC(4,2),
    detalle TEXT,
    marcado_critico BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT ck_sintoma_intensidad CHECK (intensidad IS NULL OR intensidad BETWEEN 1 AND 5),
    CONSTRAINT ck_sintoma_temperatura CHECK (temperatura_c IS NULL OR temperatura_c BETWEEN 25 AND 45)
);

CREATE TABLE alertas_medicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    historia_clinica_id UUID NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    origen origen_alerta NOT NULL,
    prioridad prioridad_alerta NOT NULL,
    estado estado_alerta NOT NULL DEFAULT 'activa',
    codigo VARCHAR(60) NOT NULL,
    titulo VARCHAR(180) NOT NULL,
    descripcion TEXT NOT NULL,
    metrica_codigo VARCHAR(50),
    valor_observado NUMERIC(12,3),
    umbral_referencia VARCHAR(150),
    signo_vital_id UUID REFERENCES signos_vitales(id) ON DELETE RESTRICT,
    prescripcion_id UUID REFERENCES prescripciones(id) ON DELETE RESTRICT,
    reporte_sintoma_item_id UUID REFERENCES reporte_sintoma_items(id) ON DELETE RESTRICT,
    regla_vacunacion_id UUID REFERENCES reglas_esquema_vacunacion(id) ON DELETE RESTRICT,
    asignada_a UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    generada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmada_en TIMESTAMPTZ,
    confirmada_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    resuelta_en TIMESTAMPTZ,
    resuelta_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    resolucion TEXT,
    nivel_escalamiento SMALLINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_alerta_origen CHECK (
        (origen IN ('signo_vital', 'metrica_crecimiento') AND signo_vital_id IS NOT NULL
            AND prescripcion_id IS NULL AND reporte_sintoma_item_id IS NULL AND regla_vacunacion_id IS NULL)
        OR (origen = 'interaccion_medicamentosa' AND prescripcion_id IS NOT NULL
            AND signo_vital_id IS NULL AND reporte_sintoma_item_id IS NULL AND regla_vacunacion_id IS NULL)
        OR (origen = 'sintoma_critico' AND reporte_sintoma_item_id IS NOT NULL
            AND signo_vital_id IS NULL AND prescripcion_id IS NULL AND regla_vacunacion_id IS NULL)
        OR (origen = 'vacuna_vencida' AND regla_vacunacion_id IS NOT NULL
            AND signo_vital_id IS NULL AND prescripcion_id IS NULL AND reporte_sintoma_item_id IS NULL)
        OR (origen = 'manual' AND signo_vital_id IS NULL AND prescripcion_id IS NULL
            AND reporte_sintoma_item_id IS NULL AND regla_vacunacion_id IS NULL)
    ),
    CONSTRAINT ck_alerta_confirmacion CHECK (
        (confirmada_en IS NULL AND confirmada_por IS NULL)
        OR (confirmada_en IS NOT NULL AND confirmada_por IS NOT NULL)
    ),
    CONSTRAINT ck_alerta_resolucion CHECK (
        (estado = 'resuelta' AND resuelta_en IS NOT NULL AND resuelta_por IS NOT NULL
            AND resolucion IS NOT NULL AND btrim(resolucion) <> '')
        OR (estado <> 'resuelta' AND resuelta_en IS NULL AND resuelta_por IS NULL AND resolucion IS NULL)
    ),
    CONSTRAINT ck_alerta_escalamiento CHECK (nivel_escalamiento >= 0)
);

CREATE INDEX ix_alertas_panel_medico
    ON alertas_medicas (asignada_a, prioridad, generada_en DESC)
    WHERE estado = 'activa';
CREATE INDEX ix_alertas_hcd ON alertas_medicas (historia_clinica_id, generada_en DESC);

CREATE TABLE eventos_alerta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alerta_id UUID NOT NULL REFERENCES alertas_medicas(id) ON DELETE RESTRICT,
    tipo_evento VARCHAR(30) NOT NULL,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    detalle TEXT,
    ocurrido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_evento_alerta_tipo CHECK (
        tipo_evento IN ('generada', 'mostrada', 'confirmada', 'escalada', 'resuelta', 'anulada')
    )
);

-- -----------------------------------------------------------------------------
-- Laboratorios e interoperabilidad HL7 (RF3)
-- -----------------------------------------------------------------------------

CREATE TABLE organizaciones_laboratorio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(40) NOT NULL UNIQUE,
    nombre VARCHAR(180) NOT NULL,
    oid_hl7 VARCHAR(120),
    endpoint_hl7 TEXT,
    activa BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE ordenes_laboratorio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    historia_clinica_id UUID NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    atencion_id UUID REFERENCES atenciones(id) ON DELETE RESTRICT,
    laboratorio_id UUID REFERENCES organizaciones_laboratorio(id) ON DELETE RESTRICT,
    medico_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    codigo_orden VARCHAR(80) NOT NULL UNIQUE,
    detalle JSONB NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'creada',
    solicitada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    completada_en TIMESTAMPTZ,
    CONSTRAINT ck_orden_estado CHECK (estado IN ('creada', 'enviada', 'aceptada', 'completada', 'cancelada')),
    CONSTRAINT ck_orden_completada CHECK (
        (estado = 'completada' AND completada_en IS NOT NULL)
        OR (estado <> 'completada' AND completada_en IS NULL)
    )
);

CREATE TABLE mensajes_hl7 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laboratorio_id UUID REFERENCES organizaciones_laboratorio(id) ON DELETE RESTRICT,
    historia_clinica_id UUID REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    orden_laboratorio_id UUID REFERENCES ordenes_laboratorio(id) ON DELETE RESTRICT,
    direccion direccion_hl7 NOT NULL,
    tipo_mensaje VARCHAR(20) NOT NULL,
    version_hl7 VARCHAR(20) NOT NULL,
    control_id VARCHAR(100) NOT NULL,
    estado estado_procesamiento_hl7 NOT NULL DEFAULT 'recibido',
    mensaje_raw TEXT NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    recibido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    procesado_en TIMESTAMPTZ,
    error_detalle TEXT,
    UNIQUE (laboratorio_id, direccion, control_id),
    CONSTRAINT ck_hl7_checksum CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_hl7_procesado CHECK (
        (estado = 'procesado' AND procesado_en IS NOT NULL AND error_detalle IS NULL)
        OR (estado = 'rechazado' AND procesado_en IS NOT NULL
            AND error_detalle IS NOT NULL AND btrim(error_detalle) <> '')
        OR (estado IN ('recibido', 'validado') AND procesado_en IS NULL)
    )
);

CREATE TABLE estudios_externos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    historia_clinica_id UUID NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    orden_laboratorio_id UUID REFERENCES ordenes_laboratorio(id) ON DELETE RESTRICT,
    laboratorio_id UUID REFERENCES organizaciones_laboratorio(id) ON DELETE RESTRICT,
    mensaje_hl7_id UUID UNIQUE REFERENCES mensajes_hl7(id) ON DELETE RESTRICT,
    cargado_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    fuente fuente_estudio NOT NULL,
    tipo_estudio VARCHAR(120) NOT NULL,
    fecha_estudio DATE NOT NULL,
    archivo_url TEXT,
    mime_type VARCHAR(100),
    archivo_sha256 VARCHAR(64),
    resultado_estructurado JSONB,
    estado_validacion VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    validado_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    validado_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    anulado_en TIMESTAMPTZ,
    motivo_anulacion TEXT,
    CONSTRAINT ck_estudio_fuente CHECK (
        (fuente = 'carga_manual' AND archivo_url IS NOT NULL AND cargado_por IS NOT NULL AND mensaje_hl7_id IS NULL)
        OR (fuente = 'hl7_oru_r01' AND mensaje_hl7_id IS NOT NULL)
        OR (fuente = 'api_externa')
    ),
    CONSTRAINT ck_estudio_hash CHECK (archivo_sha256 IS NULL OR archivo_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_estudio_validacion CHECK (
        estado_validacion IN ('pendiente', 'validado', 'rechazado')
        AND (
            (estado_validacion = 'pendiente' AND validado_por IS NULL AND validado_en IS NULL)
            OR (estado_validacion <> 'pendiente' AND validado_por IS NOT NULL AND validado_en IS NOT NULL)
        )
    ),
    CONSTRAINT ck_estudio_anulacion CHECK (
        (anulado_en IS NULL AND motivo_anulacion IS NULL)
        OR (anulado_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '')
    )
);

CREATE INDEX ix_estudios_hcd_fecha ON estudios_externos (historia_clinica_id, fecha_estudio DESC);

-- -----------------------------------------------------------------------------
-- Recordatorios, confirmacion de dosis y notificaciones (RF8)
-- -----------------------------------------------------------------------------

CREATE TABLE dispositivos_notificacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    plataforma VARCHAR(20) NOT NULL,
    token_push TEXT,
    telefono_sms VARCHAR(30),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    registrado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_uso_en TIMESTAMPTZ,
    CONSTRAINT ck_dispositivo_plataforma CHECK (plataforma IN ('android', 'ios', 'web', 'sms_only')),
    CONSTRAINT ck_dispositivo_destino CHECK (token_push IS NOT NULL OR telefono_sms IS NOT NULL)
);

CREATE UNIQUE INDEX uq_dispositivo_token_push
    ON dispositivos_notificacion (token_push)
    WHERE token_push IS NOT NULL;

CREATE TABLE cronogramas_medicacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_prescripcion_id UUID NOT NULL REFERENCES items_prescripcion(id) ON DELETE RESTRICT,
    tutor_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    inicia_en TIMESTAMPTZ NOT NULL,
    finaliza_en TIMESTAMPTZ NOT NULL,
    intervalo_horas NUMERIC(6,2) NOT NULL,
    anticipacion_minutos SMALLINT NOT NULL DEFAULT 30,
    canal_preferido canal_notificacion NOT NULL DEFAULT 'push',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_cronograma_intervalo CHECK (finaliza_en > inicia_en AND intervalo_horas > 0),
    CONSTRAINT ck_cronograma_anticipacion CHECK (anticipacion_minutos BETWEEN 0 AND 1440)
);

CREATE TABLE administraciones_medicacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cronograma_id UUID NOT NULL REFERENCES cronogramas_medicacion(id) ON DELETE RESTRICT,
    programada_para TIMESTAMPTZ NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    confirmada_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    confirmada_en TIMESTAMPTZ,
    notas TEXT,
    UNIQUE (cronograma_id, programada_para),
    CONSTRAINT ck_administracion_estado CHECK (estado IN ('pendiente', 'administrada', 'omitida', 'vencida')),
    CONSTRAINT ck_administracion_confirmacion CHECK (
        (estado IN ('administrada', 'omitida') AND confirmada_por IS NOT NULL AND confirmada_en IS NOT NULL)
        OR (estado IN ('pendiente', 'vencida') AND confirmada_por IS NULL AND confirmada_en IS NULL)
    )
);

CREATE TABLE notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destinatario_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    alerta_id UUID REFERENCES alertas_medicas(id) ON DELETE RESTRICT,
    cronograma_medicacion_id UUID REFERENCES cronogramas_medicacion(id) ON DELETE RESTRICT,
    turno_id UUID REFERENCES turnos(id) ON DELETE RESTRICT,
    tipo VARCHAR(40) NOT NULL,
    titulo VARCHAR(180) NOT NULL,
    cuerpo TEXT NOT NULL,
    prioridad prioridad_alerta,
    programada_para TIMESTAMPTZ NOT NULL,
    estado estado_notificacion NOT NULL DEFAULT 'pendiente',
    leida_en TIMESTAMPTZ,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_notificacion_origen CHECK (
        num_nonnulls(alerta_id, cronograma_medicacion_id, turno_id) <= 1
    ),
    CONSTRAINT ck_notificacion_leida CHECK (
        (estado = 'leida' AND leida_en IS NOT NULL)
        OR (estado <> 'leida' AND leida_en IS NULL)
    )
);

CREATE INDEX ix_notificaciones_destinatario
    ON notificaciones (destinatario_usuario_id, estado, programada_para DESC);

CREATE TABLE entregas_notificacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notificacion_id UUID NOT NULL REFERENCES notificaciones(id) ON DELETE RESTRICT,
    canal canal_notificacion NOT NULL,
    dispositivo_id UUID REFERENCES dispositivos_notificacion(id) ON DELETE RESTRICT,
    proveedor VARCHAR(60),
    proveedor_mensaje_id VARCHAR(150),
    estado estado_notificacion NOT NULL,
    intento SMALLINT NOT NULL DEFAULT 1,
    enviado_en TIMESTAMPTZ,
    entregado_en TIMESTAMPTZ,
    error_detalle TEXT,
    UNIQUE (notificacion_id, canal, intento),
    CONSTRAINT ck_entrega_intento CHECK (intento > 0),
    CONSTRAINT ck_entrega_fechas CHECK (
        entregado_en IS NULL OR (enviado_en IS NOT NULL AND entregado_en >= enviado_en)
    )
);

-- -----------------------------------------------------------------------------
-- Auditoria inmutable de la HCD (RF2, RNF6, RNF8)
-- -----------------------------------------------------------------------------

CREATE TABLE log_auditoria_hcd (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    historia_clinica_id UUID NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
    accion VARCHAR(30) NOT NULL,
    entidad VARCHAR(80) NOT NULL,
    entidad_id UUID,
    motivo TEXT NOT NULL,
    ip_origen INET,
    user_agent TEXT,
    datos_previos JSONB,
    datos_nuevos JSONB,
    hash_evento VARCHAR(64) NOT NULL,
    ocurrido_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT ck_auditoria_accion CHECK (
        accion IN ('acceso', 'alta', 'modificacion', 'firma', 'anulacion', 'exportacion')
    ),
    CONSTRAINT ck_auditoria_hash CHECK (hash_evento ~ '^[0-9a-f]{64}$')
);

CREATE INDEX ix_auditoria_hcd_fecha ON log_auditoria_hcd (historia_clinica_id, ocurrido_en DESC);
CREATE INDEX ix_auditoria_usuario_fecha ON log_auditoria_hcd (usuario_id, ocurrido_en DESC);

CREATE FUNCTION impedir_modificacion_log_auditoria()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'log_auditoria_hcd es inmutable: no se permite %', TG_OP;
END;
$$;

CREATE TRIGGER tr_log_auditoria_inmutable
BEFORE UPDATE OR DELETE ON log_auditoria_hcd
FOR EACH ROW EXECUTE FUNCTION impedir_modificacion_log_auditoria();

CREATE FUNCTION impedir_borrado_clinico()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% no admite DELETE; anule el registro y conserve su trazabilidad', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER tr_historias_no_delete BEFORE DELETE ON historias_clinicas
FOR EACH ROW EXECUTE FUNCTION impedir_borrado_clinico();
CREATE TRIGGER tr_atenciones_no_delete BEFORE DELETE ON atenciones
FOR EACH ROW EXECUTE FUNCTION impedir_borrado_clinico();
CREATE TRIGGER tr_registros_no_delete BEFORE DELETE ON registros_consulta
FOR EACH ROW EXECUTE FUNCTION impedir_borrado_clinico();
CREATE TRIGGER tr_diagnosticos_no_delete BEFORE DELETE ON diagnosticos
FOR EACH ROW EXECUTE FUNCTION impedir_borrado_clinico();
CREATE TRIGGER tr_prescripciones_no_delete BEFORE DELETE ON prescripciones
FOR EACH ROW EXECUTE FUNCTION impedir_borrado_clinico();
CREATE TRIGGER tr_items_prescripcion_no_delete BEFORE DELETE ON items_prescripcion
FOR EACH ROW EXECUTE FUNCTION impedir_borrado_clinico();
CREATE TRIGGER tr_signos_no_delete BEFORE DELETE ON signos_vitales
FOR EACH ROW EXECUTE FUNCTION impedir_borrado_clinico();
CREATE TRIGGER tr_vacunaciones_no_delete BEFORE DELETE ON vacunaciones_paciente
FOR EACH ROW EXECUTE FUNCTION impedir_borrado_clinico();
CREATE TRIGGER tr_reportes_no_delete BEFORE DELETE ON reportes_sintomas
FOR EACH ROW EXECUTE FUNCTION impedir_borrado_clinico();
CREATE TRIGGER tr_alertas_no_delete BEFORE DELETE ON alertas_medicas
FOR EACH ROW EXECUTE FUNCTION impedir_borrado_clinico();
CREATE TRIGGER tr_estudios_no_delete BEFORE DELETE ON estudios_externos
FOR EACH ROW EXECUTE FUNCTION impedir_borrado_clinico();

CREATE FUNCTION proteger_registro_clinico_firmado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.estado = 'anulado' THEN
        RAISE EXCEPTION 'Un registro clinico anulado es inmutable';
    END IF;

    IF OLD.estado = 'firmado' THEN
        IF NEW.estado <> 'anulado' THEN
            RAISE EXCEPTION 'Un registro clinico firmado solo puede ser anulado';
        END IF;

        IF (to_jsonb(NEW) - ARRAY['estado', 'actualizado_en', 'anulado_en', 'anulado_por', 'motivo_anulacion'])
           IS DISTINCT FROM
           (to_jsonb(OLD) - ARRAY['estado', 'actualizado_en', 'anulado_en', 'anulado_por', 'motivo_anulacion']) THEN
            RAISE EXCEPTION 'No se puede modificar el contenido de un registro clinico firmado';
        END IF;
    END IF;

    NEW.actualizado_en := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_registro_clinico_inmutable
BEFORE UPDATE ON registros_consulta
FOR EACH ROW EXECUTE FUNCTION proteger_registro_clinico_firmado();

CREATE FUNCTION completar_hash_log_auditoria()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.hash_evento := encode(
        digest(
            concat_ws('|', NEW.id::text, NEW.historia_clinica_id::text,
                coalesce(NEW.usuario_id::text, ''), NEW.accion, NEW.entidad,
                coalesce(NEW.entidad_id::text, ''), NEW.motivo,
                coalesce(NEW.datos_previos::text, ''), coalesce(NEW.datos_nuevos::text, ''),
                NEW.ocurrido_en::text),
            'sha256'
        ),
        'hex'
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_auditoria_hash
BEFORE INSERT ON log_auditoria_hcd
FOR EACH ROW EXECUTE FUNCTION completar_hash_log_auditoria();

CREATE FUNCTION auditar_escritura_hcd()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_historia_id UUID;
    v_usuario_id UUID;
    v_ip INET;
    v_motivo TEXT;
    v_accion VARCHAR(30);
BEGIN
    v_historia_id := CASE
        WHEN TG_TABLE_NAME = 'historias_clinicas' THEN NEW.id
        ELSE NEW.historia_clinica_id
    END;

    BEGIN
        v_usuario_id := NULLIF(current_setting('app.usuario_id', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_usuario_id := NULL;
    END;

    BEGIN
        v_ip := NULLIF(current_setting('app.ip_origen', true), '')::inet;
    EXCEPTION WHEN OTHERS THEN
        v_ip := NULL;
    END;

    v_motivo := coalesce(NULLIF(current_setting('app.motivo_auditoria', true), ''), 'Escritura clinica');
    v_accion := CASE
        WHEN TG_OP = 'INSERT' AND TG_TABLE_NAME = 'registros_consulta' AND NEW.estado = 'firmado' THEN 'firma'
        WHEN TG_OP = 'INSERT' THEN 'alta'
        WHEN NEW.estado::text = 'anulado' THEN 'anulacion'
        ELSE 'modificacion'
    END;

    INSERT INTO log_auditoria_hcd (
        historia_clinica_id, usuario_id, accion, entidad, entidad_id,
        motivo, ip_origen, datos_previos, datos_nuevos, hash_evento
    ) VALUES (
        v_historia_id, v_usuario_id, v_accion, TG_TABLE_NAME, NEW.id,
        v_motivo, v_ip,
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW), repeat('0', 64)
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_auditar_historia
AFTER INSERT OR UPDATE ON historias_clinicas
FOR EACH ROW EXECUTE FUNCTION auditar_escritura_hcd();

CREATE TRIGGER tr_auditar_registro_consulta
AFTER INSERT OR UPDATE ON registros_consulta
FOR EACH ROW EXECUTE FUNCTION auditar_escritura_hcd();

CREATE TRIGGER tr_auditar_signos_vitales
AFTER INSERT OR UPDATE ON signos_vitales
FOR EACH ROW EXECUTE FUNCTION auditar_escritura_hcd();

CREATE TRIGGER tr_auditar_alertas_medicas
AFTER INSERT OR UPDATE ON alertas_medicas
FOR EACH ROW EXECUTE FUNCTION auditar_escritura_hcd();

-- Los SELECT no disparan triggers en PostgreSQL. La API debe invocar esta funcion
-- dentro de la misma transaccion antes de devolver una HCD al cliente.
CREATE FUNCTION registrar_acceso_hcd(
    p_historia_clinica_id UUID,
    p_usuario_id UUID,
    p_motivo TEXT,
    p_ip_origen INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_id UUID := gen_random_uuid();
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'El motivo de acceso a la HCD es obligatorio';
    END IF;

    INSERT INTO log_auditoria_hcd (
        id, historia_clinica_id, usuario_id, accion, entidad, entidad_id,
        motivo, ip_origen, user_agent, hash_evento
    ) VALUES (
        v_id, p_historia_clinica_id, p_usuario_id, 'acceso',
        'historias_clinicas', p_historia_clinica_id,
        p_motivo, p_ip_origen, p_user_agent, repeat('0', 64)
    );

    RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Datos iniciales para desarrollo y demostración
-- -----------------------------------------------------------------------------

INSERT INTO sedes_clinicas (codigo, nombre, direccion, ciudad, provincia)
VALUES ('SIGP-CENTRAL', 'Centro Pediátrico SIGP', 'Av. de Mayo 1234', 'Ciudad Autónoma de Buenos Aires', 'Buenos Aires')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO roles (codigo, nombre, descripcion)
VALUES
    ('admin', 'Administrador', 'Gestión administrativa y de turnos'),
    ('enfermeria', 'Enfermería', 'Carga de triaje y signos vitales'),
    ('medico', 'Médico pediatra', 'Atención y registro de consultas')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO usuarios (email, password_hash, nombres, apellidos, estado)
VALUES
    ('admin@sigp.ar', crypt('admin123', gen_salt('bf')), 'Ana', 'García', 'activo'),
    ('enfermeria@sigp.ar', crypt('enfermeria123', gen_salt('bf')), 'Carlos', 'Méndez', 'activo'),
    ('medico@sigp.ar', crypt('medico123', gen_salt('bf')), 'Laura', 'Vidal', 'activo')
ON CONFLICT ((lower(email))) DO NOTHING;

INSERT INTO membresias_clinica (sede_clinica_id, usuario_id, cargo, inicio_en)
SELECT s.id, u.id, r.cargo, CURRENT_DATE
FROM sedes_clinicas s
CROSS JOIN (VALUES
    ('admin@sigp.ar', 'Administración'),
    ('enfermeria@sigp.ar', 'Enfermería'),
    ('medico@sigp.ar', 'Médico pediatra')
) AS r(email, cargo)
JOIN usuarios u ON lower(u.email) = r.email
WHERE s.codigo = 'SIGP-CENTRAL'
ON CONFLICT (sede_clinica_id, usuario_id) DO NOTHING;

INSERT INTO usuario_roles (usuario_id, rol_id, sede_clinica_id)
SELECT u.id, r.id, s.id
FROM usuarios u
JOIN roles r ON r.codigo = CASE u.email
    WHEN 'admin@sigp.ar' THEN 'admin'
    WHEN 'enfermeria@sigp.ar' THEN 'enfermeria'
    WHEN 'medico@sigp.ar' THEN 'medico'
END
CROSS JOIN sedes_clinicas s
WHERE s.codigo = 'SIGP-CENTRAL'
ON CONFLICT (usuario_id, rol_id, sede_clinica_id) DO NOTHING;

COMMIT;
