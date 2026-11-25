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

/** Sube un PDF de la demo como expediente y devuelve el id de la revisión. */
export async function subirDemo(url: string, subidaDirecta: boolean) {
  const blob = await (await fetch(url)).blob();
  const archivo = new File([blob], decodeURIComponent(url.split('/').pop()!), { type: 'application/pdf' });
  return (await enviar<{ id: string }>('/api/expedientes', [archivo], {}, subidaDirecta)).id;
}

export function GuiaDemo({ subidaDirecta }: { subidaDirecta: boolean }) {
  const ruta = usePathname();
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoDemo | null>(null);
  const [cargando, setCargando] = useState(false);

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
  if (!estado || !esc || estado.paso === 0) return null;

  const cercano = async () => {
    setCargando(true);
    try {
      const b = await subirDemo(esc.cercano.archivo, subidaDirecta);
      avanzarDemo({ paso: 4, b });
      router.push(`/revision/${b}`);
    } finally {
      setCargando(false);
    }
  };
  const salir = () => guardarDemo(null);

  let paso: number = estado.paso;
  let texto: string;
  let accion: React.ReactNode = null;
  const siguiente = (href: string, etiqueta: string) => <Link className="btn primary" href={href}><Icono nombre="arrow" tamano={17} />{etiqueta}</Link>;
  const botonCercano = <button type="button" className="btn primary" disabled={cargando} onClick={cercano}><Icono nombre={cargando ? 'clock' : 'arrow'} tamano={17} />{cargando ? 'Leyendo…' : `Siguiente: revisar ${esc.cercano.via}`}</button>;

  if (estado.a && ruta === `/revision/${estado.a}`) {
    paso = 1;
    texto = 'Si te pide confirmar los documentos, pulsa «Confirmar y revisar». Luego mira el semáforo, los hallazgos y la pestaña Pruebas.';
    accion = siguiente(`/revision/${estado.a}/carta`, 'Siguiente: armar la carta');
  } else if (estado.a && ruta === `/revision/${estado.a}/carta`) {
    paso = 2;
    texto = 'Esta es la carta para el proyectista. Quita lo que no quieras enviar, completa tus datos y descárgala en PDF.';
    accion = siguiente(`/obras?escenario=${esc.id}`, 'Siguiente: registrar la obra');
  } else if (ruta.startsWith('/obras')) {
    paso = 3;
    texto = estado.paso >= 3
      ? 'Axis aprendió una prueba nueva de esta obra. Ahora mira cómo la aplica en un expediente cercano.'
      : `El documento de la obra (${esc.obra.tipo.toLowerCase()}) ya está cargado. Pulsa «Registrar obra», revisa lo que encontró Axis y pulsa «Aceptar prueba».`;
    accion = estado.paso >= 3 ? botonCercano : null;
  } else if (estado.b && ruta === `/revision/${estado.b}`) {
    paso = 4;
    texto = `${esc.cercano.via} no tiene errores sembrados: si te pide confirmar, confírmalo. El hallazgo de «Pruebas aprendidas» es la prueba que Axis aprendió de la obra. ¡Demo completa!`;
    accion = <><Link className="btn secondary" href="/pruebas">Ver todas las pruebas</Link><Link className="btn primary" href="/#demo" onClick={salir}><Icono nombre="check" tamano={17} />Terminar</Link></>;
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
