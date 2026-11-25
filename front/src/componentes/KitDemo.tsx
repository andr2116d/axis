'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icono } from './Icono';
import { revisarDemo } from './demo/GuiaDemo';
import { EVENTO_DEMO, guardarDemo, leerDemo, type EstadoDemo } from './demo/estado';

// Demo de la portada: un solo camino. Se elige el siguiente escenario que el modelo
// todavía no aprendió, se empieza con un botón y la guía de abajo lleva el resto.

export interface EscenarioKit {
  id: string; zona: string; titulo: string; situacion: string; aprendido: boolean;
  original: { archivo: string; via: string };
  obra: { archivo: string; tipo: string };
  cercano: { archivo: string; via: string; distancia: number };
}

const OTROS = [
  { titulo: 'Presupuesto real de la Av. Jaime Blanco', texto: 'Publicado en el SEACE (LP-ABR-12-2026-MDEP). Axis encuentra sus 3 errores reales.', archivo: '/demo/REAL_presupuesto_av-jaime-blanco_SEACE.pdf' },
  { titulo: 'Expediente incompleto · Pasaje Los Rosales', texto: 'Solo trae algunas partes: Axis dice qué falta y qué no pudo revisar.', archivo: '/demo/LL-03_pistas-pasaje-los-rosales_incompleto.pdf' },
];

/** Adónde continuar una demo empezada (null: falta revisar el expediente cercano). */
export function destinoDemo(d: EstadoDemo): string | null {
  if (d.paso === 1 && d.a) return `/revision/${d.a}`;
  if (d.paso === 2) return `/obras?escenario=${d.escenario}`;
  if (d.paso === 4 && d.b) return `/revision/${d.b}`;
  return null;
}

export function KitDemo({ subidaDirecta, actual, lista }: { subidaDirecta: boolean; actual: EscenarioKit | null; lista: EscenarioKit[] }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoDemo | null>(null);
  const [cargando, setCargando] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const leer = () => setEstado(leerDemo());
    leer();
    window.addEventListener(EVENTO_DEMO, leer);
    return () => window.removeEventListener(EVENTO_DEMO, leer);
  }, []);

  // El escenario de esta persona se mantiene hasta que lo termine.
  const e = lista.find((x) => x.id === estado?.escenario) ?? actual ?? lista[lista.length - 1];
  const numero = lista.findIndex((x) => x.id === e.id) + 1;
  const hechos = lista.filter((x) => x.aprendido).length;
  const enCurso = estado?.escenario === e.id && estado.paso > 0 ? estado : null;
  const listos = enCurso ? (enCurso.paso >= 4 ? 4 : enCurso.paso === 3 ? 3 : enCurso.paso - 1) : 0;

  const revisar = async (url: string, alTerminar: (id: string) => void) => {
    setError('');
    try {
      const id = await revisarDemo(url, subidaDirecta, setCargando);
      alTerminar(id);
      router.push(`/revision/${id}`);
    } catch (x) {
      setError((x as Error).message);
      setCargando('');
    }
  };
  const empezar = () => revisar(e.original.archivo, (a) => guardarDemo({ escenario: e.id, paso: 1, a }));
  const continuar = () => {
    if (!enCurso) return;
    const destino = destinoDemo(enCurso);
    if (destino) router.push(destino);
    else revisar(e.cercano.archivo, (b) => guardarDemo({ ...enCurso, paso: 4, b }));
  };

  const pasos = [
    ['Revisa el expediente', `${e.original.via}: Axis encuentra sus errores y da un semáforo.`],
    ['Arma la carta', 'Elige qué observaciones enviar al proyectista.'],
    [`Enséñale la obra ${e.situacion}`, `Con su ${e.obra.tipo.toLowerCase()}, Axis aprende una prueba nueva y tú la aceptas.`],
    ['Mira cómo la aplica', `${e.cercano.via}, a ${e.cercano.distancia} m, sale observada por lo aprendido.`],
  ];

  return (
    <section className="kit-demo" id="demo" aria-labelledby="kit-demo">
      <div className="kit-principal">
        <div>
          <span className="kit-escenario">Demo · Escenario {numero} de {lista.length} · {e.zona}</span>
          <h2 id="kit-demo">{e.titulo}</h2>
          <ol className="kit-recorrido">
            {pasos.map(([t, d], i) => (
              <li key={t} className={i < listos ? 'listo' : ''}>
                <span>{i < listos ? <Icono nombre="check" tamano={14} /> : i + 1}</span><div><strong>{t}</strong><small>{d}</small></div>
              </li>
            ))}
          </ol>
        </div>
        <div className="kit-accion">
          <button type="button" className="btn primary btn-grande" disabled={!!cargando} onClick={enCurso ? continuar : empezar}>
            <Icono nombre={cargando ? 'clock' : 'arrow'} tamano={20} />{cargando || (enCurso ? 'Continuar la demo' : 'Empezar la demo')}
          </button>
          <small>Unos 3 minutos. Una guía abajo te dice qué hacer en cada pantalla.</small>
          {enCurso && <button type="button" className="text-link" onClick={() => guardarDemo(null)}>Empezar de nuevo</button>}
          <span className="kit-progreso" title="Escenarios que el modelo ya aprendió">El modelo ya aprendió {hechos} de {lista.length} escenarios</span>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <details className="kit-mas">
        <summary>Más ejemplos y archivos de la demo</summary>
        <div className="kit-otros">
          {OTROS.map((o) => (
            <div key={o.archivo}>
              <strong>{o.titulo}</strong><span>{o.texto}</span>
              <div className="kit-acciones">
                <button type="button" className="btn secondary" disabled={!!cargando} onClick={() => revisar(o.archivo, () => {})}><Icono nombre="arrow" tamano={17} />Revisar</button>
                <a className="text-link" href={o.archivo} download>PDF</a>
              </div>
            </div>
          ))}
          <div>
            <strong>Tus propios archivos</strong><span>Sube cualquier expediente en PDF, Word o Excel: corre el mismo análisis.</span>
            <div className="kit-acciones"><a className="btn secondary" href="#cargar"><Icono nombre="upload" tamano={17} />Subir archivos</a></div>
          </div>
        </div>
        <ul className="kit-lista">
          {lista.map((x, i) => (
            <li key={x.id}>
              <span className={`pill ${x.aprendido ? 'confirmed' : 'neutral'}`}>{x.aprendido ? 'Aprendido' : 'Pendiente'}</span>
              <span>{i + 1}. {x.titulo} · {x.zona}</span>
              <span className="kit-acciones"><a className="text-link" href={x.original.archivo} download>Expediente</a><a className="text-link" href={x.obra.archivo} download>Obra</a><a className="text-link" href={x.cercano.archivo} download>Cercano</a></span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
