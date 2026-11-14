'use client';
import { useEffect, useState } from 'react';
import type { Deteccion } from '@/lib/analisis/tipos-analisis';
import { CabeceraPagina, EstadoVacio, Resultado, Severidad, soles } from '@/components/ui';
import { IconoChevron, IconoEdificio, IconoLupa } from '@/components/iconos';

interface Verif { ruc: string; nombre: string | null; consorcio: boolean; integrantes: number | null; alertas: Deteccion[] }
interface Fila { proceso: string; nomenclatura: string; entidad: string; descripcion: string; tipo: string; montoReferencial: number | null; fechaConvocatoria: string; postores: number; cui: string | null; ganadores: { ruc: string; nombre: string | null; monto: number | null }[]; verificacion: Verif[] }
interface Respuesta { fuente: string; descargado: string; total: number; resumen: { adjudicaciones: number; consorcios: number; conAlertas: number }; pagina: number; filas: Fila[] }

const TIPOS: [string, string][] = [['', 'Todas las obras'], ['pistas_veredas', 'Pistas y veredas'], ['agua_saneamiento', 'Agua y saneamiento'], ['educacion', 'Educación'], ['vias_rurales', 'Vías rurales'], ['puentes', 'Puentes'], ['otros', 'Otras']];

export default function Ganadores() {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [solo, setSolo] = useState<'alertas' | ''>('alertas');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setCargando(true); setError('');
    const t = setTimeout(async () => {
      try {
        const u = new URLSearchParams({ q, tipo, solo, pagina: String(pagina) });
        const res = await fetch('/api/ganadores?' + u, { signal: controller.signal });
        if (!res.ok) throw new Error('No se pudo consultar');
        const respuesta = await res.json() as Respuesta;
        if (!controller.signal.aborted) setDatos(respuesta);
      } catch { if (!controller.signal.aborted) setError('No se pudieron cargar las obras. Comprueba la conexión y vuelve a intentarlo.'); }
      finally { if (!controller.signal.aborted) setCargando(false); }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, tipo, solo, pagina, intento]);
  const limpiar = () => { setQ(''); setTipo(''); setSolo(''); setPagina(1); };

  return (
    <div>
      <CabeceraPagina titulo="Ganadores y proveedores" descripcion="Explora las obras adjudicadas en La Libertad y los antecedentes de quienes las ejecutan. En los consorcios, Axis revisa también a los integrantes identificados." accion={<a href="#consulta-ruc" className="boton-borde"><IconoLupa className="h-4 w-4" />Consultar un RUC</a>} />
      <div className="source-notice"><IconoEdificio className="h-4 w-4" /><p>Obras de 2025 y 2026 · Registros públicos descargados del OECE. Las alertas requieren revisión y no constituyen una acusación.</p></div>
      <div className="filter-bar" id="filtros">
        <label className="block">
          <span className="rotulo">Buscar obra, entidad, CUI o proceso</span>
          <input className="campo mt-1" value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Por ejemplo: El Porvenir, 2735216" />
        </label>
        <label className="block">
          <span className="rotulo">Tipo</span>
          <select className="campo mt-1" value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1); }}>{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-asfalto" checked={solo === 'alertas'} onChange={(e) => { setSolo(e.target.checked ? 'alertas' : ''); setPagina(1); }} />
          Solo con alertas
        </label>
      </div>

      <div className="list-toolbar" aria-live="polite"><p>{cargando ? 'Buscando obras…' : error ? 'Consulta no disponible' : <><b>{datos?.total.toLocaleString('es-PE') ?? 0}</b> obras encontradas</>}</p>{(q || tipo || solo) && <button onClick={limpiar} className="enlace text-xs">Limpiar filtros</button>}</div>
      {error ? <div className="empty-state" role="alert"><p>{error}</p><button className="boton-borde mt-4" onClick={() => setIntento((n) => n + 1)}>Reintentar consulta</button></div> : cargando ? <div className="loading-list" aria-label="Cargando obras" role="status">{[0, 1, 2].map((n) => <div key={n}><span /><span /><span /></div>)}</div> : datos?.filas.length ? <ol className="award-list">{datos.filas.map((o) => <Obra key={o.proceso} o={o} />)}</ol> : <EstadoVacio titulo="No encontramos obras con esos filtros" texto="Prueba con otra entidad, el nombre de la obra o su CUI. También puedes ampliar la búsqueda quitando los filtros."><button onClick={limpiar} className="boton-borde">Ver todas las obras</button></EstadoVacio>}
      {datos && !cargando && !error && <p className="mt-4 text-xs text-gris">Fuente: {datos.fuente}. Descarga: {datos.descargado.slice(0, 10)}. {datos.resumen.adjudicaciones} adjudicaciones en los resultados; {datos.resumen.consorcios} a consorcios.</p>}
      {datos && !cargando && !error && datos.total > 25 && (
        <div className="pagination">
          <button className="boton-borde" disabled={pagina === 1} onClick={() => { setPagina(pagina - 1); document.getElementById('filtros')?.scrollIntoView({ block: 'start' }); }}>Anteriores</button>
          <span>Página {pagina} de {Math.ceil(datos.total / 25)}</span>
          <button className="boton-borde" disabled={pagina * 25 >= datos.total} onClick={() => { setPagina(pagina + 1); document.getElementById('filtros')?.scrollIntoView({ block: 'start' }); }}>Siguientes</button>
        </div>
      )}
      <ConsultaRuc />
    </div>
  );
}

