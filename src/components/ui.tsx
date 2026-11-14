import Image from 'next/image';
import type { ResultadoVerificacion, SeveridadVerificacion } from '@/lib/analisis/tipos-analisis';

export function Logo({ ancho = 116 }: { ancho?: number }) {
  return <Image src="/axis-logo.svg" alt="Axis" width={118} height={36} style={{ width: ancho, height: 'auto' }} unoptimized />;
}

export const TEXTO_RESULTADO: Record<ResultadoVerificacion, string> = { falla: 'Observación', no_verificable: 'Por revisar', pasa: 'Conforme' };
const CLASE_RESULTADO: Record<ResultadoVerificacion, string> = { falla: 'bg-falla-tenue text-falla', no_verificable: 'bg-revisar-tenue text-revisar', pasa: 'bg-pasa-tenue text-pasa' };
export function Resultado({ r }: { r: ResultadoVerificacion }) {
  return <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-bold ${CLASE_RESULTADO[r]}`}>{TEXTO_RESULTADO[r]}</span>;
}
/** Severidad como barras (1 a 3), legible sin color. */
export function Severidad({ s }: { s: SeveridadVerificacion }) {
  const n = s === 'alta' ? 3 : s === 'media' ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-grafito" title={`Severidad ${s}`}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((i) => <span key={i} className={`w-[4px] ${i <= n ? 'bg-asfalto' : 'bg-junta'}`} style={{ height: 4 + i * 3 }} />)}
      </span>
      {s}
    </span>
  );
}
export const soles = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CabeceraPagina({ titulo, descripcion, accion }: { titulo: string; descripcion: string; accion?: React.ReactNode }) {
  return <header className="page-heading"><div><h1>{titulo}</h1><p>{descripcion}</p></div>{accion && <div className="page-heading-action">{accion}</div>}</header>;
}

export function EstadoVacio({ titulo, texto, children, principal = false }: { titulo: string; texto: string; children?: React.ReactNode; principal?: boolean }) {
  const T = principal ? 'h1' : 'h2';
  return <div className="empty-state"><T>{titulo}</T><p>{texto}</p>{children && <div className="mt-5">{children}</div>}</div>;
}
