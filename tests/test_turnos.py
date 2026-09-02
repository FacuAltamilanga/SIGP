import unittest
from unittest.mock import patch
from uuid import UUID

from fastapi import HTTPException

import main


PACIENTE_ID = UUID("00000000-0000-0000-0000-000000000004")
TURNO_ID = UUID("00000000-0000-0000-0000-000000000005")


class FakeCursor:
    def __init__(self, rows):
        self.rows = iter(rows)
        self.executions = []

    def execute(self, query, params=None):
        self.executions.append((query, params))

    def fetchone(self):
        return next(self.rows)

    def close(self):
        pass


class FakeConnection:
    def __init__(self, rows):
        self.cursor_instance = FakeCursor(rows)
        self.committed = False
        self.rolled_back = False

    def cursor(self, **_kwargs):
        return self.cursor_instance

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        pass


class CrearTurnoTests(unittest.TestCase):
    def turno_nuevo(self, **changes):
        data = {
            "fecha": "2026-09-10",
            "hora": "10:30",
            "dni": "50123456",
            "nombre_paciente": "Juan",
            "apellido_paciente": "Pérez",
            "fecha_nacimiento": "2020-05-20",
            "sexo": "masculino",
            "motivo": "Control pediátrico",
        }
        data.update(changes)
        return main.NuevoTurno(**data)

    def test_crea_paciente_y_turno_si_el_dni_no_existe(self):
        connection = FakeConnection([None, {"id": PACIENTE_ID}, {"id": TURNO_ID}])
        with patch.object(main, "get_db_connection", return_value=connection), patch.object(main, "SIGP_SEDE_CLINICA_ID", "sede-demo"):
            response = main.crear_turno(self.turno_nuevo(), user={"user_id": "admin-demo"})

        self.assertTrue(connection.committed)
        self.assertEqual(response["turnos"][0]["id"], TURNO_ID)
        self.assertEqual(response["turnos"][0]["hora"], "10:30")
        statements = "\n".join(query for query, _params in connection.cursor_instance.executions)
        self.assertIn("INSERT INTO pacientes", statements)
        self.assertIn("INSERT INTO turnos", statements)

    def test_informa_los_datos_faltantes_de_un_paciente_nuevo(self):
        connection = FakeConnection([None])
        with patch.object(main, "get_db_connection", return_value=connection), patch.object(main, "SIGP_SEDE_CLINICA_ID", "sede-demo"):
            with self.assertRaises(HTTPException) as raised:
                main.crear_turno(self.turno_nuevo(apellido_paciente=None), user={"user_id": "admin-demo"})

        self.assertEqual(raised.exception.status_code, 422)
        self.assertTrue(connection.rolled_back)

    def test_acepta_datos_de_paciente_anidados(self):
        connection = FakeConnection([None, {"id": PACIENTE_ID}, {"id": TURNO_ID}])
        turno = main.NuevoTurno(
            fecha="2026-09-10",
            hora="11:00",
            paciente={
                "nombre": "Ana",
                "apellido": "Gómez",
                "dni": "50123457",
                "fecha_nacimiento": "2020-05-20",
                "sexo": "femenino",
            },
        )
        with patch.object(main, "get_db_connection", return_value=connection), patch.object(main, "SIGP_SEDE_CLINICA_ID", "sede-demo"):
            response = main.crear_turno(turno, user={"user_id": "admin-demo"})

        self.assertTrue(connection.committed)
        self.assertEqual(response["turnos"][0]["dni"], "50123457")


if __name__ == "__main__":
    unittest.main()
