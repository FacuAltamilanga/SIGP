-- SIGP - Datos iniciales para una base PostgreSQL ya existente
-- Ejecutar con: psql "$DATABASE_URL" -f migrations/001_seed_demo_data.sql
-- Este archivo no crea ni modifica tablas; solo agrega datos faltantes.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
SELECT s.id, u.id, datos.cargo, CURRENT_DATE
FROM sedes_clinicas AS s
CROSS JOIN (VALUES
    ('admin@sigp.ar', 'Administración'),
    ('enfermeria@sigp.ar', 'Enfermería'),
    ('medico@sigp.ar', 'Médico pediatra')
) AS datos(email, cargo)
JOIN usuarios AS u ON lower(u.email) = datos.email
WHERE s.codigo = 'SIGP-CENTRAL'
ON CONFLICT (sede_clinica_id, usuario_id) DO NOTHING;

INSERT INTO usuario_roles (usuario_id, rol_id, sede_clinica_id)
SELECT u.id, r.id, s.id
FROM usuarios AS u
JOIN roles AS r ON r.codigo = CASE u.email
    WHEN 'admin@sigp.ar' THEN 'admin'
    WHEN 'enfermeria@sigp.ar' THEN 'enfermeria'
    WHEN 'medico@sigp.ar' THEN 'medico'
END
CROSS JOIN sedes_clinicas AS s
WHERE s.codigo = 'SIGP-CENTRAL'
ON CONFLICT (usuario_id, rol_id, sede_clinica_id) DO NOTHING;

COMMIT;
