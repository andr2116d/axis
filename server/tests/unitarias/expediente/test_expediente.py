from datetime import timedelta

import pytest

from axis.compartido.dominio.motores import Factor, Hallazgo, ResultadoMotor, Severidad
from axis.compartido.dominio.valores import Semaforo
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
from axis.expediente.aplicacion.casos_de_uso.revisar_hallazgo import RevisarHallazgo
from axis.expediente.aplicacion.dto import (
    OrdenCrearExpediente,
    OrdenRevisarHallazgo,
    ResultadoDeMotores,
    ResumenDocumento,
)
from axis.expediente.dominio.entidades import EstadoSeccion
from axis.expediente.dominio.errores import (
    DocumentoNoEncontrado,
    DocumentoYaAdjunto,
    ExpedienteSinDocumentos,
    HallazgoNoEncontrado,
    RevisionInvalida,
)
from axis.expediente.dominio.revisiones import DecisionHallazgo


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
        "revisar": RevisarHallazgo(repositorio=repositorio, reloj=reloj),
        "evaluador": evaluador,
        "repositorio": repositorio,
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


# Revisión del evaluador sobre los hallazgos


async def evaluado(sistema):
    expediente = await sistema["crear"].ejecutar(OrdenCrearExpediente("Pistas"))
    await sistema["adjuntar"].ejecutar(expediente.id, "exp-v1")
    vista = await sistema["evaluar"].ejecutar(expediente.id)
    return expediente.id, vista.ultima_evaluacion.hallazgos[0]


def presupuesto(vista):
    seccion = next(s for s in vista.expediente.secciones_vigentes() if s.etiqueta == "presupuesto")
    return vista.ultima_evaluacion.estado_de(seccion, vista.cerrados)


def test_la_clave_no_cambia_con_la_version_ni_con_el_titulo():
    original = hallazgo("presupuesto", "doc-1")
    reentrenado = hallazgo("presupuesto", "doc-1", Severidad.AMBAR)
    otro_documento = hallazgo("presupuesto", "doc-2")

    assert original.clave == reentrenado.clave
    assert original.clave != otro_documento.clave


async def test_descartar_un_hallazgo_rojo_apaga_la_seccion(sistema):
    id_expediente, rojo = await evaluado(sistema)

    vista = await sistema["revisar"].ejecutar(
        OrdenRevisarHallazgo(
            id_expediente, rojo.clave, DecisionHallazgo.DESCARTADO, "el precio es de la zona"
        )
    )

    assert presupuesto(vista) == EstadoSeccion.VERDE
    assert vista.ultima_evaluacion.semaforo(vista.cerrados) == Semaforo.VERDE
    assert vista.revisiones[rojo.clave].hallazgo == rojo


async def test_confirmar_deja_la_seccion_en_rojo(sistema):
    id_expediente, rojo = await evaluado(sistema)

    vista = await sistema["revisar"].ejecutar(
        OrdenRevisarHallazgo(id_expediente, rojo.clave, DecisionHallazgo.CONFIRMADO)
    )

    assert presupuesto(vista) == EstadoSeccion.ROJO
    assert vista.revisiones[rojo.clave].motivo is None


async def test_vale_la_ultima_decision_y_se_guarda_el_historial(sistema):
    id_expediente, rojo = await evaluado(sistema)
    for decision, motivo in [
        (DecisionHallazgo.JUSTIFICADO, "obra en zona alejada"),
        (DecisionHallazgo.CONFIRMADO, None),
    ]:
        await sistema["revisar"].ejecutar(
            OrdenRevisarHallazgo(id_expediente, rojo.clave, decision, motivo)
        )

    vista = await sistema["obtener"].ejecutar(id_expediente)

    assert vista.revisiones[rojo.clave].decision == DecisionHallazgo.CONFIRMADO
    assert len(await sistema["repositorio"].revisiones(id_expediente)) == 2


async def test_la_decision_sigue_valiendo_al_reevaluar_si_el_documento_no_cambio(sistema):
    id_expediente, rojo = await evaluado(sistema)
    await sistema["revisar"].ejecutar(
        OrdenRevisarHallazgo(id_expediente, rojo.clave, DecisionHallazgo.JUSTIFICADO, "flete")
    )

    vista = await sistema["evaluar"].ejecutar(id_expediente)

    assert presupuesto(vista) == EstadoSeccion.VERDE


async def test_descartar_o_justificar_sin_motivo_no_se_acepta(sistema):
    id_expediente, rojo = await evaluado(sistema)

    with pytest.raises(RevisionInvalida):
        await sistema["revisar"].ejecutar(
            OrdenRevisarHallazgo(id_expediente, rojo.clave, DecisionHallazgo.DESCARTADO, "  ")
        )


async def test_no_se_revisa_un_hallazgo_que_no_esta_en_la_ultima_evaluacion(sistema):
    id_expediente, _ = await evaluado(sistema)

    with pytest.raises(HallazgoNoEncontrado):
        await sistema["revisar"].ejecutar(
            OrdenRevisarHallazgo(id_expediente, "no-existe", DecisionHallazgo.CONFIRMADO)
        )


async def test_el_historial_se_ordena_por_fecha_aunque_llegue_desordenado(sistema):
    id_expediente, rojo = await evaluado(sistema)
    reloj = sistema["revisar"]._reloj
    await sistema["revisar"].ejecutar(
        OrdenRevisarHallazgo(id_expediente, rojo.clave, DecisionHallazgo.CONFIRMADO)
    )
    reloj.momento -= timedelta(hours=1)  # una revisión registrada con hora anterior
    await sistema["revisar"].ejecutar(
        OrdenRevisarHallazgo(id_expediente, rojo.clave, DecisionHallazgo.DESCARTADO, "viejo")
    )

    vista = await sistema["obtener"].ejecutar(id_expediente)

    assert vista.revisiones[rojo.clave].decision == DecisionHallazgo.CONFIRMADO


async def test_si_ningun_motor_reviso_nada_no_hay_semaforo():
    repositorio = RepositorioExpedientesEnMemoria()
    reloj = Reloj()
    sin_motores = EvaluadorPorFuncion(lambda *_: ResultadoDeMotores((), (), (), frozenset(), 1))
    expediente = await CrearExpediente(repositorio=repositorio, reloj=reloj).ejecutar(
        OrdenCrearExpediente("Pistas")
    )
    await AdjuntarDocumento(
        repositorio=repositorio, documentos=DocumentosFijos(DOCUMENTOS), reloj=reloj
    ).ejecutar(expediente.id, "metrados-v2")

    vista = await EvaluarExpediente(
        repositorio=repositorio, evaluador=sin_motores, reloj=reloj
    ).ejecutar(expediente.id)

    assert vista.ultima_evaluacion.semaforo() is None
