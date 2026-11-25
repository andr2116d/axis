import type { TipoDocumento } from '@/dominio/tipos';
import { territorio } from '@/dominio/territorio';
import type { MotorExpediente } from './tipos';
import { nombrePropio, plano } from '../texto';

// Motor «Ubicación y tramo». Lee distrito, provincia y departamento de los documentos
// (primero la memoria) y busca si la vía nombrada tiene un recorte de terreno local
// (OpenStreetMap + Copernicus GLO-30). La geocodificación de cualquier calle está pendiente.

const ORDEN: TipoDocumento[] = ['Memoria', 'Planos', 'Presupuesto', 'Especificaciones', 'Metrados'];
const CAMPO = (etiqueta: string) => new RegExp(`\\b${etiqueta}\\s*(?:DE\\s+)?:?\\s*([A-ZÑ][A-ZÑ ]{2,30}?)(?=\\s*(?:[,;\\n."”-]|\\s{2,}|PROVINCIA|DEPARTAMENTO|REGION|DISTRITO|$))`);
const PREFIJO_VIA = /^(CALLE|AVENIDA|AV\.?|JIRON|JR\.?|PASAJE|PSJE\.?)\s+/;

function primero(texto: string, etiqueta: string) {
  return CAMPO(etiqueta).exec(texto)?.[1]?.trim();
}

export const motorUbicacion: MotorExpediente = {
  id: 'ubicacion',
  async ejecutar({ expediente, texto, fijar }) {
    const docs = [...expediente.documentos].sort((a, b) => rango(a.tipo) - rango(b.tipo));
    let distrito: string | undefined;
    let departamento: string | undefined;
    let todo = '';
    for (const d of docs) {
      const t = plano((await texto(d.id)).slice(0, 5).join('\n'));
      todo += `\n${t}`;
      distrito ??= primero(t, 'DISTRITO');
      departamento ??= primero(t, 'DEPARTAMENTO') ?? primero(t, 'REGION');
    }
    if (!distrito && !departamento) return { estado: 'sin-datos', nota: 'Los documentos no declaran distrito ni departamento.' };

    const lugar = [distrito, departamento].filter(Boolean).map((x) => nombrePropio(x!)).join(', ');
    // Solo cuenta la vía intervenida: lo que va antes de «desde / hasta / entre» en el nombre de la obra.
    const principal = plano(expediente.nombre).split(/\b(DESDE|HASTA|ENTRE|CON)\b/)[0];
    const tramo = Object.entries(territorio.maps).find(([, m]) => {
      const via = plano(m.name).replace(PREFIJO_VIA, '');
      return new RegExp(`\\b${via}\\b`).test(principal);
    });
    fijar({ lugar, territorio: tramo?.[0] ?? null });
    return { estado: 'ok', nota: tramo ? `${lugar} · tramo ${tramo[1].name}` : `${lugar} · sin recorte de terreno para la vía` };
  },
};

function rango(tipo: TipoDocumento) {
  const i = ORDEN.indexOf(tipo);
  return i === -1 ? ORDEN.length : i;
}
