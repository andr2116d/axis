'use client';

import Link from 'next/link';
import { Icono } from './Icono';
import { cargarDemo } from './archivos-demo';

const PASOS = [
  {
    paso: '1', titulo: 'Revisa un expediente', texto: 'Calle Los Incas (sintético, con 21 errores copiados de casos reales). Sale en rojo.',
    archivo: '/demo/LL-01_pistas-calle-los-incas_con-errores.pdf', destino: 'expediente' as const,
  },
  {
    paso: '2', titulo: 'Registra la obra terminada', texto: 'Resolución de adicional (sintética): en obra aparecieron redes de desagüe que el expediente no previó. Axis crea una prueba.',
    archivo: '/demo/OBRA-LL-01_resolucion-adicional-01_sintetica.pdf', destino: 'obra' as const,
  },
  {
    paso: '3', titulo: 'Revisa otro expediente cercano', texto: 'Calle Santa Clara (sintético, sin errores sembrados), a 850 m. La prueba aprendida aparece en su revisión.',
    archivo: '/demo/LL-02_pistas-calle-santa-clara_limpio.pdf', destino: 'expediente' as const,
  },
];

export function KitDemo() {
  return (
    <section className="kit-demo" aria-labelledby="kit-demo">
      <div className="section-heading">
        <h2 id="kit-demo">Prueba el ciclo completo</h2>
        <p>Tres documentos de demostración: un expediente, la obra que se ejecutó con él y otro expediente de la zona.</p>
      </div>
      <ol className="kit-pasos">
        {PASOS.map((p) => (
          <li key={p.paso}>
            <span className="kit-num">{p.paso}</span>
            <div>
              <strong>{p.titulo}</strong>
              <p>{p.texto}</p>
              <div className="kit-acciones">
                {p.destino === 'expediente'
                  ? <button type="button" className="btn secondary" onClick={() => { cargarDemo('expediente', p.archivo); document.getElementById('cargar')?.scrollIntoView({ block: 'center' }); }}><Icono nombre="upload" tamano={17} />Cargar aquí</button>
                  : <Link className="btn secondary" href={`/obras?demo=${encodeURIComponent(p.archivo)}`}><Icono nombre="layers" tamano={17} />Ir a registrar</Link>}
                <a className="text-link" href={p.archivo} download>Descargar PDF</a>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="inline-note">
        <Icono nombre="file" tamano={15} /> Con un documento real: <a href="/demo/REAL_presupuesto_av-jaime-blanco_SEACE.pdf" download>presupuesto publicado de la Av. Jaime Blanco</a> (SEACE, LP-ABR-12-2026-MDEP).
        Axis encuentra sus 3 errores reales: monto en letras, un subtotal y partidas globales.
        <button type="button" className="text-link" onClick={() => { cargarDemo('expediente', '/demo/REAL_presupuesto_av-jaime-blanco_SEACE.pdf'); document.getElementById('cargar')?.scrollIntoView({ block: 'center' }); }}>Cargar aquí</button>
      </p>
    </section>
  );
}
