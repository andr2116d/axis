import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { articulo, norma } from '@/servidor/normativa';
import { NOMBRE_NORMA, hrefArticulo, type Norma } from '@/dominio/normativa';
import { Icono } from '@/componentes/Icono';

type Props = { params: Promise<{ norma: string; n: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  return { title: norma(p.norma) ? `${NOMBRE_NORMA[p.norma as Norma]}, art. ${p.n}` : 'Normativa' };
}

/** Id del numeral («200.1» → n-200-1) para que una cita lleve directo a él. */
const ancla = (t: string) => t.match(/^(\d+(?:\.\d+)+)\.?\s/)?.[1].replace(/\./g, '-');

export default async function PaginaArticulo({ params }: Props) {
  const p = await params;
  const id = p.norma as Norma;
  const texto = norma(id);
  const a = articulo(id, Number(p.n));
  if (!texto || !a) notFound();
  const anterior = articulo(id, a.n - 1);
  const siguiente = articulo(id, a.n + 1);
  return (
    <>
      <div className="review-breadcrumb"><Link className="back" href="/normativa"><Icono nombre="back" tamano={17} /> Normativa</Link></div>
      <article className="content-panel articulo-norma">
        <span className="fase-etiqueta">{texto.nombre}</span>
        <h1>Artículo {a.n}. {a.titulo}</h1>
        <p className="inline-note">{texto.version}</p>
        <div className="texto-norma">
          {a.parrafos.map((x, i) => {
            const idN = !x.k ? ancla(x.t) : undefined;
            if (x.k === 'nota') return <p key={i} className="nota-norma">{x.t.replace(/, cuyo texto es el siguiente:$/, '.')}</p>;
            if (x.k === 'anterior') return <details key={i} className="texto-anterior"><summary>Texto anterior a la modificación</summary><p>{x.t}</p></details>;
            return <p key={i} id={idN ? `n-${idN}` : undefined} className={/^[a-z]\)|^[ivx]+\)/.test(x.t) ? 'literal' : undefined}>{x.t}</p>;
          })}
        </div>
        <nav className="articulo-nav" aria-label="Artículos vecinos">
          {anterior ? <Link href={hrefArticulo(id, anterior.n)}><Icono nombre="back" tamano={15} /> Art. {anterior.n}. {anterior.titulo}</Link> : <span />}
          {siguiente && <Link href={hrefArticulo(id, siguiente.n)}>Art. {siguiente.n}. {siguiente.titulo} <Icono nombre="chevron" tamano={15} /></Link>}
        </nav>
      </article>
    </>
  );
}
