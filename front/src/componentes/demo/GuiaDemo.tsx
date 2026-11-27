'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import escenarios from '@/datos/escenarios-demo.json';
import { Icono } from '../Icono';
import { enviar } from '../SelectorArchivos';
import { EVENTO_DEMO, avanzarDemo, guardarDemo, leerDemo, type EstadoDemo } from './estado';

// Barra fija que acompaña la demo: en qué paso vas, qué hacer en esta pantalla y
// el botón al siguiente paso. Solo aparece si se empezó un escenario.

const PASOS = ['Revisar', 'Juicio y carta', 'Selección', 'Ejecución', 'Cierre y prueba', 'Aplicar'];

/**
 * Sube un PDF de la demo y lo revisa de una vez: en la demo no hay nada que confirmar,
 * se aceptan los tipos que sugiere Axis. Devuelve el id de la revisión.
 */
export async function revisarDemo(url: string, subidaDirecta: boolean, progreso: (texto: string) => void) {
  progreso('Leyendo el expediente…');
  const blob = await (await fetch(url)).blob();
  const archivo = new File([blob], decodeURIComponent(url.split('/').pop()!), { type: 'application/pdf' });
  const { id } = await enviar<{ id: string }>('/api/expedientes', [archivo], {}, subidaDirecta);
  progreso('Corriendo las pruebas…');
  const e = (await (await fetch(`/api/expedientes/${id}`)).json()) as { documentos: { id: string; tipo: string }[] };
  const r = await fetch(`/api/expedientes/${id}/analisis`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tipos: Object.fromEntries(e.documentos.map((d) => [d.id, d.tipo])) }),
  });
  if (!r.ok) throw new Error('No se pudo revisar el expediente de la demo.');
  return id;
}

