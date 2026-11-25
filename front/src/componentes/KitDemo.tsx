'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icono } from './Icono';
import { enviar } from './SelectorArchivos';

// Demo con los expedientes que ya están en el servidor: un clic revisa o registra.

const LL01 = '/demo/LL-01_pistas-calle-los-incas_con-errores.pdf';
const OBRA = '/demo/OBRA-LL-01_resolucion-adicional-01_sintetica.pdf';
const LL02 = '/demo/LL-02_pistas-calle-santa-clara_limpio.pdf';

const OTROS = [
  { titulo: 'Presupuesto real de la Av. Jaime Blanco', texto: 'Publicado en el SEACE (LP-ABR-12-2026-MDEP). Axis encuentra sus 3 errores reales.', archivo: '/demo/REAL_presupuesto_av-jaime-blanco_SEACE.pdf' },
  { titulo: 'Expediente incompleto · Pasaje Los Rosales', texto: 'Solo trae algunas partes: Axis dice qué falta y qué no pudo revisar.', archivo: '/demo/LL-03_pistas-pasaje-los-rosales_incompleto.pdf' },
];

export function KitDemo({ subidaDirecta }: { subidaDirecta: boolean }) {
  const router = useRouter();
  const [cargando, setCargando] = useState('');
  const [error, setError] = useState('');

  const revisar = async (url: string) => {
    setCargando(url);
    setError('');
    try {
      const blob = await (await fetch(url)).blob();
      const archivo = new File([blob], decodeURIComponent(url.split('/').pop()!), { type: 'application/pdf' });
      const { id } = await enviar<{ id: string }>('/api/expedientes', [archivo], {}, subidaDirecta);
      router.push(`/revision/${id}`);
    } catch (e) {
      setError((e as Error).message);
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
      <div className="section-heading">
        <h2 id="kit-demo">Prueba la demo en cuatro pasos</h2>
        <p>Con expedientes de demostración que ya están en Axis. Verás cómo revisa, cómo arma la carta y cómo aprende una prueba nueva de una obra terminada.</p>
      </div>
      <ol className="kit-pasos">
        <li>
          <span className="kit-num">1</span>
          <div>
            <strong>Revisa un expediente</strong>
            <p>Calle Los Incas, El Porvenir. Trae errores copiados de casos reales: sale en rojo.</p>
            <div className="kit-acciones">{boton(LL01, 'Revisar')}<a className="text-link" href={LL01} download>PDF</a></div>
          </div>
        </li>
        <li>
          <span className="kit-num">2</span>
          <div>
            <strong>Arma la carta</strong>
            <p>Desde la revisión, «Abrir carta»: elige qué observaciones enviar al proyectista y descárgala en PDF.</p>
          </div>
        </li>
        <li>
          <span className="kit-num">3</span>
          <div>
            <strong>Registra la obra terminada</strong>
            <p>En obra aparecieron redes de desagüe que el expediente no previó. Axis propone una prueba nueva y tú la aceptas.</p>
            <div className="kit-acciones"><Link className="btn primary" href={`/obras?demo=${encodeURIComponent(OBRA)}`}><Icono nombre="layers" tamano={17} />Registrar</Link><a className="text-link" href={OBRA} download>PDF</a></div>
          </div>
        </li>
        <li>
          <span className="kit-num">4</span>
          <div>
            <strong>Revisa otro expediente</strong>
            <p>Calle Santa Clara, a 850 m. No tiene errores sembrados, pero la prueba aprendida lo observa.</p>
            <div className="kit-acciones">{boton(LL02, 'Revisar')}<a className="text-link" href={LL02} download>PDF</a></div>
          </div>
        </li>
      </ol>
      {error && <p className="form-error" role="alert">{error}</p>}
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
