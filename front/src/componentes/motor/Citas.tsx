'use client';

import type { RespuestaNormativa } from './cliente';
import { Icono } from '../Icono';

// Artículos que aplican a un caso, con su extracto literal y por qué aplican. Si ningún
// modelo leyó la norma (el lector no estaba disponible), se dice: son coincidencias por palabras.

export function Citas({ respuesta }: { respuesta: RespuestaNormativa }) {
  if (!respuesta.citas.length) {
    return <p className="empty-line">No se encontró un artículo que aplique a este caso.</p>;
  }
  return (
    <div className="citas-motor">
      {!respuesta.leida_por_modelo && (
        <p className="aviso-busqueda"><Icono nombre="alert" tamano={15} /> El lector de la ley no está disponible: son coincidencias por palabras con el texto oficial. Revísalas antes de citarlas.</p>
      )}
      {respuesta.citas.map((c) => (
        <figure key={c.fragmento.id} className="cita-motor">
          <figcaption>
            <span className={`pill ${c.pertinencia === 'alta' ? 'alta' : 'media'}`}>{c.pertinencia === 'alta' ? 'Aplica directamente' : 'Lo enmarca'}</span>
            <strong>{c.fragmento.etiqueta}{c.fragmento.titulo ? `. ${c.fragmento.titulo}` : ''}</strong>
            <small>{c.norma}</small>
          </figcaption>
          <blockquote>{c.extracto}</blockquote>
          <p>{c.razon}</p>
          <details>
            <summary>Ver el texto completo del {c.fragmento.etiqueta.toLowerCase()}</summary>
            {c.fragmento.ubicacion.length > 0 && <small className="ubicacion-norma">{c.fragmento.ubicacion.join(' · ')}</small>}
            {c.fragmento.texto.split('\n\n').map((parrafo, i) => <p key={i}>{parrafo}</p>)}
          </details>
        </figure>
      ))}
      <small className="pie-citas">
        {respuesta.leida_por_modelo ? `Leído por ${respuesta.lector}` : 'Búsqueda en el texto oficial'} · {respuesta.desde_cache ? 'respuesta guardada' : `${(respuesta.duracion_ms / 1000).toFixed(1)} s`}
        {respuesta.descartadas > 0 && ` · ${respuesta.descartadas} cita(s) descartada(s) por no ser literales`}
      </small>
    </div>
  );
}