function Obra({ o }: { o: Fila }) {
  const alertas = o.verificacion.flatMap((v) => v.alertas);
  return (
    <li className="award-row">
      <details className="group">
        <summary className="award-summary"><div>
          <p className="text-[15px] font-semibold leading-relaxed">{corto(o.descripcion)}</p>
          <p className="mt-1 text-sm text-asfalto-suave">{o.entidad}. {o.nomenclatura}{o.montoReferencial ? `, valor referencial ${soles(o.montoReferencial)}` : ''}.</p>
          <p className="mt-1 text-sm">
            Ganó <b>{o.ganadores.map((g) => g.nombre ?? `RUC ${g.ruc}`).join(' y ')}</b>
            {o.verificacion.some((v) => v.consorcio) && <span className="text-grafito"> (consorcio{o.verificacion[0].integrantes ? ` de ${o.verificacion[0].integrantes} integrantes` : ', integrantes por leer'})</span>}
            {alertas.length ? <span className="ml-2 font-bold text-falla">{alertas.length} alerta{alertas.length > 1 ? 's' : ''}</span> : <span className="ml-2 font-semibold text-pasa">sin alertas</span>}
          </p>
        </div><IconoChevron className="h-4 w-4 text-gris transition-transform group-open:rotate-90" /></summary>
        <div className="space-y-3 border-t border-junta px-4 py-3">
          {alertas.map((d, i) => (
            <div key={i}>
              <p className="flex flex-wrap items-center gap-2"><Resultado r={d.resultado} /><Severidad s={d.severidad} /><span className="font-bold">{d.titulo}</span></p>
              <p className="mt-1 max-w-texto text-sm leading-relaxed text-asfalto-suave">{d.detalle}</p>
              {d.evidencias[0] && <p className="mt-1 text-xs text-grafito">{d.evidencias.map((e) => `${e.documento}: ${e.extracto}`).join('; ')}</p>}
            </div>
          ))}
          {!alertas.length && <p className="text-sm text-asfalto-suave">No figura en los registros de sanciones, multas ni penalidades, y no hay señales en su historial de obras en La Libertad.</p>}
          <p className="text-xs text-grafito">Proceso SEACE {o.proceso}{o.cui ? `, CUI ${o.cui}` : ''}, convocado el {o.fechaConvocatoria}, {o.postores} participantes registrados.</p>
        </div>
      </details>
    </li>
  );
}

function ConsultaRuc() {
  const [ruc, setRuc] = useState('');
  const [r, setR] = useState<{ nombre: string | null; miembros: { ruc: string; nombre: string | null }[] | null; detecciones: Deteccion[]; error?: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  async function consultar(e: React.FormEvent) {
    e.preventDefault(); setCargando(true); setError(''); setR(null);
    try {
      const res = await fetch('/api/proveedor?ruc=' + encodeURIComponent(ruc));
      const datos = await res.json();
      if (!res.ok) throw new Error(datos.error ?? 'No se pudo consultar el proveedor.');
      setR(datos);
    } catch { setError('No se pudo consultar el proveedor. Comprueba la conexión e inténtalo de nuevo.'); }
    finally { setCargando(false); }
  }
  return (
    <section className="provider-lookup" id="consulta-ruc" aria-labelledby="ruc">
      <h2 id="ruc" className="text-xl font-extrabold">Verificar un proveedor por RUC</h2>
      <p className="mt-1 max-w-texto text-sm text-asfalto-suave">Consulta sus antecedentes a la fecha de hoy dentro de los registros descargados. No es una consulta en vivo al OECE.</p>
      <form onSubmit={consultar} className="mt-5 flex max-w-lg flex-wrap gap-3">
        <input className="campo min-w-0 flex-1" inputMode="numeric" maxLength={15} value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="RUC o código de consorcio" aria-label="RUC" />
        <button className="boton-principal shrink-0" disabled={cargando || ruc.replace(/\D/g, '').length < 6}>{cargando ? 'Consultando…' : 'Verificar'}</button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-falla">{error}</p>}
      {r && (
        <div className="mt-5 space-y-3" aria-live="polite">
          {r.error && <p className="text-sm text-falla">{r.error}</p>}
          {r.nombre && <p className="font-bold">{r.nombre}</p>}
          {r.miembros && <p className="text-sm text-asfalto-suave">Integrantes: {r.miembros.map((m) => (m.ruc ? `${m.nombre ?? 'persona natural'} (${m.ruc})` : 'una persona natural')).join('; ')}</p>}
          {r.detecciones?.map((d, i) => (
            <div key={i} className="text-sm"><p className="flex flex-wrap items-center gap-2"><Resultado r={d.resultado} /><b>{d.titulo}</b></p><p className="mt-0.5 max-w-texto text-asfalto-suave">{d.detalle}</p></div>
          ))}
        </div>
      )}
    </section>
  );
}

const corto = (s: string) => {
  const t = s.replace(/[¿"“”]/g, '').replace(/^(CONTRATACI[ÓO]N DE LA )?EJECUCI[ÓO]N DE (LA )?OBRA:?\s*/i, '').trim();
  const x = (t.charAt(0) + t.slice(1).toLowerCase()).replace(/\bioarr\b/gi, 'IOARR').replace(/\bcui\b/gi, 'CUI').replace(/\b(la libertad|trujillo|el porvenir|huamachuco)\b/g, (m) => m.replace(/(^|\s)\S/g, (c) => c.toUpperCase()));
  return x.length > 180 ? x.slice(0, 177) + '…' : x;
};
