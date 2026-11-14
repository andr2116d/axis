'use client';
// La herramienta: subir (o probar el ejemplo) → confirmar partes (solo si son archivos propios) → revisión → resultado.
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { clasificacionDe, fuera, leerArchivos, obrasDistintas, type Bloque, type Lectura } from '@/lib/lectura';
import { NOMBRE_DOCUMENTO, pareceBases, type Documento } from '@/lib/analisis/nombres';
import { guardarAnalisis, leerAnalisis, useSesion } from '@/lib/sesion';
import type { AnalisisCliente } from '@/lib/tipos-cliente';
import { DEMOS } from '@/lib/demos';
import { VERIFICADORES } from '@/data/verificadores';
import { Resultados } from './Resultados';
import { COLOR_DOC, IconoAlerta, IconoCandado, IconoCheck, IconoDocumento, IconoPdf, IconoSubir, IconoFlecha, IconoChevron } from './iconos';

const N_PRUEBAS = VERIFICADORES.filter((v) => v.tipo !== 'proveedor').length;
const REQUERIDOS: Documento[] = ['memoria', 'presupuesto', 'metrados', 'apu', 'gastos', 'especificaciones', 'cronograma', 'formula', 'suelos', 'planos'];
const OPCIONES: Documento[] = [...REQUERIDOS, 'cotizaciones', 'caratula', 'otro'];
const nombreDoc = (d: Documento) => (d === 'caratula' ? 'Carátula o datos generales' : d === 'otro' ? 'No es del expediente (no usar)' : NOMBRE_DOCUMENTO[d]);

type Fase =
  | { tipo: 'elegir'; modo?: 'subir' }
  | { tipo: 'leyendo'; archivos: string[]; archivo: number; actual: number; total: number; ocultos: number; ocr?: boolean }
  | { tipo: 'partes'; lectura: Lectura; editar?: boolean }
  | { tipo: 'ajeno'; lectura: Lectura }
  | { tipo: 'revisando'; lectura: Lectura; analisis: AnalisisCliente | null; error?: string }
  | { tipo: 'listo'; nombre: string; analisis: AnalisisCliente; ocultos: Record<string, number>; paginas: number };

