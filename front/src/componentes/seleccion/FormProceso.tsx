'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icono } from '../Icono';
import { SelectorArchivos, enviar as enviarArchivos } from '../SelectorArchivos';

// Datos del procedimiento de selección: los que publica el SEACE en el acta de
// otorgamiento de la buena pro y los que declara cada postor en su oferta.

interface IntegranteForm { nombre: string; ruc: string; participacion: string; experiencia: string; inicio: string }
interface PostorForm { nombre: string; oferta: string; puntajeTotal: string; puntajeTecnico: string; mype: boolean; domicilio: string; representante: string; personal: string; integrantes: IntegranteForm[]; telefono?: string; apoderados?: string[]; archivo?: string; avisos?: string[] }
interface ProcesoForm { nomenclatura: string; objeto: string; entidad: string; expedienteId: string; procedimiento: 'abreviada' | 'licitacion'; valorReferencial: string; fechaBuenaPro: string; minimoParticipacion: string; postores: PostorForm[] }

const integranteVacio = (): IntegranteForm => ({ nombre: '', ruc: '', participacion: '100', experiencia: '', inicio: '' });
const postorVacio = (): PostorForm => ({ nombre: '', oferta: '', puntajeTotal: '', puntajeTecnico: '', mype: false, domicilio: '', representante: '', personal: '', integrantes: [integranteVacio()] });

interface OfertaLeida { postor: { nombre: string; oferta: number; puntajeTotal?: number; mype: boolean; domicilio?: string; representante?: string; telefono?: string; apoderados?: string[]; archivo?: string; integrantes: { nombre: string; ruc: string; participacion: number; inicio?: string }[] }; avisos: string[] }

