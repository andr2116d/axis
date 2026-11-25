'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icono } from './Icono';
import { enviar } from './SelectorArchivos';

// Demo con los escenarios cargados en el servidor: muestra el siguiente que el modelo
// todavía no aprendió. Un clic revisa un expediente o registra la obra.

export interface EscenarioKit {
  id: string; zona: string; titulo: string; situacion: string; aprendido: boolean;
  original: { archivo: string; via: string };
  obra: { archivo: string; tipo: string };
  cercano: { archivo: string; via: string; distancia: number };
}

const CLAVE = 'axis-escenario-demo';

const OTROS = [
  { titulo: 'Presupuesto real de la Av. Jaime Blanco', texto: 'Publicado en el SEACE (LP-ABR-12-2026-MDEP). Axis encuentra sus 3 errores reales.', archivo: '/demo/REAL_presupuesto_av-jaime-blanco_SEACE.pdf' },
  { titulo: 'Expediente incompleto · Pasaje Los Rosales', texto: 'Solo trae algunas partes: Axis dice qué falta y qué no pudo revisar.', archivo: '/demo/LL-03_pistas-pasaje-los-rosales_incompleto.pdf' },
];

export function KitDemo({ subidaDirecta, actual, lista }: { subidaDirecta: boolean; actual: EscenarioKit | null; lista: EscenarioKit[] }) {
  const router = useRouter();
  const [cargando, setCargando] = useState('');
  const [error, setError] = useState('');
  // El navegador recuerda el escenario que empezó esta persona hasta que lo termine,
  // aunque al aceptar la prueba (paso 3) el escenario ya cuente como aprendido.
  const [propio, setPropio] = useState<string | null>(null);
  useEffect(() => {
    try { setPropio(localStorage.getItem(CLAVE)); } catch { /* sin almacenamiento: se usa el siguiente pendiente */ }
  }, []);
  const recordar = (id: string | null) => {
    setPropio(id);
    try { if (id) localStorage.setItem(CLAVE, id); else localStorage.removeItem(CLAVE); } catch { /* opcional */ }
  };
  const e = lista.find((x) => x.id === propio) ?? actual ?? lista[lista.length - 1];
  const siguiente = lista.find((x) => !x.aprendido && x.id !== e.id) ?? null;
  const numero = lista.findIndex((x) => x.id === e.id) + 1;
  const hechos = lista.filter((x) => x.aprendido).length;

  const revisar = async (url: string) => {
    if (url === e.original.archivo || url === e.cercano.archivo) recordar(e.id);
    setCargando(url);
    setError('');
    try {
      const blob = await (await fetch(url)).blob();
      const archivo = new File([blob], decodeURIComponent(url.split('/').pop()!), { type: 'application/pdf' });
      const { id } = await enviar<{ id: string }>('/api/expedientes', [archivo], {}, subidaDirecta);
      router.push(`/revision/${id}`);
    } catch (x) {
      setError((x as Error).message);
      setCargando('');
    }
  };
  const boton = (url: string, texto: string) => (
    <button type="button" className="btn primary" disabled={!!cargando} aria-busy={cargando === url} onClick={() => revisar(url)}>
      <Icono nombre={cargando === url ? 'clock' : 'arrow'} tamano={17} />{cargando === url ? 'Leyendo…' : texto}
    </button>
  );

  return (
    <section className="kit-demo" id="demo" aria-labelledby="kit-demo">
      <div className="section-heading kit-cabecera">
        <div>
          <span className="kit-escenario">Escenario {numero} de {lista.length} · {e.zona}</span>
          <h2 id="kit-demo">{e.titulo}</h2>
          <p>
            {actual || propio
              ? 'Cuatro pasos con documentos de demostración cargados en Axis: revisa un expediente, arma la carta, enséñale a Axis lo que pasó en la obra y mira cómo aplica lo aprendido.'
              : `El modelo ya aprendió los ${lista.length} escenarios de demostración. Puedes repetir este o probar con tus propios archivos.`}
          </p>
        </div>
        <div className="kit-derecha">
          <span className="kit-progreso" title="Escenarios que el modelo ya aprendió">{hechos}/{lista.length} aprendidos</span>
          {e.aprendido && siguiente && <button type="button" className="btn secondary" onClick={() => recordar(siguiente.id)}><Icono nombre="arrow" tamano={16} />Siguiente escenario</button>}
        </div>
      </div>
      <ol className="kit-pasos">
        <li>
          <span className="kit-num">1</span>
          <div>
            <strong>Revisa el expediente</strong>
            <p>{e.original.via}, {e.zona}. Trae errores copiados de casos reales.</p>
            <div className="kit-acciones">{boton(e.original.archivo, 'Revisar')}<a className="text-link" href={e.original.archivo} download>PDF</a></div>
          </div>
        </li>
        <li>
          <span className="kit-num">2</span>
          <div>
            <strong>Arma la carta</strong>
            <p>En la revisión, «Abrir carta»: elige qué observaciones enviar al proyectista y descárgala en PDF.</p>
          </div>
        </li>
        <li>
          <span className="kit-num">3</span>
          <div>
            <strong>Registra la obra {e.situacion}</strong>
            <p>{e.obra.tipo}: Axis compara lo que pasó con el expediente y propone una prueba nueva. Tú la aceptas.</p>
            <div className="kit-acciones"><Link className="btn primary" href={`/obras?escenario=${e.id}`} onClick={() => recordar(e.id)}><Icono nombre="layers" tamano={17} />Registrar</Link><a className="text-link" href={e.obra.archivo} download>PDF</a></div>
          </div>
        </li>
        <li>
          <span className="kit-num">4</span>
          <div>
            <strong>Revisa un expediente cercano</strong>
            <p>{e.cercano.via}, a {e.cercano.distancia} m. No tiene errores sembrados, pero la prueba aprendida lo observa.</p>
            <div className="kit-acciones">{boton(e.cercano.archivo, 'Revisar')}<a className="text-link" href={e.cercano.archivo} download>PDF</a></div>
          </div>
        </li>
      </ol>
      {error && <p className="form-error" role="alert">{error}</p>}
      <details className="kit-lista">
        <summary>Ver los {lista.length} escenarios</summary>
        <ul>
          {lista.map((x, i) => (
            <li key={x.id}>
              <span className={`pill ${x.aprendido ? 'confirmed' : 'neutral'}`}>{x.aprendido ? 'Aprendido' : 'Pendiente'}</span>
              <span>{i + 1}. {x.titulo} · {x.zona}</span>
              <span className="kit-acciones"><a className="text-link" href={x.original.archivo} download>Expediente</a><a className="text-link" href={x.obra.archivo} download>Obra</a><a className="text-link" href={x.cercano.archivo} download>Cercano</a></span>
            </li>
          ))}
        </ul>
      </details>
      <div className="kit-otros">
        {OTROS.map((o) => (
          <div key={o.archivo}>
            <strong>{o.titulo}</strong><span>{o.texto}</span>
            <div className="kit-acciones">{boton(o.archivo, 'Revisar')}<a className="text-link" href={o.archivo} download>PDF</a></div>
          </div>
        ))}
        <div>
          <strong>Tus propios archivos</strong><span>Sube cualquier expediente en PDF, Word o Excel: corre el mismo análisis.</span>
          <div className="kit-acciones"><a className="btn secondary" href="#cargar"><Icono nombre="upload" tamano={17} />Subir archivos</a></div>
        </div>
      </div>
    </section>
  );
}
