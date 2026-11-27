import Link from 'next/link';
import { norma } from '@/servidor/normativa';
import { hrefArticulo } from '@/dominio/normativa';
import { BuscarArticulo } from '@/componentes/normativa/BuscarArticulo';
import { PreguntaNormativa } from '@/componentes/normativa/PreguntaNormativa';

export const metadata = { title: 'Normativa' };

export default function PaginaNormativa() {
  const normas = (['ley', 'reglamento'] as const).map((id) => ({ id, ...norma(id)! }));
  return (
    <>
      <section className="page-lead">
        <span className="fase-etiqueta">Base legal</span>
        <h1>Normativa</h1>
        <p>El texto oficial de la Ley 32069 y su Reglamento con el que Axis fundamenta cada observación, plazo y recomendación. Cada cita en Axis abre aquí el artículo exacto.</p>
      </section>
      <PreguntaNormativa />
      <BuscarArticulo articulos={normas.flatMap((x) => x.articulos.map((a) => ({ norma: x.id, n: a.n, titulo: a.titulo })))} />
      <div className="normas">
        {normas.map((x) => (
          <section key={x.id} className="content-panel norma">
            <h2>{x.nombre}</h2>
            <p className="inline-note">{x.version} · {x.articulos.length} artículos</p>
            <ol className="indice-articulos">
              {x.articulos.map((a) => <li key={a.n}><Link href={hrefArticulo(x.id, a.n)}><span className="mono">Art. {a.n}</span>{a.titulo}</Link></li>)}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
