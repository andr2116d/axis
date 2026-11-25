import type { Expediente, Hallazgo, TipoDocumento } from '@/dominio/tipos';

export type HallazgoNuevo = Omit<Hallazgo, 'id'>;

/** Lo que un motor recibe al analizar un expediente. */
export interface ContextoExpediente {
  expediente: Expediente;
  /** Texto por página del documento (índice 0 = página 1). */
  texto(docId: string): Promise<string[]>;
  reportar(hallazgo: HallazgoNuevo): void;
  /** Lo que ya reportaron los motores anteriores. */
  reportados(): readonly HallazgoNuevo[];
  /** Partes del expediente reconocidas página por página (un PDF puede traer varias). */
  partes?: Set<TipoDocumento>;
  /** Datos de la obra que un motor resolvió (nombre, lugar, tramo). */
  fijar(datos: Partial<Pick<Expediente, 'nombre' | 'lugar' | 'territorio'>>): void;
}

export interface ResultadoMotor {
  estado: 'ok' | 'sin-datos';
  nota?: string;
}

export interface MotorExpediente {
  /** Debe existir en el catálogo (src/dominio/motores.ts). */
  id: string;
  ejecutar(ctx: ContextoExpediente): Promise<ResultadoMotor>;
}
