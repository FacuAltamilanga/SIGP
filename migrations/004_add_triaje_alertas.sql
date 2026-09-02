-- Umbrales iniciales para detectar alertas de triaje. La aplicación consulta
-- siempre por edad_dias, por lo que estos valores pueden ampliarse por rango etario.
INSERT INTO umbrales_clinicos
    (codigo_metrica, edad_min_dias, edad_max_dias, advertencia_min, advertencia_max, critico_min, critico_max, unidad)
SELECT v.codigo_metrica, 0, 6574, v.advertencia_min, v.advertencia_max, v.critico_min, v.critico_max, v.unidad
FROM (VALUES
    ('temperatura_c', 35.5::numeric, 38.0::numeric, 35.0::numeric, 39.0::numeric, '°C'),
    ('frecuencia_cardiaca_lpm', 60::numeric, 160::numeric, 50::numeric, 200::numeric, 'lpm'),
    ('saturacion_oxigeno_pct', 92::numeric, NULL::numeric, 88::numeric, NULL::numeric, '%')
) AS v(codigo_metrica, advertencia_min, advertencia_max, critico_min, critico_max, unidad)
WHERE NOT EXISTS (
    SELECT 1 FROM umbrales_clinicos u
    WHERE u.codigo_metrica = v.codigo_metrica AND u.edad_min_dias = 0 AND u.edad_max_dias = 6574 AND u.activo
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_auditar_signos_vitales') THEN
        CREATE TRIGGER tr_auditar_signos_vitales
        AFTER INSERT OR UPDATE ON signos_vitales
        FOR EACH ROW EXECUTE FUNCTION auditar_escritura_hcd();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_auditar_alertas_medicas') THEN
        CREATE TRIGGER tr_auditar_alertas_medicas
        AFTER INSERT OR UPDATE ON alertas_medicas
        FOR EACH ROW EXECUTE FUNCTION auditar_escritura_hcd();
    END IF;
END $$;
