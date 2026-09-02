CREATE OR REPLACE FUNCTION auditar_escritura_hcd()
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
    v_historia_id := CASE WHEN TG_TABLE_NAME = 'historias_clinicas' THEN NEW.id ELSE NEW.historia_clinica_id END;
    BEGIN v_usuario_id := NULLIF(current_setting('app.usuario_id', true), '')::uuid; EXCEPTION WHEN OTHERS THEN v_usuario_id := NULL; END;
    BEGIN v_ip := NULLIF(current_setting('app.ip_origen', true), '')::inet; EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;
    v_motivo := coalesce(NULLIF(current_setting('app.motivo_auditoria', true), ''), 'Escritura clinica');
    v_accion := CASE WHEN TG_OP = 'INSERT' THEN 'alta' ELSE 'modificacion' END;
    IF TG_TABLE_NAME = 'registros_consulta' AND TG_OP = 'INSERT' AND NEW.estado = 'firmado' THEN
        v_accion := 'firma';
    ELSIF TG_TABLE_NAME IN ('historias_clinicas', 'registros_consulta', 'alertas_medicas')
          AND TG_OP = 'UPDATE' AND NEW.estado::text IN ('anulado', 'anulada') THEN
        v_accion := 'anulacion';
    END IF;
    INSERT INTO log_auditoria_hcd (historia_clinica_id, usuario_id, accion, entidad, entidad_id, motivo, ip_origen, datos_previos, datos_nuevos, hash_evento)
    VALUES (v_historia_id, v_usuario_id, v_accion, TG_TABLE_NAME, NEW.id, v_motivo, v_ip,
            CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW), repeat('0', 64));
    RETURN NEW;
END;
$$;
