import unittest
from datetime import date, time
from unittest.mock import patch
from uuid import UUID

from fastapi import HTTPException

import main


SEDE_ID = UUID("00000000-0000-0000-0000-000000000001")
ADMIN_ID = UUID("00000000-0000-0000-0000-000000000002")
MEDICO_ID = UUID("00000000-0000-0000-0000-000000000003")
PACIENTE_ID = UUID("00000000-0000-0000-0000-000000000004")
TURNO_ID = UUID("00000000-0000-0000-0000-000000000005")


class FakeCursor:
    def __init__(self, rows):
        self.rows = iter(rows)
        self.executions = []
        self.closed = False

    def execute(self, query, params=None):
        self.executions.append((query, params))

    def fetchone(self):
        return next(self.rows)

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, rows):
        self.cursor_instance = FakeCursor(rows)
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def cursor(self, **_kwargs):
        return self.cursor_instance

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


class RegistrarTurnoTests(unittest.TestCase):
    def nuevo_turno(self):
        return main.NuevoTurnoRequest(
            fecha=date(2026, 9, 10),
            hora=time(10, 30),
            paciente=main.PacienteTurnoRequest(
                nombre="Juan",
                apellido="Pérez",
                dni="50123456",
                fecha_nacimiento=date(2020, 5, 20),
                sexo="masculino",
            ),
            motivo="Control pediátrico",
        )

    def test_registra_paciente_nuevo_y_turno(self):
        connection = FakeConnection([
            {"id": SEDE_ID, "zona_horaria": "America/Argentina/Buenos_Aires"},
            {"id": ADMIN_ID},
            {"id": MEDICO_ID},
            None,
            {"id": PACIENTE_ID},
            {"id": TURNO_ID},
        ])

        with (
            patch.object(main, "get_db_connection", return_value=connection),
            patch.object(main, "SIGP_SEDE_CLINICA_ID", None),
            patch.dict(main.SIGP_USER_IDS, {"admin": None, "enfermeria": None, "medico": None}),
        ):
            response = main.registrar_turno(
                self.nuevo_turno(),
                user={"role": "admin", "sub": "admin@sigp.ar", "user_id": None},
            )

        self.assertTrue(connection.committed)
        self.assertTrue(connection.closed)
        self.assertEqual(response["turnos"][0]["id"], TURNO_ID)
        self.assertEqual(response["turnos"][0]["hora"], "10:30")
        statements = "\n".join(query for query, _params in connection.cursor_instance.executions)
        self.assertIn("INSERT INTO pacientes", statements)
        self.assertIn("INSERT INTO turnos", statements)

    def test_rechaza_un_rol_no_administrativo(self):
        with self.assertRaises(HTTPException) as raised:
            main.registrar_turno(
                self.nuevo_turno(),
                user={"role": "medico", "sub": "medico@sigp.ar", "user_id": MEDICO_ID},
            )

        self.assertEqual(raised.exception.status_code, 403)

    def test_la_aplicacion_expone_post_turnos(self):
        methods = {
            method
            for route in main.app.routes
            if getattr(route, "path", None) == "/api/turnos"
            for method in getattr(route, "methods", set())
        }
        self.assertIn("POST", methods)
        self.assertIn("GET", methods)


if __name__ == "__main__":
    unittest.main()
