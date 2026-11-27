import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DatosTerritorio } from './contexto';
import { crearDem } from './terreno';
import type { AntecedentesContraloria } from './supervision';
import type { ModeloClasificador } from './clasificador';

// Carga perezosa (una vez por instancia) de los datos reales que usa el motor.
// Los archivos viven en src/datos y se incluyen en las funciones con
// outputFileTracingIncludes (next.config.ts).

const RAIZ = path.join(process.cwd(), 'src/datos');
const leer = <T,>(rel: string): T => JSON.parse(readFileSync(path.join(RAIZ, rel), 'utf8')) as T;
const cache = new Map<string, unknown>();
function una<T>(clave: string, f: () => T): T {
  if (!cache.has(clave)) cache.set(clave, f());
  return cache.get(clave) as T;
}

export const territorio = () => una<DatosTerritorio>('territorio', () => ({
  inversiones: leer<{ inversiones: DatosTerritorio['inversiones'] }>('real/inversiones_la_libertad.json').inversiones,
  peligros: leer('real/territorio/peligros_geologicos.json'),
  zonasCriticas: leer('real/territorio/zonas_criticas.json'),
  puntosCriticosAna: leer('real/territorio/ana_puntos_criticos.json'),
  rios: leer('real/territorio/ana_rios.json'),
  emergenciasHidricas: leer('real/territorio/ana_emergencias_hidricas.json'),
  dem: crearDem(leer('real/territorio/dem_trujillo.json'), readFileSync(path.join(RAIZ, 'real/territorio/dem_trujillo.bin'))),
  red: leer('real/territorio/vias_trujillo.json'),
  distritos: leer('real/territorio/distritos.json'),
}));

export const antecedentesContraloria = () => una('antecedentes', () => leer<AntecedentesContraloria>('real/antecedentes_contraloria.json'));

export const clasificador = () => una('clasificador', () => leer<ModeloClasificador>('aprendido/clasificador.json'));

// Selección del contratista: antecedentes OECE por RUC y procesos de obra de La Libertad (OCDS).
export const proveedores = () => una('proveedores', () => leer<import('../seleccion/antecedentes').IndiceProveedores>('real/proveedores.json'));
export const competencia = () => una('competencia', () => leer<import('../seleccion/antecedentes').DatosCompetencia>('real/competencia_la_libertad.json'));