export function FormProceso({ expedientes, inicial, subidaDirecta = false }: { expedientes: { id: string; clave: string; nombre: string }[]; inicial?: { expedienteId: string }; subidaDirecta?: boolean }) {
  const router = useRouter();
  const base = expedientes.find((x) => x.id === inicial?.expedienteId);
  const [f, setF] = useState<ProcesoForm>(() => ({
    nomenclatura: '', objeto: base?.nombre ?? '', entidad: '', expedienteId: base?.id ?? '', procedimiento: 'abreviada', valorReferencial: '', fechaBuenaPro: '', minimoParticipacion: '', postores: [],
  }));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [ofertas, setOfertas] = useState<File[]>([]);
  const [leyendo, setLeyendo] = useState('');
  const [manual, setManual] = useState(false);

  const leerOfertas = async () => {
    setError('');
    try {
      const { ofertas: leidas } = await enviarArchivos<{ ofertas: OfertaLeida[] }>('/api/procesos/ofertas', ofertas, { valorReferencial: f.valorReferencial }, subidaDirecta, setLeyendo);
      setF((x) => ({
        ...x,
        postores: leidas.map(({ postor: p, avisos }) => ({
          nombre: p.nombre, oferta: p.oferta ? p.oferta.toFixed(2) : '', puntajeTotal: p.puntajeTotal != null ? String(p.puntajeTotal) : '', puntajeTecnico: '',
          mype: p.mype, domicilio: p.domicilio ?? '', representante: p.representante ?? '', personal: '', telefono: p.telefono, apoderados: p.apoderados, archivo: p.archivo, avisos,
          integrantes: p.integrantes.map((m) => ({ nombre: m.nombre, ruc: m.ruc, participacion: String(m.participacion), experiencia: '', inicio: m.inicio ?? '' })),
        })),
      }));
      setOfertas([]);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setLeyendo('');
    }
  };

  const cambiar = (c: Partial<ProcesoForm>) => setF((x) => ({ ...x, ...c }));
  const cambiarPostor = (i: number, c: Partial<PostorForm>) => setF((x) => ({ ...x, postores: x.postores.map((p, j) => (j === i ? { ...p, ...c } : p)) }));
  const cambiarIntegrante = (i: number, k: number, c: Partial<IntegranteForm>) => cambiarPostor(i, { integrantes: f.postores[i].integrantes.map((m, j) => (j === k ? { ...m, ...c } : m)) });

  const enviar = async () => {
    setEnviando(true);
    setError('');
    try {
      const cuerpo = {
        ...f,
        postores: f.postores.map((p) => ({
          ...p, personal: p.personal,
          integrantes: p.integrantes.map((m) => ({ ...m, participacion: Number(m.participacion), experiencia: Number(m.experiencia || 0) })),
        })),
      };
      const r = await fetch('/api/procesos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error ?? 'No se pudo analizar el proceso.');
      router.push(`/seleccion/${datos.id}`);
    } catch (x) {
      setError((x as Error).message);
      setEnviando(false);
    }
  };

  const campo = (etiqueta: string, valor: string, alCambiar: (v: string) => void, opciones: { tipo?: string; ayuda?: string; ancho?: boolean } = {}) => (
    <label className={`campo${opciones.ancho ? ' campo-ancho' : ''}`}>
      <span>{etiqueta}</span>
      <input type={opciones.tipo ?? 'text'} value={valor} onChange={(x) => alCambiar(x.target.value)} />
      {opciones.ayuda && <small>{opciones.ayuda}</small>}
    </label>
  );

  return (
    <section className="content-panel form-proceso" aria-labelledby="titulo-form">
      <div className="form-proceso-head">
        <div><h2 id="titulo-form">Datos del procedimiento</h2><p>Del acta de buena pro y de las ofertas publicadas en el SEACE.</p></div>
      </div>
      <div className="campos">
        {campo('Nomenclatura', f.nomenclatura, (v) => cambiar({ nomenclatura: v }))}
        <label className="campo"><span>Expediente técnico</span>
          <select value={f.expedienteId} onChange={(x) => { const e = expedientes.find((y) => y.id === x.target.value); cambiar({ expedienteId: x.target.value, objeto: e?.nombre ?? f.objeto }); }}>
            <option value="">Sin vincular</option>
            {expedientes.map((e) => <option key={e.id} value={e.id}>{e.clave} · {e.nombre}</option>)}
          </select>
        </label>
        {campo('Objeto', f.objeto, (v) => cambiar({ objeto: v }), { ancho: true })}
        {campo('Entidad', f.entidad, (v) => cambiar({ entidad: v }), { ayuda: 'Con el nombre exacto del SEACE, Axis mide la concentración de adjudicaciones.' })}
        <label className="campo"><span>Procedimiento</span>
          <select value={f.procedimiento} onChange={(x) => cambiar({ procedimiento: x.target.value as ProcesoForm['procedimiento'] })}>
            <option value="abreviada">Licitación pública abreviada</option>
            <option value="licitacion">Licitación pública sin modalidad</option>
          </select>
          <small>Cambia cómo se resuelve un empate (art. 81).</small>
        </label>
        {campo('Valor referencial (S/)', f.valorReferencial, (v) => cambiar({ valorReferencial: v }), { tipo: 'number', ayuda: 'Monto del expediente aprobado. Las ofertas válidas van del 95 % al 110 %.' })}
        {campo('Fecha de la buena pro', f.fechaBuenaPro, (v) => cambiar({ fechaBuenaPro: v }), { tipo: 'date' })}
        {campo('% mínimo por consorciado en las bases', f.minimoParticipacion, (v) => cambiar({ minimoParticipacion: v }), { tipo: 'number', ayuda: 'Solo si las bases lo fijaron (art. 72.3 d).' })}
      </div>

      <h3 className="form-subtitulo">Ofertas de los postores</h3>
      <p className="form-ayuda">Sube la oferta de cada postor tal como llegó por el SEACE (un PDF por postor). Axis lee el Anexo 1, la vigencia de poder, la promesa de consorcio (Anexo 4) y la oferta económica (Anexo 6).</p>
      <SelectorArchivos archivos={ofertas} alCambiar={setOfertas} titulo="Arrastra las ofertas aquí" ayuda="Un PDF o Word por postor" />
      {ofertas.length > 0 && (
        <div className="upload-actions">
          <button type="button" className="btn primary" disabled={!!leyendo} onClick={leerOfertas}><Icono nombre={leyendo ? 'clock' : 'files'} tamano={18} />{leyendo || `Leer ${ofertas.length} oferta${ofertas.length > 1 ? 's' : ''}`}</button>
        </div>
      )}
      {!f.postores.length && !manual && <button type="button" className="text-link" onClick={() => { setManual(true); cambiar({ postores: [postorVacio()] }); }}>O ingresa los postores a mano</button>}

      {f.postores.length > 0 && <h3 className="form-subtitulo">Postores <span>{f.postores.length}</span>{f.postores.some((p) => p.archivo) && <small>Leídos de las ofertas: revisa y corrige si hace falta.</small>}</h3>}
      <ol className="postores-form">
        {f.postores.map((p, i) => (
          <li key={i}>
            {p.avisos && p.avisos.length > 0 && <ul className="avisos-oferta">{p.avisos.map((a) => <li key={a}><Icono nombre="alert" tamano={14} />{a}</li>)}</ul>}
            <div className="postor-form-head">
              <strong>Postor {i + 1}{p.archivo && <small className="mono"> · {p.archivo}</small>}</strong>
              {f.postores.length > 1 && <button type="button" className="text-link" onClick={() => cambiar({ postores: f.postores.filter((_, j) => j !== i) })}>Quitar</button>}
            </div>
            <div className="campos">
              {campo('Nombre del postor o consorcio', p.nombre, (v) => cambiarPostor(i, { nombre: v }), { ancho: true })}
              {campo('Oferta (S/)', p.oferta, (v) => cambiarPostor(i, { oferta: v }), { tipo: 'number' })}
              {campo('Puntaje total', p.puntajeTotal, (v) => cambiarPostor(i, { puntajeTotal: v }), { tipo: 'number' })}
              {campo('Puntaje técnico', p.puntajeTecnico, (v) => cambiarPostor(i, { puntajeTecnico: v }), { tipo: 'number', ayuda: 'Si las bases lo tienen.' })}
              <label className="campo campo-check"><input type="checkbox" checked={p.mype} onChange={(x) => cambiarPostor(i, { mype: x.target.checked })} /><span>Micro o pequeña empresa</span></label>
              {campo('Domicilio declarado', p.domicilio, (v) => cambiarPostor(i, { domicilio: v }))}
              {campo('Representante legal', p.representante, (v) => cambiarPostor(i, { representante: v }))}
              {campo('Teléfono', p.telefono ?? '', (v) => cambiarPostor(i, { telefono: v }))}
              {campo('Apoderados (vigencia de poder)', (p.apoderados ?? []).join(', '), (v) => cambiarPostor(i, { apoderados: v.split(',').map((x) => x.trim()).filter(Boolean) }))}
            </div>
            <table className="integrantes">
              <caption>{p.integrantes.length > 1 ? 'Integrantes del consorcio' : 'Empresa (agrega integrantes si es consorcio)'}</caption>
              <thead><tr><th>Nombre</th><th>RUC</th><th>% participación</th><th>Experiencia (S/)</th><th>Inicio de actividades</th><th><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                {p.integrantes.map((m, k) => (
                  <tr key={k}>
                    <td><input aria-label="Nombre" value={m.nombre} onChange={(x) => cambiarIntegrante(i, k, { nombre: x.target.value })} /></td>
                    <td><input aria-label="RUC" inputMode="numeric" maxLength={11} value={m.ruc} onChange={(x) => cambiarIntegrante(i, k, { ruc: x.target.value })} /></td>
                    <td><input aria-label="% participación" type="number" value={m.participacion} onChange={(x) => cambiarIntegrante(i, k, { participacion: x.target.value })} /></td>
                    <td><input aria-label="Experiencia" type="number" value={m.experiencia} onChange={(x) => cambiarIntegrante(i, k, { experiencia: x.target.value })} /></td>
                    <td><input aria-label="Inicio de actividades" type="date" value={m.inicio} onChange={(x) => cambiarIntegrante(i, k, { inicio: x.target.value })} /></td>
                    <td>{p.integrantes.length > 1 && <button type="button" className="icon-btn" aria-label="Quitar integrante" onClick={() => cambiarPostor(i, { integrantes: p.integrantes.filter((_, j) => j !== k) })}><Icono nombre="close" tamano={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="text-link" onClick={() => cambiarPostor(i, { integrantes: [...p.integrantes, { ...integranteVacio(), participacion: '' }] })}><Icono nombre="plus" tamano={15} />Agregar integrante</button>
          </li>
        ))}
      </ol>
      {f.postores.length > 0 && <button type="button" className="btn secondary" onClick={() => cambiar({ postores: [...f.postores, postorVacio()] })}><Icono nombre="plus" tamano={17} />Agregar postor</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="upload-actions">
        <button type="button" className="btn primary" disabled={enviando || !f.postores.length} onClick={enviar}><Icono nombre={enviando ? 'clock' : 'arrow'} tamano={18} />{enviando ? 'Analizando postores…' : 'Analizar postores'}</button>
      </div>
      <p className="inline-note"><Icono nombre="lock" tamano={15} /> Las sanciones y penalidades se cruzan con los datos abiertos del OECE (10,627 proveedores con antecedentes) y el historial con 1,410 obras de La Libertad (OCDS).</p>
    </section>
  );
}
