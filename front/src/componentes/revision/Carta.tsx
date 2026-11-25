'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { DatosCarta, Expediente, Prioridad } from '@/dominio/tipos';
import { Icono } from '../Icono';
import { useAviso } from '../Aviso';
import { PRIORIDADES } from '../ui';
import { SEMAFORO, Semaforo } from '../Semaforo';
import { guardarCarta } from './guardar-carta';

// Carta de observaciones al proyectista: formal, numerada y con el sustento de cada punto.

const SECCIONES: [Prioridad, string, string][] = [
  ['alta', 'Observaciones que impiden la aprobación', 'Deben subsanarse antes de dar conformidad al expediente.'],
  ['media', 'Observaciones por corregir', 'Requieren corrección o sustento en la siguiente versión.'],
  ['confirmar', 'Información por confirmar', 'Se solicita aclarar o completar la información.'],
];

const hoy = () => new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

export function Carta({ expediente }: { expediente: Expediente }) {
  const e = expediente;
  const avisar = useAviso();
  const [incluidos, setIncluidos] = useState(() => new Set(e.carta.incluidos));
  const [datos, setDatos] = useState<DatosCarta>(() => ({
    entidad: 'Subgerencia de Estudios y Proyectos',
    numero: `${e.clave}-${new Date().getFullYear()}`,
    plazo: 10,
    ...e.carta,
    destinatario: e.carta.destinatario || 'Consultor responsable del expediente técnico',
  }));
  const pausa = useRef<ReturnType<typeof setTimeout>>(undefined);

  const elegidos = e.hallazgos.filter((h) => incluidos.has(h.id));
  const excluidos = e.hallazgos.filter((h) => !incluidos.has(h.id));
  let n = 0;
  const secciones = SECCIONES.map(([p, titulo, nota]) => ({ p, titulo, nota, items: elegidos.filter((h) => h.prioridad === p).map((h) => ({ h, n: ++n })) }))
    .filter((s) => s.items.length);

  const cambiar = (siguiente: Set<string>, mensaje: string) => {
    setIncluidos(siguiente);
    avisar(mensaje);
    guardarCarta(e.id, { incluidos: [...siguiente] }).catch(() => avisar('No se pudo guardar el cambio.'));
  };
  const editar = (campo: keyof DatosCarta, valor: string | number) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    clearTimeout(pausa.current);
    pausa.current = setTimeout(() => guardarCarta(e.id, { [campo]: valor }).catch(() => avisar('No se pudo guardar.')), 500);
  };
  const campo = (id: keyof DatosCarta, etiqueta: string, tipo: 'text' | 'number' = 'text') => (
    <label className="campo-carta" key={id}>
      <span>{etiqueta}</span>
      <input type={tipo} min={1} max={60} value={String(datos[id] ?? '')} onChange={(x) => editar(id, tipo === 'number' ? Number(x.target.value) : x.target.value)} />
    </label>
  );

  return (
    <>
      <div className="report-actions"><Link href={`/revision/${e.id}`} className="back"><Icono nombre="back" tamano={17} /> Volver a la revisión</Link></div>
      <section className="page-lead report-lead">
        <div><h1>Carta de observaciones</h1><p>Revisa el texto, quita lo que no quieras enviar y descárgala en PDF.</p></div>
        {elegidos.length > 0 && <button type="button" className="btn primary" onClick={() => window.print()}><Icono nombre="print" tamano={18} />Imprimir o guardar PDF</button>}
      </section>
      <div className="report-layout">
        <article className="report-sheet carta">
          <header className="letter-header">
            <div className="carta-entidad"><b>{datos.entidad}</b><span>Revisión de expediente técnico de obra</span></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/axis-logo.svg" alt="AXIS" width={96} height={30} />
          </header>
          <p className="carta-fecha">{e.lugar ? `${e.lugar.split(',')[0]}, ` : ''}{hoy()}</p>
          <p className="carta-numero"><b>CARTA N.° {datos.numero}</b></p>
          <p className="carta-destino">Señor(a):<br /><b>{datos.destinatario}</b><br />Presente.–</p>
          <dl className="carta-ref">
            <div><dt>Asunto</dt><dd>Observaciones al expediente técnico de la obra «{e.nombre}»</dd></div>
            <div><dt>Referencia</dt><dd>Expediente {e.clave}{e.documentos.length ? `, ${e.documentos.length} documento(s) presentados` : ''}</dd></div>
          </dl>
          <p>De mi consideración:</p>
          <p>
            Por medio de la presente se comunica el resultado de la revisión del expediente técnico de la referencia.
            {elegidos.length
              ? ` Se han identificado ${elegidos.length} punto(s) que deben atenderse. Cada observación indica el documento y la página que la sustentan, y lo que se solicita.`
              : ' No se identificaron observaciones que comunicar.'}
          </p>
          <div className={`carta-resultado resultado-${e.semaforo}`}>
            <Semaforo estado={e.semaforo} tamano="chico" />
            <div><b>Resultado de la revisión: {SEMAFORO[e.semaforo].titulo}</b><span>{SEMAFORO[e.semaforo].texto}</span></div>
          </div>

          {secciones.map((s) => (
            <section key={s.p} className={`letter-section letter-${s.p}`} id={`carta-${s.p}`} tabIndex={-1}>
              <h3><Icono nombre={PRIORIDADES[s.p].icono} tamano={20} /> {s.titulo}<span>{s.items.length}</span></h3>
              <p className="carta-nota">{s.nota}</p>
              <ol className="carta-lista">
                {s.items.map(({ h, n: numero }) => (
                  <li key={h.id} value={numero}>
                    <div className="letter-row-heading">
                      <h4>{numero}. {h.titulo}</h4>
                      <button type="button" className="btn letter-remove" aria-label={`Quitar de la carta: ${h.titulo}`}
                        onClick={() => { const x = new Set(incluidos); x.delete(h.id); cambiar(x, 'Observación retirada de la carta.'); }}>
                        <Icono nombre="close" tamano={15} /> Quitar
                      </button>
                    </div>
                    <p className="letter-detail">{h.detalle}</p>
                    {h.fuentes.length > 0 && (
                      <div className="carta-sustento"><b>Sustento</b>
                        <ul>{h.fuentes.slice(0, 3).map((f, i) => <li key={i}>{f.documento}, {f.pagina}{f.extracto ? <>: <q>{f.extracto.slice(0, 180)}</q></> : null}</li>)}</ul>
                      </div>
                    )}
                    <div className="letter-request"><strong>Se solicita</strong><p>{h.solicitud ?? h.accion}</p></div>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          {elegidos.length > 0 && (
            <p className="carta-cierre">
              Se otorga un plazo de <b>{datos.plazo} días hábiles</b>, contados desde la recepción de la presente, para levantar las observaciones y presentar el expediente corregido, indicando en cada caso el folio donde se subsanó.
            </p>
          )}
          <p>Atentamente,</p>
          <div className="carta-firma">
            <span className="linea-firma" />
            <b>{datos.evaluador || 'Nombre del evaluador'}</b>
            <span>{datos.cargo || 'Evaluador de expedientes técnicos'}</span>
            <span>{datos.entidad}</span>
          </div>
          <p className="carta-pie">Revisión asistida por Axis: {e.pruebas ? `${e.pruebas.aplicadas} pruebas aplicadas de ${e.pruebas.total}` : 'pruebas aprendidas de obras reales'}. Cada observación fue confirmada por el evaluador antes de incluirla.</p>
        </article>

        <aside className="report-sidebar">
          <section className="content-panel report-controls">
            <h2>Datos de la carta</h2>
            {campo('entidad', 'Entidad u oficina')}
            {campo('numero', 'Número de carta')}
            {campo('destinatario', 'Destinatario')}
            {campo('evaluador', 'Evaluador')}
            {campo('cargo', 'Cargo')}
            {campo('plazo', 'Plazo para subsanar (días hábiles)', 'number')}
            <h2 className="carta-subtitulo">Contenido</h2>
            <p><b>{elegidos.length}</b> de {e.hallazgos.length} observaciones incluidas.</p>
            {excluidos.length > 0 && (
              <details className="removed-findings" open={!elegidos.length}>
                <summary>Excluidas ({excluidos.length})</summary>
                <ul>
                  {excluidos.map((h) => (
                    <li key={h.id}><span>{h.titulo}</span>
                      <button type="button" className="text-link" aria-label={`Reincorporar: ${h.titulo}`} onClick={() => cambiar(new Set(incluidos).add(h.id), 'Observación reincorporada.')}>Reincorporar</button>
                    </li>
                  ))}
                </ul>
                {excluidos.length > 1 && <button type="button" className="btn secondary" onClick={() => cambiar(new Set(e.hallazgos.map((h) => h.id)), 'Todas las observaciones están en la carta.')}><Icono nombre="check" tamano={18} />Reincorporar todas</button>}
              </details>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
