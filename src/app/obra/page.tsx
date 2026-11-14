'use client';
import Link from 'next/link';
import { useState } from 'react';
import { borradorDesdeHallazgo, type SugerenciaCausa } from '@/lib/analisis/aprendizaje';
import { actualizar, useSesion, type HallazgoRegistrado } from '@/lib/sesion';

import { CabeceraPagina, EstadoVacio } from '@/components/ui';
import { IconoBucle, IconoCheck } from '@/components/iconos';

const CAUSAS = ['Interferencias', 'Estudios básicos', 'Metrados', 'Especificaciones técnicas', 'Planos', 'Presupuesto y precios', 'Cronograma', 'Factibilidades y terreno', 'Normativa'];
const LUGARES = [
  { nombre: 'Av. Jaime Blanco, El Porvenir', lat: -8.077054, lng: -78.996063 },
  { nombre: 'Calle Los Incas, El Porvenir', lat: -8.086, lng: -78.9948 },
  { nombre: 'Av. España, Trujillo', lat: -8.1105, lng: -79.0225 },
];
const EJEMPLO = { obra: 'Reparación de calzada, Av. Jaime Blanco', descripcion: 'Al excavar la zanja para el sardinel encontramos una tubería de desagüe existente que no figuraba en los planos ni en el estudio de interferencias.', fuente: 'Asiento N° 23 del cuaderno de obra', lugar: 0 };

export default function Obra() {
  const { rol, hallazgos, pruebas } = useSesion();
  const puedeRegistrar = rol === 'supervisor';
  const puedeValidar = rol === 'curador';
  return (
    <div>
      <CabeceraPagina titulo="Lo que una obra enseña a la siguiente" descripcion="Registra un hallazgo, valida su causa y conviértelo en una prueba para expedientes cercanos. Así se amplía la memoria de Axis con la experiencia de campo." />
      <ol className="learning-steps" aria-label="Ciclo de aprendizaje">{[['Registrar', 'El supervisor documenta el hallazgo.'], ['Clasificar', 'Axis sugiere una causa.'], ['Validar', 'El curador revisa y activa la prueba.'], ['Aplicar', 'Se revisan los expedientes cercanos.']].map(([t, d], i) => <li key={t}><span>{i + 1}</span><div><strong>{t}</strong><p>{d}</p></div></li>)}</ol>
      <div className="role-notice"><IconoBucle className="h-5 w-5" /><div><h2>{puedeRegistrar ? 'Estás en el paso de registro' : puedeValidar ? 'Estás en el paso de validación' : 'Explora el ciclo de aprendizaje'}</h2><p>{puedeRegistrar ? 'Documenta lo que apareció en obra. Puedes cargar el ejemplo para recorrer la demostración.' : puedeValidar ? 'Revisa la causa, ajusta el radio de aplicación y decide qué hallazgos se convierten en pruebas.' : 'Cambia de perfil para registrar un hallazgo o validar una prueba. Los cambios se guardan solo en tu navegador.'}</p></div><div className="flex flex-wrap gap-2">{!puedeRegistrar && <button className="boton-borde" onClick={() => actualizar((s) => ({ ...s, rol: 'supervisor' }))}>Probar como supervisor</button>}{!puedeValidar && hallazgos.length > 0 && <button className="boton-principal" onClick={() => actualizar((s) => ({ ...s, rol: 'curador' }))}>Pasar a curador</button>}</div></div>
      {puedeRegistrar && <Formulario numero={hallazgos.length + 1} />}
      <section className="mt-12" aria-labelledby="registrados">
        <h2 id="registrados" className="scroll-mt-28 text-xl font-semibold">Registrados ({hallazgos.length})</h2>
        {hallazgos.length === 0 && <div className="mt-5"><EstadoVacio titulo="Aquí empieza la próxima lección" texto={puedeRegistrar ? 'Registra el primer hallazgo con el formulario. También puedes llenarlo con el ejemplo de una tubería que no figuraba en los planos.' : 'Todavía no hay hallazgos en este navegador. Prueba el perfil de supervisor para registrar el primero.'} /></div>}
        <ul className="mt-4 space-y-4">
          {hallazgos.slice().reverse().map((h) => <Tarjeta key={h.id} h={h} puedeValidar={puedeValidar} validada={pruebas.find((p) => p.hallazgo.id === h.id && p.estado === 'validada')?.id} />)}
        </ul>
      </section>
    </div>
  );
}

