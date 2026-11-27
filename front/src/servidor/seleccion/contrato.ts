import type { EjecucionMotor, FilaExperiencia, Fuente, ProcesoSeleccion, SenalSeleccion, VerificacionGanador } from '@/dominio/tipos';
import { fechaCorta } from '@/dominio/fechas';
import { aNumero, normalizar } from '../analisis/numeros';
import { citar, compactar } from '../texto';
import type { DatosCompetencia } from './antecedentes';

// Verificación de los documentos que el ganador presenta para firmar el contrato
// (bases estándar: los requisitos de calificación declarados bajo juramento se acreditan
// para la suscripción). Coteja el Anexo 11 de experiencia con las constancias, con las
// fechas de constitución de cada integrante y con el SEACE. Es la verificación posterior
// del art. 83: si hay inexactitud, la entidad puede declarar la nulidad y avisa al Tribunal.

export interface DocumentoLeido { nombre: string; unidad: string; paginas: string[] }

const soles = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => normalizar(s).replace(/[^A-Z0-9]+/g, ' ').trim();
const clave = (s: string) => normalizar(s).replace(/[^A-Z0-9]/g, '');
const MONTO = /(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,}\.\d{2})/;
const FECHA = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;

function aIso(d: string): string { const [a, b, c] = d.split('/'); return `${c}-${b}-${a}`; }

/** Mismo nombre de empresa, aunque uno esté recortado o sin «S.A.C.». */
function mismaEmpresa(a: string, b: string) {
  const x = norm(a).replace(/\b(S A C|SAC|E I R L|EIRL|S A|SA|S R L|SRL)\b/g, '').trim();
  const y = norm(b).replace(/\b(S A C|SAC|E I R L|EIRL|S A|SA|S R L|SRL)\b/g, '').trim();
  return !!x && !!y && (x.startsWith(y) || y.startsWith(x));
}

export function leerExperiencia(docs: DocumentoLeido[]): { filas: FilaExperiencia[]; total?: number } {
  const filas: FilaExperiencia[] = [];
  let total: number | undefined;
  for (const d of docs) {
    d.paginas.forEach((pag) => {
      if (!/EXPERIENCIA DEL POSTOR/.test(normalizar(pag))) return;
      for (const l of pag.split('\n')) {
        const celdas = l.split('|').map((c) => compactar(c));
        if (/MONTO FACTURADO ACUMULADO/.test(normalizar(l))) { const m = l.match(MONTO); if (m) total = aNumero(m[1]); continue; }
        if (celdas.length < 4 || !/^\d{1,2}$/.test(celdas[0])) continue;
        const fechas = [...l.matchAll(FECHA)].map((m) => aIso(m[0]));
        const monto = celdas[celdas.length - 1].match(MONTO);
        if (!monto) continue;
        const contrato = celdas.find((c, i) => i > 1 && /[A-Z0-9]+-\d{4}|\d{2,}-\d{4}/i.test(c) && !/\d{2}\/\d{2}\/\d{4}/.test(c)) ?? '';
        const integrante = celdas[celdas.length - 2] && !/\d{2}\/\d{2}\/\d{4}/.test(celdas[celdas.length - 2]) ? celdas[celdas.length - 2] : '';
        filas.push({ n: Number(celdas[0]), cliente: celdas[1], contrato, fecha: fechas[0], conformidad: fechas[1], integrante, monto: aNumero(monto[1]) });
      }
    });
  }
  return { filas, total };
}

interface Constancia { contrato: string; monto?: number; contratista?: string; fuente: Fuente }

export function leerConstancias(docs: DocumentoLeido[]): Constancia[] {
  const out: Constancia[] = [];
  for (const d of docs) {
    d.paginas.forEach((pag, i) => {
      const n = normalizar(pag);
      if (!/CONSTANCIA|ACTA DE RECEPCION|CERTIFICADO DE CONFORMIDAD|CONFORMIDAD DE OBRA/.test(n) || /EXPERIENCIA DEL POSTOR/.test(n)) return;
      const lineas = pag.split('\n');
      const campo = (re: RegExp) => lineas.find((l) => re.test(normalizar(l)) && l.includes(':'))?.split(':').slice(1).join(':').trim();
      const contrato = campo(/^CONTRATO/) ?? /CONTRATO N[°º]?\s*([A-Z0-9/-]+)/i.exec(pag)?.[1];
      if (!contrato) return;
      const montoTxt = campo(/MONTO/);
      const m = montoTxt?.match(MONTO);
      const linea = lineas.find((l) => /MONTO/i.test(l)) ?? lineas[0];
      out.push({ contrato: compactar(contrato), monto: m ? aNumero(m[1]) : undefined, contratista: campo(/^CONTRATISTA/), fuente: { documento: d.nombre, pagina: citar(d.unidad, i + 1), extracto: compactar(linea).slice(0, 200) } });
    });
  }
  return out;
}

