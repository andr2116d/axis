import type { Categoria, EstadoLectura, Prioridad } from '@/dominio/tipos';
import { Icono, type NombreIcono } from './Icono';

export const CATEGORIAS: { id: Categoria; nombre: string; icono: NombreIcono }[] = [
  { id: 'costos', nombre: 'Costos y presupuesto', icono: 'coins' },
  { id: 'documentos', nombre: 'Documentos y metrados', icono: 'files' },
  { id: 'territorio', nombre: 'Territorio y diseño', icono: 'map' },
  { id: 'aprendidas', nombre: 'Pruebas aprendidas', icono: 'layers' },
];

export const PRIORIDADES: Record<Prioridad, { texto: string; icono: NombreIcono }> = {
  alta: { texto: 'Prioridad alta', icono: 'alert' },
  media: { texto: 'Prioridad media', icono: 'list' },
  confirmar: { texto: 'Por confirmar', icono: 'clock' },
};

export function categoria(id: Categoria) {
  return CATEGORIAS.find((c) => c.id === id)!;
}

export function Pill({ prioridad }: { prioridad: Prioridad }) {
  const p = PRIORIDADES[prioridad];
  return <span className={`pill ${prioridad}`}><Icono nombre={p.icono} tamano={13} />{p.texto}</span>;
}

export const LECTURA: Record<EstadoLectura, string> = {
  leido: 'Leído',
  parcial: 'Lectura parcial',
  escaneado: 'Escaneado · sin texto',
  'no-legible': 'No se pudo abrir',
  'formato-pendiente': 'Formato pendiente',
};

export function tamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export function fecha(iso: string) {
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
}
