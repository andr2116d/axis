from datetime import timedelta

import pytest

from axis.compartido.dominio.motores import Factor, Hallazgo, ResultadoMotor, Severidad
from axis.documentos.adaptadores.salida.falsos import RelojFijo
from axis.expediente.adaptadores.salida.falsos import (
    DocumentosFijos,
    EvaluadorPorFuncion,
    RepositorioExpedientesEnMemoria,
)
from axis.expediente.aplicacion.casos_de_uso.evaluar_expediente import EvaluarExpediente
from axis.expediente.aplicacion.casos_de_uso.gestionar import (
    AdjuntarDocumento,
    CrearExpediente,
    ObtenerExpediente,
)
from axis.expediente.aplicacion.dto import (
    OrdenCrearExpediente,
    ResultadoDeMotores,
    ResumenDocumento,
)
from axis.expediente.dominio.entidades import EstadoSeccion
from axis.expediente.dominio.errores import (
    DocumentoNoEncontrado,
    DocumentoYaAdjunto,
    ExpedienteSinDocumentos,
)


class Reloj(RelojFijo):
    def ahora(self):
        self.momento += timedelta(minutes=1)
        return self.momento


DOCUMENTOS = {
    "exp-v1": ResumenDocumento(
        "exp-v1",
        "expediente.pdf",
        "expediente_tecnico",
        ("memoria_descriptiva", "metrados", "presupuesto"),
    ),
    "metrados-v2": ResumenDocumento(
        "metrados-v2", "metrados_corregidos.pdf", "metrados", ("metrados",)
    ),
}


def hallazgo(seccion, documento, severidad=Severidad.ROJO):
    return Hallazgo(
        "precio_atipico",
        "1",
        severidad,
        "t",
        "explicación",
        0.8,
        (Factor("a", "b"),),
        id_documento=documento,
        seccion=seccion,
    )


def motores_de_prueba(expediente, secciones, previos):
    """Un motor que lee el presupuesto y siempre encuentra algo en él."""
    vigente = {s.etiqueta: s.id_documento for s in secciones}
    firma = f"presupuesto={vigente.get('presupuesto')}"
    if "precio_atipico" in previos and previos["precio_atipico"].firma == firma:
        resultado = previos["precio_atipico"]
    else:
        resultado = ResultadoMotor(
            "precio_atipico", "1", firma, (hallazgo("presupuesto", vigente["presupuesto"]),)
        )
    return ResultadoDeMotores((resultado,), (), (), frozenset({"presupuesto"}), 5)


@pytest.fixture
def sistema():
    repositorio = RepositorioExpedientesEnMemoria()
    reloj = Reloj()
    evaluador = EvaluadorPorFuncion(motores_de_prueba)
    return {
        "crear": CrearExpediente(repositorio=repositorio, reloj=reloj),
        "adjuntar": AdjuntarDocumento(
            repositorio=repositorio, documentos=DocumentosFijos(DOCUMENTOS), reloj=reloj
        ),
        "evaluar": EvaluarExpediente(repositorio=repositorio, evaluador=evaluador, reloj=reloj),
        "obtener": ObtenerExpediente(repositorio=repositorio),
        "evaluador": evaluador,
    }


async def test_las_partes_del_documento_pasan_a_ser_secciones(sistema):
    expediente = await sistema["crear"].ejecutar(OrdenCrearExpediente("Pistas calle Los Incas"))

    expediente = await sistema["adjuntar"].ejecutar(expediente.id, "exp-v1")

    assert [s.etiqueta for s in expediente.secciones_vigentes()] == [
        "memoria_descriptiva",
        "metrados",
        "presupuesto",
    ]


async def test_subir_solo_metrados_reemplaza_esa_seccion_y_deja_las_demas(sistema):
    expediente = await sistema["crear"].ejecutar(OrdenCrearExpediente("Pistas"))
    await sistema["adjuntar"].ejecutar(expediente.id, "exp-v1")

    expediente = await sistema["adjuntar"].ejecutar(expediente.id, "metrados-v2")

    secciones = {s.etiqueta: s for s in expediente.secciones_vigentes()}
    assert (secciones["metrados"].id_documento, secciones["metrados"].version) == ("metrados-v2", 2)
    assert secciones["presupuesto"].id_documento == "exp-v1"
    assert secciones["memoria_descriptiva"].version == 1


async def test_el_semaforo_es_por_seccion_y_lo_no_revisado_se_dice(sistema):
    expediente = await sistema["crear"].ejecutar(OrdenCrearExpediente("Pistas"))
    await sistema["adjuntar"].ejecutar(expediente.id, "exp-v1")

    vista = await sistema["evaluar"].ejecutar(expediente.id)

    estados = {
        s.etiqueta: vista.ultima_evaluacion.estado_de(s)
        for s in vista.expediente.secciones_vigentes()
    }
    assert estados == {
        "presupuesto": EstadoSeccion.ROJO,
        "metrados": EstadoSeccion.SIN_REVISAR,
        "memoria_descriptiva": EstadoSeccion.SIN_REVISAR,
    }
    assert vista.ultima_evaluacion.numero == 1


async def test_al_reevaluar_se_pasan_los_resultados_anteriores(sistema):
    expediente = await sistema["crear"].ejecutar(OrdenCrearExpediente("Pistas"))
    await sistema["adjuntar"].ejecutar(expediente.id, "exp-v1")
    await sistema["evaluar"].ejecutar(expediente.id)
    await sistema["adjuntar"].ejecutar(expediente.id, "metrados-v2")

    vista = await sistema["evaluar"].ejecutar(expediente.id)

    _, previos = sistema["evaluador"].llamadas[-1]
    assert list(previos) == ["precio_atipico"]
    assert vista.ultima_evaluacion.numero == 2
    assert (await sistema["obtener"].ejecutar(expediente.id)).ultima_evaluacion.numero == 2


async def test_errores_de_uso(sistema):
    expediente = await sistema["crear"].ejecutar(OrdenCrearExpediente("Pistas"))
    with pytest.raises(ExpedienteSinDocumentos):
        await sistema["evaluar"].ejecutar(expediente.id)
    with pytest.raises(DocumentoNoEncontrado):
        await sistema["adjuntar"].ejecutar(expediente.id, "no-existe")
    await sistema["adjuntar"].ejecutar(expediente.id, "exp-v1")
    with pytest.raises(DocumentoYaAdjunto):
        await sistema["adjuntar"].ejecutar(expediente.id, "exp-v1")
