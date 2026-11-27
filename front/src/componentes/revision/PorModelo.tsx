'use client';

import type { Expediente } from '@/dominio/tipos';
import { GRUPOS_MOTORES, MOTORES_EN_VERIFICADORES } from '@/dominio/motores';
import { Icono } from '../Icono';
import { Pill } from '../ui';

// La misma revisión vista modelo por modelo: qué revisó cada uno sobre este expediente,
// qué encontró (con enlace al hallazgo) o por qué no corrió.

const ESTADO = {
  ok: { texto: 'Corrió', icono: 'check' },
  'sin-datos': { texto: 'Sin datos', icono: 'clock' },
  error: { texto: 'Error', icono: 'alert' },
} as const;

export function PanelPorModelo({ e, alVerHallazgo }: { e: Expediente; alVerHallazgo: (id: string) => void }) {
  const corrida = new Map(e.ejecucion.map((x) => [x.motor, x]));
  // Los motores de coherencia, costos y territorio corren dentro de la biblioteca de verificadores.
  const biblioteca = corrida.get('verificadores');
  if (biblioteca?.estado === 'ok') {
    for (const id of MOTORES_EN_VERIFICADORES) if (!corrida.has(id)) corrida.set(id, { motor: id, estado: 'ok', ms: 0 });
  }
  const grupos = GRUPOS_MOTORES.filter((g) => g.fase === 'expediente' || g.id === 'aprendizaje')
    .map((g) => ({ ...g, motores: g.motores.filter((m) => g.fase === 'expediente' || corrida.has(m.id)) }))
    .filter((g) => g.motores.length);
  const corrieron = grupos.flatMap((g) => g.motores).filter((m) => corrida.get(m.id)?.estado === 'ok').length;
  const conHallazgos = new Set(e.hallazgos.flatMap((h) => h.motores.filter((m) => m !== 'lectura'))).size;
  return (
    <section className="content-panel panel-modelos">
      <h2>Modelo por modelo</h2>
      <p>Corrieron {corrieron} modelos sobre este expediente y {conHallazgos} encontraron algo. Cada hallazgo puede venir de varios modelos que trabajan en cadena: aparece en cada uno de ellos.</p>
      {grupos.map((g) => (
        <div key={g.id} className="grupo-modelos">
          <h3><Icono nombre={g.icono} tamano={18} />{g.nombre}</h3>
          <ul>
            {g.motores.map((m) => {
              const x = corrida.get(m.id);
              const hallazgos = e.hallazgos.filter((h) => h.motores.includes(m.id));
              return (
                <li key={m.id} className={x ? '' : 'no-corrio'}>
                  <div className="modelo-cabeza">
                    <strong>{m.nombre}</strong>
                    <span className={`doc-status estado-${x?.estado ?? 'no'}`}><Icono nombre={x ? ESTADO[x.estado].icono : 'minus'} tamano={15} />{x ? ESTADO[x.estado].texto : 'No corrió'}</span>
                  </div>
                  <p>{x?.nota || m.proposito}</p>
                  {m.id === 'lectura' && hallazgos.length > 0 && <small className="sin-hallazgos">Aporta el texto que cita cada uno de los {hallazgos.length} hallazgos.</small>}
                  {m.id !== 'lectura' && hallazgos.length > 0 && (
                    <ul className="modelo-hallazgos">
                      {hallazgos.map((h) => (
                        <li key={h.id}><button type="button" onClick={() => alVerHallazgo(h.id)}><Pill prioridad={h.prioridad} /><span>{h.titulo}</span><Icono nombre="chevron" tamano={16} /></button></li>
                      ))}
                    </ul>
                  )}
                  {x && !hallazgos.length && x.estado === 'ok' && <small className="sin-hallazgos">Sin observaciones</small>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
