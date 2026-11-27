import Link from 'next/link';
import { NOMBRE_NORMA, hrefArticulo, tituloArticulo, tramosCita } from '@/dominio/normativa';

/** Cita legal con cada artículo enlazado a su texto oficial. */
export function Cita({ texto }: { texto: string }) {
  return (
    <>
      {tramosCita(texto).map((t, i) => 'norma' in t
        ? <Link key={i} className="cita" href={hrefArticulo(t.norma, t.n, t.numeral)} title={`${NOMBRE_NORMA[t.norma]}, art. ${t.n}: ${tituloArticulo(t.norma, t.n)}`}>{t.texto}</Link>
        : <span key={i}>{t.texto}</span>)}
    </>
  );
}