function Formulario({ numero }: { numero: number }) {
  const [obra, setObra] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fuente, setFuente] = useState('');
  const [lugar, setLugar] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [registrado, setRegistrado] = useState(false);
  async function registrar(e: React.FormEvent) {
    e.preventDefault(); setError(''); setRegistrado(false); setEnviando(true);
    try {
      const r = await fetch('/api/clasificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: descripcion, tipo: 'hallazgo' }) });
      const s = (await r.json()) as SugerenciaCausa & { error?: string };
      if (!r.ok) throw new Error(s.error);
      const l = LUGARES[lugar];
      const h: HallazgoRegistrado = { id: `H-${Date.now()}`, obra, descripcion, ubicacion: { lat: l.lat, lng: l.lng }, fecha: new Date().toISOString().slice(0, 10), fuente, causa: s.causa, fuenteCausa: s.fuente === 'regla de campo' ? `regla de campo: ${s.motivo}` : `modelo${s.probabilidad ? `, ${Math.round(s.probabilidad * 100)}% de confianza` : ''}` };
      h.prueba = borradorDesdeHallazgo({ ...h }, s.causa, numero); // copia: sin referencias circulares (se guarda en el navegador)
      actualizar((x) => ({ ...x, hallazgos: [...x.hallazgos, h] }));
      setObra(''); setDescripcion(''); setFuente(''); setRegistrado(true);
      requestAnimationFrame(() => document.getElementById('registrados')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    } catch (err) { setError(`No se pudo registrar: ${(err as Error).message}`); } finally { setEnviando(false); }
  }
  const usarEjemplo = () => { setObra(EJEMPLO.obra); setDescripcion(EJEMPLO.descripcion); setFuente(EJEMPLO.fuente); setLugar(EJEMPLO.lugar); };
  return (
    <form onSubmit={registrar} className="finding-form mt-8 hoja max-w-4xl space-y-5 p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold">Registrar un hallazgo</h2>
        <button type="button" onClick={usarEjemplo} className="boton-borde text-xs">Llenar con un ejemplo</button>
      </div>
      <label className="block"><span className="rotulo">Obra</span><input required placeholder="Nombre de la obra" className="campo mt-1" value={obra} onChange={(e) => setObra(e.target.value)} /></label>
      <label className="block"><span className="rotulo">Qué encontraste</span><textarea required minLength={20} rows={3} className="campo mt-1" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Describe el hecho como en el cuaderno de obra" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="rotulo">Dónde</span>
          <select className="campo mt-1" value={lugar} onChange={(e) => setLugar(Number(e.target.value))}>{LUGARES.map((l, i) => <option key={l.nombre} value={i}>{l.nombre}</option>)}</select>
        </label>
        <label className="block"><span className="rotulo">Fuente</span><input required className="campo mt-1" value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="Asiento del cuaderno de obra, informe…" /></label>
      </div>
      {registrado && <p role="status" className="flex items-center gap-2 rounded-lg bg-pasa-tenue p-3 text-sm text-pasa"><IconoCheck className="h-4 w-4" />Hallazgo registrado. Cambia al perfil de curador para validar su prueba.</p>}
      {error && <p role="alert" className="text-sm text-falla">{error}</p>}
      <button className="boton-principal" disabled={enviando}>{enviando ? 'Registrando…' : 'Registrar hallazgo'}</button>
    </form>
  );
}

function Tarjeta({ h, puedeValidar, validada }: { h: HallazgoRegistrado; puedeValidar: boolean; validada?: string }) {
  const [causa, setCausa] = useState(h.causa ?? 'Interferencias');
  const [radio, setRadio] = useState(h.prueba?.radio ?? 200);
  function validar() {
    if (!Number.isFinite(radio) || radio < 50 || radio > 1000) return;
    const { prueba: _borrador, causa: _c, fuenteCausa: _f, ...hallazgo } = h;
    const base = borradorDesdeHallazgo(hallazgo, causa, Number(h.prueba?.id.slice(2)) || 1);
    const prueba = { ...base, radio, estado: 'validada' as const, curador: 'Curador (demo)', fechaValidacion: new Date().toISOString().slice(0, 10) };
    actualizar((x) => ({ ...x, pruebas: [...x.pruebas.filter((p) => p.hallazgo.id !== h.id), prueba] }));
  }
  const retirar = () => actualizar((x) => ({ ...x, pruebas: x.pruebas.filter((p) => p.hallazgo.id !== h.id) }));
  return (
    <li className="hoja p-5 sm:p-6">
      <p className="text-xs font-semibold text-grafito">{h.fecha}, {h.fuente}</p>
      <p className="mt-1 font-bold">{h.obra}</p>
      <p className="mt-1 max-w-texto text-[15px] leading-relaxed">«{h.descripcion}»</p>
      <p className="mt-2 text-sm text-asfalto-suave">Causa sugerida: <b className="text-asfalto">{h.causa}</b> ({h.fuenteCausa})</p>
      {h.prueba && <p className="mt-1 max-w-texto text-sm text-asfalto-suave">Prueba propuesta: {h.prueba.nombre.toLowerCase()}. Alertará a expedientes a menos de {radio} m que no tengan partidas de {h.prueba.palabrasPartida.slice(0, 3).join(', ') || 'esa condición'} ni lo traten en sus estudios.</p>}
      {validada ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-bold text-pasa">Validada como {validada}</span>
          <Link href="/revisar?demo=1" className="enlace">Aplicar a Calle Santa Clara (a 183 m)</Link>
          {puedeValidar && <button onClick={retirar} className="text-grafito underline underline-offset-2">Retirar</button>}
        </div>
      ) : puedeValidar ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-dashed border-junta pt-3">
          <label className="text-sm"><span className="rotulo">Causa</span><select className="campo mt-1" value={causa} onChange={(e) => setCausa(e.target.value)}>{CAUSAS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-sm"><span className="rotulo">Radio (m)</span><input type="number" min={50} max={1000} step={50} className="campo mt-1 w-28" value={radio} onChange={(e) => setRadio(Number(e.target.value))} /></label>
          <button onClick={validar} disabled={!Number.isFinite(radio) || radio < 50 || radio > 1000} className="boton-principal">Validar como prueba</button>
        </div>
      ) : <p className="mt-2 text-sm font-semibold text-grafito">Pendiente de validación por el curador.</p>}
    </li>
  );
}
