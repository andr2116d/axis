import type { Semaforo as Estado } from '@/dominio/tipos';

// Resultado general de una revisión, como semáforo.

export const SEMAFORO: Record<Estado, { titulo: string; texto: string }> = {
  rojo: { titulo: 'Observar antes de aprobar', texto: 'Hay observaciones de prioridad alta.' },
  amarillo: { titulo: 'Corregir o confirmar', texto: 'Hay puntos que corregir o confirmar antes de dar conformidad.' },
  verde: { titulo: 'Conforme en lo revisado', texto: 'Las comprobaciones que corrieron no encontraron observaciones.' },
  gris: { titulo: 'No se pudo revisar', texto: 'Los archivos no son un expediente técnico de obra.' },
};

export function Semaforo({ estado, tamano = 'grande' }: { estado: Estado; tamano?: 'grande' | 'chico' }) {
  return (
    <span className={`semaforo semaforo-${tamano}`} role="img" aria-label={`Semáforo: ${SEMAFORO[estado].titulo}`}>
      {(['rojo', 'amarillo', 'verde'] as const).map((luz) => <i key={luz} className={`luz luz-${luz}${estado === luz ? ' encendida' : ''}`} />)}
    </span>
  );
}
