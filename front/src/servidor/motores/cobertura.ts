import type { TipoDocumento } from '@/dominio/tipos';
import type { MotorExpediente } from './tipos';

// Motor «Cobertura documental». Compara lo que llegó con el contenido mínimo del
// expediente técnico de obra y avisa qué comprobaciones no se podrán correr.
//
// Contenido mínimo según la definición de «Expediente Técnico de Obra» del Anexo N.° 1
// del Reglamento de la Ley de Contrataciones del Estado (D. S. 344-2018-EF): memoria
// descriptiva, especificaciones técnicas, planos, metrados, presupuesto, análisis de
// precios, calendario de avance, fórmulas polinómicas y, si el caso lo requiere,
// estudio de suelos.

const NORMA = 'RLCE, Anexo N.° 1, definición de expediente técnico de obra (D. S. 344-2018-EF)';

interface Requisito {
  tipo: TipoDocumento;
  /** Qué comprobaciones dependen de este documento (para explicar el impacto). */
  habilita: string;
  prioridad: 'media' | 'confirmar';
}

const REQUISITOS: Requisito[] = [
  { tipo: 'Presupuesto', habilita: 'la aritmética del presupuesto y la comparación de precios', prioridad: 'media' },
  { tipo: 'Metrados', habilita: 'el rastreo de cantidades entre metrados y presupuesto', prioridad: 'media' },
  { tipo: 'Memoria', habilita: 'la ubicación del tramo y la descripción de metas', prioridad: 'media' },
  { tipo: 'Especificaciones', habilita: 'la coherencia de espesores, resistencias y métodos de pago', prioridad: 'media' },
  { tipo: 'Precios unitarios', habilita: 'la revisión de rendimientos, insumos y cuadrillas', prioridad: 'media' },
  { tipo: 'Planos', habilita: 'el cruce de geometría con metrados', prioridad: 'media' },
  { tipo: 'Cronograma', habilita: 'la revisión de plazos y secuencia', prioridad: 'confirmar' },
  { tipo: 'Fórmula polinómica', habilita: 'la revisión de los coeficientes de reajuste', prioridad: 'confirmar' },
  { tipo: 'Estudio de suelos', habilita: 'el cruce del pavimento con el suelo y el nivel freático', prioridad: 'confirmar' },
];

const TIPOS_DE_EXPEDIENTE = new Set<TipoDocumento>(REQUISITOS.map((r) => r.tipo));

export const motorCobertura: MotorExpediente = {
  id: 'cobertura',
  async ejecutar({ expediente, reportar }) {
    const docs = expediente.documentos;
    const presentes = new Set(docs.map((d) => d.tipo));

    // Puerta de pertinencia: si nada parece parte de un expediente, no se sigue.
    if (![...presentes].some((t) => TIPOS_DE_EXPEDIENTE.has(t))) {
      reportar({
        categoria: 'documentos', prioridad: 'alta',
        titulo: 'Los archivos no parecen un expediente técnico',
        detalle: 'Ningún archivo se reconoció como memoria, presupuesto, metrados u otra parte del expediente. Axis no puede revisar la obra con estos documentos.',
        accion: 'Confirmar el tipo de cada archivo o subir las partes del expediente técnico.',
        fuentes: docs.map((d) => ({ documento: d.nombre, pagina: `${d.paginas} ${d.unidad === 'pág.' ? 'pág.' : d.unidad === 'hoja' ? 'hoja(s)' : 'bloque(s)'}`, extracto: d.sugerencia.razon })),
        motores: ['clasificacion-documental', 'cobertura'],
      });
      return { estado: 'ok', nota: 'Los archivos no son un expediente técnico.' };
    }

    for (const r of REQUISITOS) {
      if (presentes.has(r.tipo)) continue;
      reportar({
        categoria: 'documentos', prioridad: r.prioridad,
        titulo: `${/^L[ao]s /.test(articulo(r.tipo)) ? 'Faltan' : 'Falta'} ${articulo(r.tipo).toLowerCase()}`,
        detalle: `El contenido mínimo del expediente técnico incluye ${articulo(r.tipo).toLowerCase()}. Sin este documento no se puede comprobar ${r.habilita}.`,
        accion: `Solicitar ${articulo(r.tipo).toLowerCase()} o confirmar que se subió con otro nombre.`,
        solicitud: `Adjuntar ${articulo(r.tipo).toLowerCase()} del expediente técnico.`,
        fuentes: [{ documento: 'Contenido mínimo del expediente', pagina: 'norma', extracto: NORMA }],
        motores: ['clasificacion-documental', 'cobertura'],
      });
    }

    for (const d of docs) {
      if (d.lectura === 'leido') continue;
      const motivo = d.lectura === 'escaneado' ? 'es un escaneo sin capa de texto'
        : d.lectura === 'parcial' ? `solo ${d.paginasConTexto} de ${d.paginas} páginas tienen texto`
          : d.lectura === 'formato-pendiente' ? 'su formato (Excel o Word) todavía no se lee'
            : 'no se pudo abrir';
      reportar({
        categoria: 'documentos', prioridad: 'confirmar',
        titulo: `${d.nombre} no se leyó completo`,
        detalle: `El archivo ${motivo}. Las comprobaciones que dependen de él quedan incompletas: el resultado no significa que esté conforme.`,
        accion: 'Pedir el archivo en PDF con texto (no escaneado) o revisarlo manualmente.',
        solicitud: `Adjuntar «${d.nombre}» en PDF con texto seleccionable.`,
        fuentes: [{ documento: d.nombre, pagina: `${d.paginasConTexto}/${d.paginas} ${d.unidad} con texto`, extracto: `Lectura: ${motivo}.` }],
        motores: ['lectura', 'cobertura'],
      });
    }
    return { estado: 'ok', nota: `${[...presentes].filter((t) => TIPOS_DE_EXPEDIENTE.has(t)).length} de ${REQUISITOS.length} partes del contenido mínimo.` };
  },
};

function articulo(tipo: TipoDocumento): string {
  switch (tipo) {
    case 'Presupuesto': return 'El presupuesto';
    case 'Metrados': return 'La planilla de metrados';
    case 'Memoria': return 'La memoria descriptiva';
    case 'Especificaciones': return 'Las especificaciones técnicas';
    case 'Precios unitarios': return 'El análisis de precios unitarios';
    case 'Planos': return 'Los planos';
    case 'Cronograma': return 'El cronograma de avance';
    case 'Fórmula polinómica': return 'La fórmula polinómica';
    case 'Estudio de suelos': return 'El estudio de suelos';
    default: return tipo;
  }
}