export function GuiaDemo({ subidaDirecta }: { subidaDirecta: boolean }) {
  const ruta = usePathname();
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoDemo | null>(null);
  const [cargando, setCargando] = useState('');

  useEffect(() => {
    const leer = () => setEstado(leerDemo());
    leer();
    window.addEventListener(EVENTO_DEMO, leer);
    window.addEventListener('storage', leer);
    return () => { window.removeEventListener(EVENTO_DEMO, leer); window.removeEventListener('storage', leer); };
  }, [ruta]);

  const esc = estado ? escenarios.find((x) => x.id === estado.escenario) : undefined;
  // La guía avanza sola cuando la persona llega a la pantalla de cada paso.
  useEffect(() => {
    if (!estado?.a) return;
    if (ruta === `/revision/${estado.a}/carta`) avanzarDemo({ paso: 2 });
    const sel = /^\/seleccion\/([0-9a-f-]{36})$/.exec(ruta);
    if (sel && estado.paso >= 2) avanzarDemo({ paso: 3, proceso: sel[1] });
    const obra = /^\/ejecucion\/([0-9a-f-]{36})$/.exec(ruta);
    if (obra && estado.paso >= 3) avanzarDemo({ paso: 4, obra: obra[1] });
  }, [ruta, estado?.a, estado?.paso]);
  // En la portada, la tarjeta de la demo ya muestra el avance y el botón para continuar.
  if (!estado || !esc || estado.paso === 0 || ruta === '/') return null;

  const cercano = async () => {
    try {
      const b = await revisarDemo(esc.cercano.archivo, subidaDirecta, setCargando);
      avanzarDemo({ paso: 6, b });
      router.push(`/revision/${b}`);
    } finally {
      setCargando('');
    }
  };
  const salir = () => guardarDemo(null);

  let paso: number = estado.paso;
  let texto: string;
  let accion: React.ReactNode = null;
  const siguiente = (href: string, etiqueta: string) => <Link className="btn primary" href={href}><Icono nombre="arrow" tamano={17} />{etiqueta}</Link>;
  const botonCercano = <button type="button" className="btn primary" disabled={!!cargando} onClick={cercano}><Icono nombre={cargando ? 'clock' : 'arrow'} tamano={17} />{cargando || `Siguiente: revisar ${esc.cercano.via}`}</button>;
  const aSeleccion = `/seleccion?expediente=${estado.a}&ejemplo=1`;
  const aEjecucion = estado.obra ? `/ejecucion/${estado.obra}` : `/ejecucion?expediente=${estado.a}${estado.proceso ? `&proceso=${estado.proceso}` : ''}`;

  if (estado.a && ruta === `/revision/${estado.a}`) {
    paso = 1;
    texto = 'El semáforo y cada error con su documento y página. Elige una alerta y prueba «Justificar esta alerta»: Axis revisa tu sustento antes de aceptarlo.';
    accion = siguiente(`/revision/${estado.a}/carta`, 'Siguiente: la carta');
  } else if (estado.a && ruta === `/revision/${estado.a}/carta`) {
    paso = 2;
    texto = 'La carta al consultor ya tiene los plazos del art. 144. Cuando el expediente se aprueba, la obra se licita.';
    accion = siguiente(aSeleccion, 'Siguiente: elegir al contratista');
  } else if (ruta === '/seleccion') {
    paso = 3;
    texto = 'Cargamos un proceso de ejemplo con empresas ficticias: un consorcio 90/10 y dos postores que comparten domicilio. Pulsa «Analizar postores».';
  } else if (ruta.startsWith('/seleccion/')) {
    paso = 3;
    texto = 'Por ley gana el mejor puntaje y Axis no lo cambia, pero te dice qué verificar del ganador (art. 83) y qué remitir a Indecopi.';
    accion = siguiente(aEjecucion, 'Siguiente: controlar la obra');
  } else if (ruta === '/ejecucion') {
    paso = 4;
    texto = 'Los datos del ganador ya están. Pulsa «Registrar obra».';
  } else if (ruta.startsWith('/ejecucion/')) {
    paso = 4;
    texto = 'Prueba los ejemplos: una ampliación, una consulta y un adicional. Axis calcula tus plazos (el silencio puede aprobarlos) y los coteja con el expediente.';
    accion = siguiente(`/obras?escenario=${esc.id}`, 'Siguiente: cerrar la obra');
  } else if (ruta.startsWith('/obras')) {
    paso = 5;
    texto = estado.paso >= 5
      ? 'Listo: Axis aprendió una prueba nueva. Ahora mira cómo la aplica en otro expediente.'
      : `Ya cargamos la ${esc.obra.tipo.toLowerCase()} de la obra. Pulsa «Registrar obra» y luego «Aceptar prueba».`;
    accion = estado.paso >= 5 ? botonCercano : null;
  } else if (estado.b && ruta === `/revision/${estado.b}`) {
    paso = 6;
    texto = `${esc.cercano.via} no tenía errores sembrados, pero la prueba que Axis aprendió de la obra la observa (hallazgo «Pruebas aprendidas»). ¡Demo completa!`;
    accion = <><Link className="btn secondary" href="/pruebas">Ver todas las pruebas</Link><Link className="btn primary" href="/" onClick={salir}><Icono nombre="check" tamano={17} />Terminar</Link></>;
  } else {
    texto = `Tienes una demo en curso: ${esc.titulo.toLowerCase()} (${esc.zona}).`;
    const destino = estado.paso === 1 && estado.a ? `/revision/${estado.a}`
      : estado.paso === 2 ? aSeleccion
        : estado.paso === 3 ? (estado.proceso ? `/seleccion/${estado.proceso}` : aSeleccion)
          : estado.paso === 4 ? aEjecucion
            : estado.paso === 6 && estado.b ? `/revision/${estado.b}` : null;
    accion = estado.paso === 5 ? botonCercano : destino ? siguiente(destino, 'Continuar') : null;
  }

  return (
    <aside className="guia-demo" aria-label="Guía de la demo">
      <div className="wrap guia-dentro">
        <ol className="guia-pasos" aria-label="Pasos de la demo">
          {PASOS.map((p, i) => (
            <li key={p} className={i + 1 < paso ? 'guia-hecho' : i + 1 === paso ? 'guia-actual' : ''} aria-current={i + 1 === paso ? 'step' : undefined}>
              <span>{i + 1 < paso ? <Icono nombre="check" tamano={13} /> : i + 1}</span>{p}
            </li>
          ))}
        </ol>
        <p className="guia-texto"><b>Paso {paso} de {PASOS.length}.</b> {texto}</p>
        <div className="guia-acciones">
          {accion}
          <button type="button" className="icon-btn" aria-label="Cerrar la guía" title="Cerrar la guía" onClick={salir}><Icono nombre="close" tamano={16} /></button>
        </div>
      </div>
    </aside>
  );
}