export function verificarGanador(p: ProcesoSeleccion, docs: DocumentoLeido[], comp: DatosCompetencia): VerificacionGanador {
  const ejecucion: EjecucionMotor[] = [];
  const medir = <T,>(motor: string, nota: (r: T) => string, f: () => T): T => {
    const t = performance.now();
    const r = f();
    ejecucion.push({ motor, estado: 'ok', ms: Math.round(performance.now() - t), nota: nota(r) });
    return r;
  };
  const g = p.postores.find((x) => x.id === p.resultado.ganador);
  const senales: SenalSeleccion[] = [];
  const agregar = (s: Omit<SenalSeleccion, 'id' | 'postor'>) => senales.push({ ...s, postor: g?.id, id: `V-${String(senales.length + 1).padStart(2, '0')}` });
  const { filas, total } = medir('experiencia-anexo11', (r) => `${r.filas.length} obra(s) declaradas${r.total ? `, acumulado ${soles(r.total)}` : ''}.`, () => leerExperiencia(docs));
  const constancias = medir('constancias', (r: Constancia[]) => `${r.length} constancia(s) o acta(s) leídas.`, () => leerConstancias(docs));

  if (!filas.length) {
    agregar({ nivel: 'media', titulo: 'No se encontró el Anexo 11 de experiencia', detalle: 'Axis no pudo leer las obras declaradas como experiencia del postor.', accion: 'Revisar que el ganador haya presentado su experiencia en la especialidad.', base: 'Bases estándar, numeral 3.6 y Reglamento, art. 72.3 c', fuente: 'Documentos para el contrato' });
  }

  medir('cotejo-experiencia', () => 'Montos, fechas, constancias y SEACE.', () => {
    const suma = filas.reduce((s, f) => s + f.monto, 0);
    if (total && Math.abs(suma - total) / total > 0.005) {
      agregar({ nivel: 'media', titulo: `El acumulado declarado no es la suma de las obras`, detalle: `Las ${filas.length} obras del Anexo 11 suman ${soles(suma)}, pero el postor declara un acumulado de ${soles(total)} (diferencia de ${soles(Math.abs(total - suma))}).`, accion: 'Calificar con la suma real de lo acreditado, no con el acumulado declarado.', base: 'Reglamento, art. 72.3 c y art. 83', fuente: 'Anexo 11' });
    }
    for (const f of filas) {
      const c = constancias.find((x) => clave(x.contrato) === clave(f.contrato));
      if (c) f.constancia = { monto: c.monto, contratista: c.contratista, fuente: c.fuente };
      const integrante = g?.integrantes.find((m) => mismaEmpresa(m.nombre, f.integrante));

      // SEACE: si el contrato es una nomenclatura conocida, ¿la ganó este integrante?
      const proceso = comp.procesos.find((x) => clave(x.nomenclatura) === clave(f.contrato));
      if (proceso) {
        const rucs = new Set([integrante?.ruc]);
        for (const [cons, ms] of Object.entries(comp.miembros ?? {})) if (ms.some((m) => m.ruc === integrante?.ruc)) rucs.add(cons);
        const gano = proceso.ganadores.some((x) => rucs.has(x));
        f.seace = { coincide: gano, detalle: gano ? `El SEACE registra a ${f.integrante} como ganador de ${proceso.nomenclatura}.` : `El SEACE registra a otro proveedor como ganador de ${proceso.nomenclatura} (${proceso.entidad}, ${fechaCorta(proceso.fecha)}), ni a ${f.integrante} ni a un consorcio que lo incluya.` };
        if (!gano) agregar({ nivel: 'alta', titulo: `Obra ${f.n}: el SEACE registra otro ganador`, detalle: `${f.integrante} declara como experiencia ${proceso.nomenclatura} por ${soles(f.monto)}. ${f.seace.detalle}`, accion: 'Pedir el contrato y la constancia de esa obra a la entidad que la convocó. Si no la ejecutó, es información inexacta: corresponde declarar la nulidad y comunicarlo al Tribunal.', base: 'Reglamento, art. 83.2 y 83.3', fuente: 'OECE – Contrataciones Abiertas (OCDS)' });
      }

      if (!c) {
        agregar({ nivel: 'media', titulo: `Obra ${f.n} sin constancia`, detalle: `${f.cliente}, contrato ${f.contrato} (${soles(f.monto)}): no llegó la constancia, acta de recepción o conformidad que la respalde.`, accion: 'No considerar esta obra como experiencia acreditada hasta que se presente el documento.', base: 'Bases estándar (acreditación de requisitos para la suscripción del contrato)', fuente: 'Anexo 11' });
      } else {
        if (c.monto && Math.abs(c.monto - f.monto) / f.monto > 0.01) {
          agregar({ nivel: 'alta', titulo: `Obra ${f.n}: el monto declarado no coincide con la constancia`, detalle: `En el Anexo 11 declara ${soles(f.monto)} por el contrato ${f.contrato}, pero la constancia dice ${soles(c.monto)} (${c.monto < f.monto ? 'infla' : 'difiere en'} ${soles(Math.abs(f.monto - c.monto))}).`, accion: 'Es información inexacta: confirmar con la entidad que emitió la constancia. De comprobarse, corresponde la nulidad de la buena pro o del contrato y comunicarlo al Tribunal.', base: 'Reglamento, art. 83.2 y 83.3', fuente: `${c.fuente.documento}, ${c.fuente.pagina}` });
        }
        if (c.contratista && f.integrante && !mismaEmpresa(c.contratista, f.integrante)) {
          agregar({ nivel: 'alta', titulo: `Obra ${f.n}: la constancia es de otra empresa`, detalle: `El Anexo 11 la atribuye a ${f.integrante}, pero la constancia la emite a nombre de ${c.contratista}.`, accion: 'Solo cuenta la experiencia de quien la ejecutó. Verificar con la entidad emisora.', base: 'Reglamento, art. 72.3 c y art. 83', fuente: `${c.fuente.documento}, ${c.fuente.pagina}` });
        }
      }
      if (integrante?.inicio && f.fecha && f.fecha < integrante.inicio) {
        agregar({ nivel: 'alta', titulo: `Obra ${f.n}: contrato anterior a la constitución de la empresa`, detalle: `${f.integrante} declara un contrato del ${fechaCorta(f.fecha)}, pero se constituyó el ${fechaCorta(integrante.inicio)} (vigencia de poder de su oferta). No pudo ejecutar esa obra.`, accion: 'Es información inexacta o de otra persona jurídica: corresponde la nulidad y comunicarlo al Tribunal.', base: 'Reglamento, art. 83.2 y 83.3', fuente: 'Anexo 11 y vigencia de poder' });
      }
    }

    // Quién aporta la experiencia frente a quién tiene la participación (con montos acreditados).
    if (g && g.integrantes.length > 1 && filas.length) {
      const porIntegrante = g.integrantes.map((m) => ({ m, monto: filas.filter((f) => mismaEmpresa(m.nombre, f.integrante)).reduce((s, f) => s + f.monto, 0) }));
      const totalExp = porIntegrante.reduce((s, x) => s + x.monto, 0);
      const mayor = porIntegrante.sort((a, b) => b.monto - a.monto)[0];
      if (totalExp && mayor.monto / totalExp >= 0.7 && mayor.m.participacion <= 20) {
        agregar({ nivel: 'media', titulo: `La experiencia la pone el socio con ${mayor.m.participacion} % de participación`, detalle: `${mayor.m.nombre} aporta ${soles(mayor.monto)} (${Math.round((mayor.monto / totalExp) * 100)} % de la experiencia declarada) con el ${mayor.m.participacion} % de las obligaciones. ${g.integrantes.filter((m) => m !== mayor.m).map((m) => `${m.nombre} tiene el ${m.participacion} %`).join('; ')}.`, accion: 'Es legal si las bases no fijan un mínimo. Verificar con más cuidado las constancias de ese socio y, para las próximas bases, fijar un % mínimo para quien acredita la experiencia (art. 72.3 d).', base: 'Reglamento, art. 72.3 c y d', fuente: 'Anexo 11 y promesa de consorcio' });
      }
    }
  });

  return { creada: new Date().toISOString(), documentos: docs.map((d) => ({ nombre: d.nombre, paginas: d.paginas.length })), filas, totalDeclarado: total, senales, ejecucion };
}
