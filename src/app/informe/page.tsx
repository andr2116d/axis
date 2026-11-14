'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { leerAnalisis } from '@/lib/sesion';
import type { AnalisisCliente } from '@/lib/tipos-cliente';
import { verificadorPorId } from '@/data/verificadores';
import { porQueImporta } from '@/lib/explicaciones';
import { soles, Logo, EstadoVacio } from '@/components/ui';
import { IconoFlecha, IconoImprimir } from '@/components/iconos';

interface Guardado { nombre: string; analisis: AnalisisCliente; ocultos: Record<string, number>; paginas: number }

export default function Informe() {
  const [g, setG] = useState<Guardado | null | undefined>(undefined);
  useEffect(() => setG(leerAnalisis<Guardado>()), []);
  if (g === undefined) return <div role="status" className="loading-list"><span className="sr-only">Cargando el informe</span><div><span /><span /><span /></div></div>;
  if (!g) return <EstadoVacio principal titulo="Primero, revisa un expediente" texto="El informe se genera con la revisión abierta en esta pestaña. Elige un ejemplo o sube tus documentos para empezar."><Link href="/revisar" className="boton-principal">Revisar un expediente</Link></EstadoVacio>;
  const a = g.analisis;
  const info = a.detecciones.filter((d) => d.verificador === 'C-HISTORIAL');
  const obs = a.detecciones.filter((d) => d.resultado === 'falla' && d.verificador !== 'C-HISTORIAL');
  const rev = a.detecciones.filter((d) => d.resultado === 'no_verificable');
  const hoy = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <article className="report-sheet">
      <div className="no-imprimir mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link href="/revisar?reanudar=1" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-grafito hover:text-primario"><IconoFlecha className="h-4 w-4 rotate-180" />Volver a la revisión</Link>
        <button onClick={() => window.print()} className="boton-principal"><IconoImprimir className="h-4 w-4" />Imprimir o guardar PDF</button>
      </div>
      <header className="border-b border-asfalto pb-6"><div className="mb-6"><Logo ancho={98} /></div>
        <p className="text-sm font-semibold text-grafito">Carta de observaciones al expediente técnico</p>
        <h1 className="mt-1 text-xl font-extrabold leading-snug">{a.generales.nombre ?? a.nombreObra ?? g.nombre}</h1>
        <p className="mt-2 text-sm text-asfalto-suave">
          {[a.generales.distrito && `Distrito de ${a.generales.distrito.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase())}`, a.generales.cui && `CUI ${a.generales.cui}`, a.total && `presupuesto ${soles(a.total)}`].filter(Boolean).join(', ')}. Revisión del {hoy}.
        </p>
      </header>
      <p className="mt-5 text-[15px] leading-relaxed">
        Se revisaron {g.paginas} páginas con las pruebas de Axis. Resultado: <b>{obs.length} observaciones</b> ({obs.filter((d) => d.severidad === 'alta').length} de severidad alta) y {rev.length} puntos que no se pudieron comprobar. {a.faltantes.length ? `Faltan ${a.faltantes.length} documentos del contenido mínimo.` : ''}
      </p>
      <h2 className="mt-8 text-lg font-semibold">Observaciones ({obs.length})</h2>{obs.length === 0 && <p className="mt-3 text-sm text-pasa">Las pruebas ejecutadas no encontraron observaciones. Consulta los puntos pendientes y el alcance de la revisión.</p>}
      <ol className="mt-3 list-decimal space-y-5 pl-6">
        {obs.map((d, i) => {
          const v = verificadorPorId(d.verificador);
          return (
            <li key={i} className="break-inside-avoid pl-1 text-[14.5px] leading-relaxed">
              <p className="font-bold">{d.titulo} <span className="font-normal text-grafito">(severidad {d.severidad})</span></p>
              {porQueImporta(d) && <p className="mt-1 italic text-asfalto-suave">{porQueImporta(d)}</p>}
              <p className="mt-1">{d.detalle}</p>
              {d.evidencias.map((e, j) => <p key={j} className="mt-1 font-mono text-[12px] text-asfalto-suave">{e.documento}{e.pagina ? `, p. ${e.pagina}` : ''}: {e.extracto}</p>)}
              {v && <p className="mt-1"><b>Se solicita:</b> {v.recomendacion}</p>}
            </li>
          );
        })}
      </ol>
      {info.length > 0 && (<><h2 className="mt-8 text-lg font-extrabold">Contexto de la zona</h2><ul className="mt-3 list-disc space-y-2 pl-6 text-[14.5px]">{info.map((d, i) => <li key={i}><b>{d.titulo}.</b> {d.detalle}</li>)}</ul></>)}
      {rev.length > 0 && (<><h2 className="mt-8 text-lg font-extrabold">Puntos por revisar</h2><ul className="mt-3 list-disc space-y-2 pl-6 text-[14.5px]">{rev.map((d, i) => <li key={i}><b>{d.titulo}.</b> {d.detalle}</li>)}</ul></>)}
      <footer className="mt-10 border-t border-junta pt-4 text-xs leading-relaxed text-grafito">
        Generado con Axis, prototipo de apoyo a la revisión. Las observaciones son hallazgos para que el evaluador decida; no reemplazan su criterio ni constituyen pronunciamiento de la entidad. Antes de procesar el expediente se ocultaron {Object.values(g.ocultos).reduce((s, n) => s + n, 0)} datos personales.
        <div className="mt-10 grid grid-cols-2 gap-10 text-asfalto">
          <p className="border-t border-asfalto pt-1">Evaluador</p><p className="border-t border-asfalto pt-1">Fecha</p>
        </div>
      </footer>
    </article>
  );
}
