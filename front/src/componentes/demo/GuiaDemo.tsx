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

const PASOS = ['Revisar', 'Carta', 'Obra y prueba', 'Aplicar'];

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
  useEffect(() => {
    if (estado?.a && ruta === `/revision/${estado.a}/carta`) avanzarDemo({ paso: 2 });
  }, [ruta, estado?.a]);
  // En la portada, la tarjeta de la demo ya muestra el avance y el botón para continuar.
  if (!estado || !esc || estado.paso === 0 || ruta === '/') return null;

  const cercano = async () => {
    try {
      const b = await revisarDemo(esc.cercano.archivo, subidaDirecta, setCargando);
      avanzarDemo({ paso: 4, b });
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

  if (estado.a && ruta === `/revision/${estado.a}`) {
    paso = 1;
    texto = 'Este es el resultado: el semáforo y cada error con su documento y página. Mira también la pestaña «Pruebas».';
    accion = siguiente(`/revision/${estado.a}/carta`, 'Siguiente: armar la carta');
  } else if (estado.a && ruta === `/revision/${estado.a}/carta`) {
    paso = 2;
    texto = 'La carta para el proyectista ya está armada. Quita lo que no quieras enviar; puedes descargarla en PDF.';
    accion = siguiente(`/obras?escenario=${esc.id}`, 'Siguiente: registrar la obra');
  } else if (ruta.startsWith('/obras')) {
    paso = 3;
    texto = estado.paso >= 3
      ? 'Listo: Axis aprendió una prueba nueva. Ahora mira cómo la aplica en otro expediente.'
      : `Ya cargamos la ${esc.obra.tipo.toLowerCase()} de la obra. Pulsa «Registrar obra» y luego «Aceptar prueba».`;
    accion = estado.paso >= 3 ? botonCercano : null;
  } else if (estado.b && ruta === `/revision/${estado.b}`) {
    paso = 4;
    texto = `${esc.cercano.via} no tenía errores sembrados, pero la prueba que Axis aprendió de la obra la observa (hallazgo «Pruebas aprendidas»). ¡Demo completa!`;
    accion = <><Link className="btn secondary" href="/pruebas">Ver todas las pruebas</Link><Link className="btn primary" href="/" onClick={salir}><Icono nombre="check" tamano={17} />Terminar</Link></>;
  } else {
    texto = `Tienes una demo en curso: ${esc.titulo.toLowerCase()} (${esc.zona}).`;
    accion = estado.paso === 1 && estado.a ? siguiente(`/revision/${estado.a}`, 'Continuar')
      : estado.paso === 2 ? siguiente(`/obras?escenario=${esc.id}`, 'Continuar')
        : estado.paso === 3 ? botonCercano
          : estado.b ? siguiente(`/revision/${estado.b}`, 'Continuar') : null;
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
        <p className="guia-texto"><b>Paso {paso} de 4.</b> {texto}</p>
        <div className="guia-acciones">
          {accion}
          <button type="button" className="icon-btn" aria-label="Cerrar la guía" title="Cerrar la guía" onClick={salir}><Icono nombre="close" tamano={16} /></button>
        </div>
      </div>
    </aside>
  );
}