export function FlujoRevision({ portada = false }: { portada?: boolean }) {
  const { rol, pruebas } = useSesion();
  const [fase, setFase] = useState<Fase>({ tipo: 'elegir' });
  const [error, setError] = useState('');

  async function leer(archivos: { nombre: string; datos: ArrayBuffer }[], demo: boolean) {
    setError('');
    const nombres = archivos.map((a) => a.nombre);
    setFase({ tipo: 'leyendo', archivos: nombres, archivo: 0, actual: 0, total: 0, ocultos: 0 });
    window.scrollTo({ top: 0 });
    try {
      const lectura = await leerArchivos(archivos, (archivo, actual, total, ocultos, ocr) => setFase({ tipo: 'leyendo', archivos: nombres, archivo, actual, total, ocultos, ocr }));
      if (lectura.archivos.every((a) => a.sinTexto)) {
        setFase({ tipo: 'elegir' });
        setError('No se pudo leer texto en los PDF, ni con OCR. Prueba con el expediente en formato digital (el que exporta S10, Excel o Word).');
        return;
      }
      // El ejemplo no pide confirmar partes: va directo a la revisión
      if (demo) revisar(lectura, false);
      // Nada de lo subido es de un expediente de obra: no se revisa (un CV "sin observaciones" no significa nada)
      else if (lectura.pertinencia.nivel === 'ajeno') setFase({ tipo: 'ajeno', lectura });
      else setFase({ tipo: 'partes', lectura, editar: lectura.pertinencia.nivel === 'dudoso' });
    } catch (e) {
      setFase({ tipo: 'elegir' });
      const mensaje = (e as Error).message || '';
      const cargaInterfaz = /Loading (?:CSS )?chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(mensaje);
      setError(cargaInterfaz ? 'Falta cargar una parte de la aplicación. Actualiza la pestaña y vuelve a intentarlo. Tus archivos siguen en tu equipo.' : `No se pudo leer el archivo (${mensaje}). Comprueba que sea un PDF que se abra normalmente.`);
    }
  }
  async function revisar(lectura: Lectura, parcial: boolean) {
    setFase({ tipo: 'revisando', lectura, analisis: null });
    window.scrollTo({ top: 0 });
    try {
      const res = await fetch('/api/analizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        paginas: lectura.paginas.map((p) => ({ numero: p.numero, lineas: p.lineas })), clasificacion: clasificacionDe(lectura.bloques), parcial,
        partesIndicadas: lectura.bloques.some((b) => !b.auto && REQUERIDOS.includes(b.documento)),
        aprendidas: pruebas.filter((p) => p.estado === 'validada'),
      }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `error ${res.status}`);
      setFase({ tipo: 'revisando', lectura, analisis: (await res.json()) as AnalisisCliente });
    } catch (e) {
      setFase({ tipo: 'revisando', lectura, analisis: null, error: `La revisión no se completó (${(e as Error).message}). Vuelve a intentarlo.` });
    }
  }
  function terminar(lectura: Lectura, analisis: AnalisisCliente) {
    const nombre = lectura.archivos.length === 1 ? lectura.archivos[0].nombre.replace(/\.pdf$/i, '') : `Expediente subido en ${lectura.archivos.length} archivos`;
    const listo = { tipo: 'listo' as const, nombre, analisis, ocultos: lectura.ocultos, paginas: lectura.paginas.length };
    guardarAnalisis(listo); setFase(listo); window.scrollTo({ top: 0 });
  }
  const abrirDemo = async (i: number) => {
    const d = DEMOS[i];
    setError('');
    setFase({ tipo: 'leyendo', archivos: [d.titulo], archivo: 0, actual: 0, total: 0, ocultos: 0 });
    try {
      const res = await fetch(d.archivo);
      if (!res.ok) throw new Error('El PDF de ejemplo no está disponible');
      await leer([{ nombre: d.titulo, datos: await res.arrayBuffer() }], true);
    } catch { setFase({ tipo: 'elegir' }); setError('No se pudo abrir el ejemplo. Comprueba la conexión y vuelve a intentarlo.'); }
  };

  const faseEnfocada = useRef(fase.tipo);
  useEffect(() => {
    if (faseEnfocada.current === fase.tipo) return;
    faseEnfocada.current = fase.tipo;
    const frame = requestAnimationFrame(() => {
      const titulo = document.querySelector<HTMLElement>('#contenido h1');
      if (titulo) {
        titulo.tabIndex = -1;
        titulo.classList.add('flow-heading-focus');
        titulo.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [fase.tipo]);

  const reanudar = () => {
    const guardado = leerAnalisis<Extract<Fase, { tipo: 'listo' }>>();
    if (guardado?.analisis) { setFase({ ...guardado, tipo: 'listo' }); window.scrollTo({ top: 0 }); }
  };

  // ?demo=N abre directamente el ejemplo N
  const arrancado = useRef(false);
  useEffect(() => {
    if (arrancado.current) return; arrancado.current = true;
    const q = new URLSearchParams(window.location.search);
    if (q.has('reanudar')) {
      const guardado = leerAnalisis<Extract<Fase, { tipo: 'listo' }>>();
      if (guardado?.analisis) setFase({ ...guardado, tipo: 'listo' });
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (q.has('demo') && DEMOS[Number(q.get('demo'))]) { window.history.replaceState(null, '', window.location.pathname); abrirDemo(Number(q.get('demo'))); }
  });

  if (fase.tipo === 'elegir') return <Elegir modoInicial={fase.modo} portada={portada} rol={rol} error={error} alDemo={abrirDemo} alReanudar={reanudar} alError={setError}
    alSubir={(fs) => Promise.all(fs.map(async (f) => ({ nombre: f.name, datos: await f.arrayBuffer() }))).then((a) => leer(a, false)).catch(() => setError('No se pudieron abrir los archivos. Vuelve a seleccionarlos.'))} />;
  return (
    <div>
      {fase.tipo !== 'listo' && fase.tipo !== 'ajeno' && <Progreso paso={fase.tipo === 'revisando' ? 1 : 0} />}
      {fase.tipo === 'leyendo' && <Leyendo f={fase} />}
      {fase.tipo === 'ajeno' && <Ajeno lectura={fase.lectura} alVolver={() => setFase({ tipo: 'elegir' })} alDemo={() => abrirDemo(0)} alIndicar={() => setFase({ tipo: 'partes', lectura: fase.lectura, editar: true })} />}
      {fase.tipo === 'partes' && <Partes lectura={fase.lectura} editarAlInicio={!!fase.editar} alVolver={() => setFase({ tipo: 'elegir' })} alRevisar={revisar} />}
      {fase.tipo === 'revisando' && <Revisando lectura={fase.lectura} analisis={fase.analisis} error={fase.error} alTerminar={() => fase.analisis && terminar(fase.lectura, fase.analisis)} alVolver={() => setFase({ tipo: 'elegir' })} />}
      {fase.tipo === 'listo' && <Resultados {...fase} rol={rol} alVolver={(modo) => setFase({ tipo: 'elegir', modo })} />}
    </div>
  );
}

function Progreso({ paso }: { paso: number }) {
  return <ol className="review-progress no-imprimir" aria-label="Avance de la revisión">{['Documentos', 'Análisis', 'Resultados'].map((p, i) => <li key={p} aria-current={i === paso ? 'step' : undefined}><span className={`step-number ${i < paso ? 'step-done' : ''}`}>{i < paso ? <IconoCheck className="h-3.5 w-3.5" /> : i + 1}</span><span>{p}</span></li>)}</ol>;
}

const ESCENARIOS = [
  { etiqueta: 'Con observaciones', nombre: 'Calle Los Incas', descripcion: 'Encuentra diferencias entre el presupuesto, los metrados y las especificaciones.' },
  { etiqueta: 'Sin observaciones', nombre: 'Calle Santa Clara', descripcion: 'Revisa un expediente consistente y su relación con el terreno.' },
  { etiqueta: 'Incompleto', nombre: 'Pasaje Los Rosales', descripcion: 'Distingue los documentos que faltan de lo que todavía no se puede comprobar.' },
];
function Elegir({ modoInicial, portada, error, alDemo, alSubir, alError, alReanudar }: { modoInicial?: 'subir'; portada: boolean; rol: string; error: string; alDemo: (i: number) => void; alReanudar: () => void; alSubir: (f: File[]) => void; alError: (e: string) => void }) {
  const [arrastrando, setArrastrando] = useState(false);
  const [ejemplo, setEjemplo] = useState(0);
  const [modo, setModo] = useState<'ejemplo' | 'subir'>(modoInicial ?? 'ejemplo');
  const [anterior, setAnterior] = useState(false);
  useEffect(() => { setAnterior(!!leerAnalisis<{ analisis: unknown }>()?.analisis); }, []);
  const tomar = (lista: FileList | null) => {
    const fs = Array.from(lista ?? []);
    if (!fs.length) return;
    if (fs.some((f) => !/\.pdf$/i.test(f.name))) { alError('Selecciona únicamente archivos PDF. Puedes subir el expediente completo o varios documentos a la vez.'); return; }
    if (fs.some((f) => !f.size)) { alError('Uno de los archivos está vacío. Comprueba los PDF y vuelve a seleccionarlos.'); return; }
    alSubir(fs);
  };
  const modos = [{ id: 'ejemplo', texto: 'Probar un ejemplo' }, { id: 'subir', texto: 'Subir mis PDF' }] as const;
  const elegido = ESCENARIOS[ejemplo];
  return <div className="review-start">
    <header className="home-heading">
      <div>
        <h1>El eje que mantiene <span>todo en su lugar.</span></h1>
        <p>Revisa tu expediente con evidencia de obras anteriores. Para proyectos de pistas y veredas en La Libertad.</p>
      </div>
      <Image src="/axis-cubo.svg" width={144} height={148} alt="" className="home-cube" unoptimized />
    </header>
    {anterior && <div className="resume-review"><span>Tienes una revisión guardada.</span><button onClick={alReanudar} className="enlace">Continuar revisión<IconoFlecha className="h-4 w-4" /></button></div>}
    {error && <p role="alert" className="mb-6 flex items-start gap-2 rounded-lg border border-falla-borde bg-falla-tenue px-4 py-3 text-base text-falla"><IconoAlerta className="mt-0.5 h-5 w-5 shrink-0" />{error}</p>}
    {error.startsWith('Falta cargar una parte de la aplicación') && <button className="boton-borde mb-6" onClick={() => window.location.reload()}>Actualizar aplicación</button>}
    <div className="start-workspace">
      <div className="start-tabs" role="tablist" aria-label="Cómo iniciar la revisión">{modos.map((m, i) => <button key={m.id} id={`inicio-${m.id}`} role="tab" aria-selected={modo === m.id} aria-controls={`opcion-${m.id}`} tabIndex={modo === m.id ? 0 : -1} onClick={() => { setModo(m.id); alError(''); }} onKeyDown={(e) => {
        const n = ['ArrowRight', 'ArrowLeft'].includes(e.key) ? 1 - i : e.key === 'Home' ? 0 : e.key === 'End' ? 1 : -1;
        if (n >= 0) { e.preventDefault(); setModo(modos[n].id); alError(''); document.getElementById(`inicio-${modos[n].id}`)?.focus(); }
      }}>{m.id === 'ejemplo' ? <IconoDocumento d="memoria" className="h-5 w-5" /> : <IconoSubir className="h-5 w-5" />}{m.texto}</button>)}</div>
      <section id="opcion-ejemplo" role="tabpanel" aria-labelledby="inicio-ejemplo" hidden={modo !== 'ejemplo'} className="start-panel">
        <label htmlFor="ejemplo" className="rotulo">Expediente de ejemplo</label>
        <select id="ejemplo" className="campo demo-select" value={ejemplo} onChange={(e) => setEjemplo(Number(e.target.value))}>{ESCENARIOS.map((e, i) => <option key={e.nombre} value={i}>{e.etiqueta}</option>)}</select>
        <div className="demo-context" aria-live="polite"><p>{elegido.descripcion}</p><span>{elegido.nombre} · PDF ficticio · {DEMOS[ejemplo].lugar}</span></div>
        <div className="demo-file-actions"><button onClick={() => alDemo(ejemplo)} className="boton-principal">Revisar ejemplo<IconoFlecha className="h-4 w-4" /></button><a href={DEMOS[ejemplo].archivo} target="_blank" rel="noreferrer" className="enlace" aria-label={`Abrir PDF de ${elegido.nombre} en otra pestaña`}>Ver PDF<IconoPdf className="h-4 w-4" /></a></div>
      </section>
      <section id="opcion-subir" role="tabpanel" aria-labelledby="inicio-subir" hidden={modo !== 'subir'} className="start-panel">
        <label className={`upload-zone ${arrastrando ? 'dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastrando(false); }} onDrop={(e) => { e.preventDefault(); setArrastrando(false); tomar(e.dataTransfer.files); }}>
          <IconoSubir /><strong>Selecciona o arrastra tus PDF</strong><span>El expediente completo o varios documentos</span><span className="boton-borde">Seleccionar archivos</span><input type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label="Seleccionar archivos PDF del expediente" aria-describedby="privacidad-pdf" onChange={(e) => { tomar(e.target.files); e.target.value = ''; }} />
        </label><p id="privacidad-pdf" className="upload-privacy"><IconoCandado />El PDF se lee en tu navegador. Los datos personales se ocultan antes de enviar el texto.</p>
      </section>
    </div>
    <p className="start-note"><IconoCheck className="h-4 w-4" />Consulta las pruebas y sus fuentes.</p>
    {portada && <details className="source-story"><summary>¿De dónde salen las pruebas?<IconoChevron className="h-4 w-4" /></summary><div><h2>De errores documentados en obras anteriores.</h2><p>En el presupuesto de la Av. Jaime Blanco (El Porvenir), el total en números y en letras difiere en S/ 20,000. Ese antecedente se convirtió en una prueba para futuros expedientes.</p><p className="source-reference">Bases integradas del SEACE · CUI 2735216.</p><Link href="/pruebas#V-LETRAS" className="enlace">Ver la prueba y su origen<IconoFlecha className="h-4 w-4" /></Link></div></details>}
  </div>;
}

/* ---------- Leyendo ---------- */
function Leyendo({ f }: { f: Extract<Fase, { tipo: 'leyendo' }> }) {
  return (
    <div className="tarjeta mx-auto max-w-2xl p-6 sm:p-8">
      <p role="status" className="sr-only">Leyendo archivo {f.archivo + 1} de {f.archivos.length}.</p>
      <h1 className="text-2xl font-bold">Leyendo el expediente</h1>
      <p className="mt-1 text-gris">En tu navegador; nada sale de tu equipo todavía.</p>
      <ul className="mt-6 space-y-4">
        {f.archivos.map((n, i) => {
          const estado = i < f.archivo ? 'listo' : i === f.archivo ? 'leyendo' : 'espera';
          const parte = estado === 'listo' ? 1 : estado === 'leyendo' && f.total ? f.actual / f.total : 0;
          return (
            <li key={n + i} className="flex items-center gap-3">
              <IconoPdf className={`h-6 w-6 shrink-0 ${estado === 'espera' ? 'text-borde' : 'text-primario'}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{n}</p>
                <div role="progressbar" aria-label={`Lectura de ${n}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={estado === 'listo' || f.total ? Math.round(parte * 100) : undefined} aria-valuetext={estado === 'listo' ? 'Leído' : estado === 'espera' ? 'En espera' : f.total ? `Página ${f.actual} de ${f.total}` : 'Preparando lectura'} className="mt-1.5 h-2 overflow-hidden rounded-full bg-fondo"><div className="h-full rounded-full bg-primario transition-[width] duration-200" style={{ width: `${Math.max(estado === 'espera' ? 0 : 4, parte * 100)}%` }} /></div>
              </div>
              <span className="w-20 shrink-0 text-right sm:w-36 text-xs tabular-nums text-gris">{estado === 'leyendo' && f.total ? `${f.ocr ? 'escaneo: OCR, ' : ''}pág. ${f.actual} de ${f.total}` : estado === 'listo' ? 'leído' : ''}</span>
            </li>
          );
        })}
      </ul>
      {f.ocr && <p className="mt-6 rounded-lg bg-primario-claro px-4 py-3 text-sm text-primario">Esta página es un escaneo: se está leyendo con reconocimiento de texto (OCR) en tu navegador. Toma unos segundos por página.</p>}
      <p className="mt-6 flex items-center gap-2 rounded-lg bg-pasa-tenue px-4 py-3 text-sm text-pasa">
        <IconoCandado className="h-5 w-5 shrink-0" />
        <span><b className="tabular-nums">{f.ocultos}</b> datos personales ocultados (nombres, DNI, teléfonos, correos).</span>
      </p>
    </div>
  );
}

/* ---------- Lo subido no es un expediente ---------- */
function Ajeno({ lectura, alVolver, alDemo, alIndicar }: { lectura: Lectura; alVolver: () => void; alDemo: () => void; alIndicar: () => void }) {
  return (
    <div className="tarjeta mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-bold">Esto no parece un expediente técnico de obra</h1>
      <p className="mt-2 text-base leading-relaxed text-tinta-2">Antes de revisar, Axis comprueba que lo que subiste sea de una obra. No encontró presupuesto, metrados, especificaciones ni nada que se pueda revisar, así que no corrió ninguna prueba.</p>
      <ul className="mt-5 space-y-2">
        {lectura.archivos.map((a, i) => <li key={a.nombre + i} className="flex items-start gap-3 rounded-lg border border-borde px-4 py-3 text-sm"><IconoPdf className="mt-0.5 h-5 w-5 shrink-0 text-gris" /><span><b className="break-all">{a.nombre}</b><span className="block text-tinta-2">{a.pertinencia.motivo}</span></span></li>)}
      </ul>
      <div className="mt-5 rounded-lg bg-fondo p-4 text-sm leading-relaxed">
        <p className="font-bold">Axis revisa expedientes técnicos de obra, por ejemplo:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-tinta-2"><li>el presupuesto con sus partidas (exportado de S10 o Excel),</li><li>la planilla de metrados, los análisis de precios y las especificaciones técnicas,</li><li>la memoria descriptiva, el cronograma, la fórmula polinómica o el estudio de suelos.</li></ul>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={alVolver} className="boton-principal">Elegir otros archivos</button>
        <button onClick={alDemo} className="boton-borde">Probar con un ejemplo</button>
        <button onClick={alIndicar} className="ml-auto min-h-[44px] text-sm font-bold text-gris underline-offset-4 hover:text-tinta hover:underline">Sí es de un expediente: indicar sus partes</button>
      </div>
    </div>
  );
}

/* ---------- Confirmar partes (solo archivos propios) ---------- */
function Partes({ lectura, editarAlInicio, alVolver, alRevisar }: { lectura: Lectura; editarAlInicio: boolean; alVolver: () => void; alRevisar: (l: Lectura, parcial: boolean) => void }) {
  const [bloques, setBloques] = useState<Bloque[]>(lectura.bloques);
  const [editar, setEditar] = useState(editarAlInicio);
  const dejados = lectura.archivos.map((a, i) => ({ a, motivo: fuera(lectura.archivos, i) })).filter((x) => x.motivo);
  const distintas = obrasDistintas(lectura);
  const presentes = new Set(bloques.map((b) => b.documento));
  const encontrados = REQUERIDOS.filter((d) => presentes.has(d));
  const [parcial, setParcial] = useState(lectura.archivos.length > 1 || encontrados.length <= 2);
  const bases = pareceBases(lectura.paginas.map((p) => ({ numero: p.numero, lineas: p.lineas })));
  const escaneados = lectura.archivos.filter((a) => a.sinTexto);
  const cambiar = (id: string, d: Documento) => setBloques((bs) => bs.map((b) => (b.id === id ? { ...b, documento: d, auto: false } : b)));
  const ir = () => alRevisar({ ...lectura, bloques }, parcial);
  return (
    <div className="tarjeta mx-auto max-w-3xl p-6 sm:p-8">
      <h1 className="text-2xl font-bold">{encontrados.length ? 'Encontramos estas partes' : 'Indica qué es cada parte'}</h1>
      <p className="mt-1 text-gris">{lectura.paginas.length} páginas en {lectura.archivos.length} archivo{lectura.archivos.length > 1 ? 's' : ''}. {encontrados.length ? '¿Está bien?' : 'No reconocimos ninguna parte del expediente por su cuenta.'}</p>
      {bases && <Aviso>Parece que subiste <b>las bases del procedimiento</b>, no el expediente técnico. La revisión será limitada; si tienes el expediente, súbelo.</Aviso>}
      {lectura.archivos.some((a) => a.paginasOcr > 0) && <Aviso>{lectura.archivos.filter((a) => a.paginasOcr > 0).map((a) => `${a.nombre} (${a.paginasOcr} pág.)`).join(', ')}: {lectura.archivos.filter((a) => a.paginasOcr > 0).length > 1 ? 'eran escaneos y se leyeron' : 'era un escaneo y se leyó'} con OCR. Si algunos números quedaron ilegibles, Axis lo dirá en vez de inventar.</Aviso>}
      {lectura.pertinencia.nivel === 'dudoso' && encontrados.length === 0 && <Aviso><b>No reconocimos ninguna parte del expediente.</b> {lectura.pertinencia.motivo} Si sí es un expediente, indica abajo qué es cada grupo de páginas; si no, elige otros archivos.</Aviso>}
      {dejados.length > 0 && <Aviso>{dejados.map(({ a, motivo }) => <span key={a.nombre} className="block"><b>{a.nombre}</b>: {motivo === 'repetido' ? 'es el mismo archivo que otro que subiste. Se usa una sola vez.' : `${a.pertinencia.motivo} No se usará.`}</span>)}</Aviso>}
      {distintas.length > 0 && <Aviso><b>Estos archivos parecen de obras distintas:</b> {distintas.map((x) => `${x.nombre} (CUI ${x.cui})`).join(', ')}. Comprueba que todos sean del mismo expediente antes de revisar.</Aviso>}
      {escaneados.length > 0 && <Aviso>{escaneados.map((a) => a.nombre).join(', ')} {escaneados.length > 1 ? 'no tienen' : 'no tiene'} texto legible ni con OCR. Pide la versión digital.</Aviso>}
      <ul className="mt-6 flex flex-wrap gap-2">
        {encontrados.map((d) => <li key={d} className="inline-flex items-center gap-1.5 rounded-full bg-primario-claro px-3 py-1.5 text-sm font-bold text-primario"><IconoCheck className="h-4 w-4" />{NOMBRE_DOCUMENTO[d]}</li>)}
        {!encontrados.length && <li id="sin-partes" className="text-sm text-gris">Para revisar hace falta al menos una parte del expediente (por ejemplo, el presupuesto). Indícala en «Corregir las partes».</li>}
      </ul>
      {encontrados.length < REQUERIDOS.length && (
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg bg-fondo p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primario" checked={parcial} onChange={(e) => setParcial(e.target.checked)} />
          <span><b>Solo subí algunas partes.</b> <span className="text-tinta-2">Lo que falta no se marcará como error. Desmárcalo si este es el expediente completo.</span></span>
        </label>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={ir} className="boton-principal" disabled={!encontrados.length} aria-describedby={!encontrados.length ? 'sin-partes' : undefined}>Sí, revisar</button>
        <button onClick={() => setEditar(!editar)} className="boton-borde" aria-expanded={editar}>{editar ? 'Listo' : 'Corregir las partes'}</button>
        <button onClick={alVolver} className="ml-auto min-h-[44px] text-sm font-bold text-gris hover:text-tinta">Elegir otros archivos</button>
      </div>
      {editar && (
        <div className="mt-8 space-y-6 border-t border-borde pt-6">
          {lectura.archivos.map((a, i) => {
            const bs = bloques.filter((b) => b.archivo === i);
            return (
              <div key={a.nombre + i}>
                <p className="flex items-center gap-2 text-sm font-bold"><IconoPdf className="h-5 w-5 text-primario" />{a.nombre}</p>
                <ul className="mt-2 divide-y divide-borde rounded-lg border border-borde">
                  {bs.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: COLOR_DOC[b.documento] }} aria-hidden />
                      <IconoDocumento d={b.documento} className="h-5 w-5 shrink-0 text-gris" />
                      <span className="w-32 text-sm tabular-nums text-gris">{b.desde === b.hasta ? `Página ${b.desde}` : `Páginas ${b.desde} a ${b.hasta}`}</span>
                      <select aria-label={`Qué es: páginas ${b.desde} a ${b.hasta}`} value={b.documento} onChange={(e) => cambiar(b.id, e.target.value as Documento)} className="campo max-w-full basis-full py-2 text-base font-medium sm:w-auto sm:flex-1 sm:basis-auto sm:text-sm">
                        {OPCIONES.map((d) => <option key={d} value={d}>{nombreDoc(d)}</option>)}
                      </select>
                      {b.auto && b.nota && <span className="text-xs text-gris">{b.nota}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function Aviso({ children }: { children: React.ReactNode }) {
  return <p role="status" className="mt-5 flex items-start gap-3 rounded-lg border border-aviso-borde bg-aviso-tenue px-4 py-3 text-sm leading-relaxed text-tinta"><IconoAlerta className="mt-0.5 h-5 w-5 shrink-0 text-aviso" /><span>{children}</span></p>;
}

/* ---------- Revisando ---------- */
function etapas(a: AnalisisCliente | null) {
  const f = (pref: string) => a?.detecciones.filter((d) => d.verificador.startsWith(pref) && d.resultado === 'falla').length ?? 0;
  const t = a?.terreno;
  return [
    { t: 'Presupuesto', r: a ? `${a.conteos.partidas} partidas leídas` : '' },
    { t: 'Metrados, precios y especificaciones', r: a ? `${a.conteos.metrados} metrados, ${a.conteos.apus} análisis de precios` : '' },
    { t: 'Cronograma y plazo', r: a ? (a.conteos.actividades ? `${a.conteos.actividades} actividades` : 'no hay cronograma') : '' },
    { t: 'La calle en el mapa y en el terreno', r: a ? (t?.perfil ? `${t.via.nombreOsm}, pendiente de ${(t.perfil.pendienteMedia * 100).toFixed(1)}%` : 'sin ubicación') : '' },
    { t: 'Redes de agua, peligros y entorno', r: a ? (f('C-') ? `${f('C-')} hallazgo${f('C-') > 1 ? 's' : ''} en la zona` : 'nada que alerte') : '' },
  ];
}
function Revisando({ lectura, analisis, error, alTerminar, alVolver }: { lectura: Lectura; analisis: AnalisisCliente | null; error?: string; alTerminar: () => void; alVolver: () => void }) {
  const [paso, setPaso] = useState(0);
  const lista = etapas(analisis);
  const hecho = useRef(false);
  useEffect(() => { const t = setInterval(() => setPaso((p) => Math.min(p + 1, lista.length)), 450); return () => clearInterval(t); }, [lista.length]);
  useEffect(() => { if (analisis && paso >= lista.length && !hecho.current) { hecho.current = true; const t = setTimeout(alTerminar, 700); return () => { clearTimeout(t); hecho.current = false; }; } }, [analisis, paso, lista.length, alTerminar]);
  return (
    <div className="tarjeta mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-bold">Revisando {lectura.paginas.length} páginas con {N_PRUEBAS} pruebas</h1>
      <p className="mt-1 text-gris">Cada prueba nació de un error real en una obra de La Libertad.</p>
      {error ? (
        <div className="mt-6"><p role="alert" className="rounded-lg border border-falla-borde bg-falla-tenue px-4 py-3 text-sm text-falla">{error}</p><button onClick={alVolver} className="boton-borde mt-4">Volver</button></div>
      ) : (
        <ol className="mt-6 space-y-1" aria-label="Comprobaciones del expediente">
          {lista.map((e, i) => {
            const listo = i < paso && analisis;
            const activo = !listo && i <= paso;
            return (
              <li key={e.t} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${activo ? 'bg-primario-claro' : ''}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${listo ? 'bg-primario text-sobre-enfasis' : activo ? 'border-2 border-primario' : 'border border-borde'}`}>
                  {listo ? <IconoCheck className="h-4 w-4" /> : activo ? <span className="h-2 w-2 animate-pulse rounded-full bg-primario" /> : null}
                </span>
                <span className={`flex-1 font-bold ${i > paso ? 'text-gris' : ''}`}>{e.t}</span>
                {listo && <span className="text-right text-sm text-tinta-2">{e.r}</span>}
              </li>
            );
          })}
        </ol>
      )}
      {analisis && paso < lista.length && <button onClick={alTerminar} className="mt-4 min-h-[44px] text-sm font-bold text-primario">Ver el resultado ya</button>}
    </div>
  );
}
