import asyncio
from dataclasses import replace
from decimal import Decimal

from axis.compartido.dominio.motores import (
    EntradaMotor,
    Factor,
    FichaMotor,
    Hallazgo,
    PartidaUbicada,
    Severidad,
)
from axis.compartido.dominio.partidas import Partida
from axis.compartido.dominio.valores import Fase, Semaforo
from axis.orquestador.aplicacion.casos_de_uso.evaluar import (
    EvaluarDocumento,
    EvaluarEntrada,
    OrdenEvaluar,
)
from axis.orquestador.dominio.plan import OrigenActivacion, planificar_por_ficha


def ficha(id_motor, partes=("presupuesto",), fases=(Fase.EXPEDIENTE,), tipologias=None):
    return FichaMotor(
        id_motor,
        "1",
        id_motor.title(),
        "algo",
        frozenset(fases),
        frozenset(partes),
        frozenset(tipologias) if tipologias else None,
    )


def entrada(partes=("presupuesto",), fase=Fase.EXPEDIENTE, tipologia="pistas_veredas"):
    partida = Partida(1, "01.01", "TRAZO", "m2", (), Decimal(1), Decimal(1), Decimal(1), True)
    return EntradaMotor(
        "doc-1", fase, tipologia, frozenset(partes), (PartidaUbicada(partida, "presupuesto"),)
    )


class MotorDePrueba:
    def __init__(self, f, hallazgos=(), demora=0.0, error=None):
        self.ficha, self._hallazgos, self._demora, self._error = f, hallazgos, demora, error
        self.llamadas = 0

    async def evaluar(self, entrada_):
        self.llamadas += 1
        await asyncio.sleep(self._demora)
        if self._error:
            raise self._error
        return self._hallazgos


class Catalogo:
    def __init__(self, *motores):
        self._motores = motores

    def motores(self):
        return self._motores


class Fuente:
    def __init__(self, e):
        self._e = e

    async def de_documento(self, id_documento, fase, tipologia):
        return self._e


def hallazgo(id_motor, severidad=Severidad.AMBAR):
    return Hallazgo(id_motor, "1", severidad, "t", "explicación", 0.7, (Factor("a", "b"),))


def test_se_prende_lo_que_tiene_lo_que_necesita_y_se_dice_que_falta_para_el_resto():
    fichas = [
        ficha("precios"),
        ficha("planos_vs_metrados", partes=("planos", "metrados")),
        ficha("solo_saneamiento", tipologias=("agua_saneamiento",)),
        ficha("valorizaciones", fases=(Fase.EJECUCION,)),
    ]

    plan = planificar_por_ficha(fichas, entrada())

    assert plan.motores == ("precios",)
    assert plan.activaciones[0].origen is OrigenActivacion.FICHA
    razones = {o.id_motor: o for o in plan.omisiones}
    assert razones["planos_vs_metrados"].faltan == ("metrados", "planos")
    assert razones["planos_vs_metrados"].razon == "Falta subir: metrados, planos."
    assert "tipología" in razones["solo_saneamiento"].razon
    assert "ejecucion" in razones["valorizaciones"].razon


async def test_corre_los_motores_y_un_motor_caido_no_tumba_a_los_demas():
    bueno = MotorDePrueba(ficha("bueno"), (hallazgo("bueno", Severidad.ROJO),))
    roto = MotorDePrueba(ficha("roto"), error=RuntimeError("se cayó"))
    lento = MotorDePrueba(ficha("lento"), demora=5)
    caso = EvaluarDocumento(
        catalogo=Catalogo(bueno, roto, lento), fuente=Fuente(entrada()), limite_segundos=0.2
    )

    evaluacion = await caso.ejecutar(OrdenEvaluar("doc-1"))

    assert [h.id_motor for h in evaluacion.hallazgos] == ["bueno"]
    fallas = {f.id_motor: f.razon for f in evaluacion.fallas}
    assert "se cayó" in fallas["roto"]
    assert "tardó" in fallas["lento"]
    assert evaluacion.semaforo is Semaforo.ROJO


async def test_los_motores_corren_en_paralelo():
    motores = [MotorDePrueba(ficha(f"m{i}"), demora=0.2) for i in range(5)]
    caso = EvaluarDocumento(
        catalogo=Catalogo(*motores), fuente=Fuente(entrada()), limite_segundos=2
    )

    evaluacion = await caso.ejecutar(OrdenEvaluar("doc-1"))

    assert evaluacion.duracion_ms < 600
    assert all(m.llamadas == 1 for m in motores)


async def test_sin_hallazgos_ni_fallas_el_semaforo_es_verde():
    caso = EvaluarDocumento(
        catalogo=Catalogo(MotorDePrueba(ficha("ok"))), fuente=Fuente(entrada()), limite_segundos=1
    )

    assert (await caso.ejecutar(OrdenEvaluar("doc-1"))).semaforo is Semaforo.VERDE


async def test_si_las_partes_que_lee_un_motor_no_cambiaron_se_reutiliza_su_resultado():
    precios = MotorDePrueba(ficha("precios", partes=("presupuesto",)), (hallazgo("precios"),))
    metrados = MotorDePrueba(ficha("metrados", partes=("metrados",)))
    caso = EvaluarEntrada(catalogo=Catalogo(precios, metrados), limite_segundos=1)
    base = replace(
        entrada(partes=("presupuesto", "metrados")),
        firmas={"presupuesto": "doc-a", "metrados": "doc-b"},
    )
    primera = await caso.ejecutar(base)
    previos = {r.id_motor: r for r in primera.resultados}

    # Se sube una versión nueva solo de los metrados.
    segunda = await caso.ejecutar(
        replace(base, firmas={"presupuesto": "doc-a", "metrados": "doc-c"}), previos
    )

    assert precios.llamadas == 1  # el presupuesto no cambió: no se volvió a correr
    assert metrados.llamadas == 2
    assert segunda.reutilizados == ("precios",)
    assert [h.id_motor for h in segunda.hallazgos] == ["precios"]
