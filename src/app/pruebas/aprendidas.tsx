'use client';
import Link from 'next/link';
import { useSesion } from '@/lib/sesion';

export function PruebasAprendidas() {
  const { pruebas } = useSesion();
  const validas = pruebas.filter((p) => p.estado === 'validada');
  return (
    <section className="mt-10 hoja p-5">
      <h2 className="text-lg font-extrabold">Lo que aprendimos en esta sesión</h2>
      {validas.length === 0 ? (
        <p className="mt-1 max-w-texto text-sm leading-relaxed text-asfalto-suave">Cuando un supervisor registra algo que el expediente no previó y el curador lo valida, su nueva prueba aparece aquí y se aplica a los expedientes cercanos. <Link href="/obra" className="enlace">Registrar un hallazgo</Link></p>
      ) : (
        <ul className="mt-3 space-y-3">
          {validas.map((p) => (
            <li key={p.id} id={p.id} className="text-sm leading-relaxed">
              <b>{p.nombre}</b> <span className="text-grafito">({p.id}, radio {p.radio} m)</span>
              <span className="block text-asfalto-suave">Nació en {p.hallazgo.obra}: «{p.hallazgo.descripcion}» ({p.hallazgo.fuente}, {p.hallazgo.fecha}).</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
