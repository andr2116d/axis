// Carga perezosa (una sola vez por instancia) de los datos reales que usa el servidor.
// Solo se importa desde rutas de API: estos archivos no viajan al navegador.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DatosTerritorio } from './contexto';
import { crearDem } from './terreno';
import type { DatosCompetencia } from './competencia';
import type { AntecedentesContraloria } from './supervision';
import type { Antecedentes } from './proveedor';
import type { ModeloClasificador } from './clasificador';

const leer = <T,>(rel: string): T => JSON.parse(readFileSync(path.join(process.cwd(), 'src/data', rel), 'utf8')) as T;
const cache = new Map<string, unknown>();
function una<T>(k: string, f: () => T): T {
  if (!cache.has(k)) cache.set(k, f());
  return cache.get(k) as T;
}

export const territorio = () => una<DatosTerritorio>('territorio', () => ({
  inversiones: leer<{ inversiones: DatosTerritorio['inversiones'] }>('real/inversiones_la_libertad.json').inversiones,
  peligros: leer('real/territorio/peligros_geologicos.json'),
  zonasCriticas: leer('real/territorio/zonas_criticas.json'),
  puntosCriticosAna: leer('real/territorio/ana_puntos_criticos.json'),
  rios: leer('real/territorio/ana_rios.json'),
  emergenciasHidricas: leer('real/territorio/ana_emergencias_hidricas.json'),
  dem: crearDem(leer('real/territorio/dem_trujillo.json'), readFileSync(path.join(process.cwd(), 'src/data/real/territorio/dem_trujillo.bin'))),
  red: leer('real/territorio/vias_trujillo.json'),
  distritos: leer('real/territorio/distritos.json'),
}));

export const distritos = () => una('distritos', () => leer<{ features: { geometry: unknown; properties: Record<string, unknown> }[] }>('real/territorio/distritos.json'));

export const proveedores = () => una('proveedores', () => leer<{ fuentes: string[]; porRuc: Record<string, Antecedentes> }>('real/proveedores.json'));

export interface ObraSeace {
  ocid: string; proceso: string; nomenclatura: string; mes: string; entidad: string; descripcion: string; tipo: string;
  montoReferencial: number | null; cui: string | null; metodo: string; fechaConvocatoria: string; postores: number;
  ganadores: { ruc: string; nombre: string | null; monto: number | null; fecha: string }[]; pliego: string | null; bases: string | null;
}
export const obrasSeace = () => una('obras', () => leer<{ fuente: string; descargado: string; obras: ObraSeace[] }>('real/obras_seace_la_libertad.json'));

export const competencia = () => una('competencia', () => leer<DatosCompetencia>('real/competencia_la_libertad.json'));

export const antecedentesContraloria = () => una('antecedentes', () => leer<AntecedentesContraloria>('real/antecedentes_contraloria.json'));

export const clasificador = () => una('clasificador', () => leer<ModeloClasificador>('aprendido/clasificador.json'));
