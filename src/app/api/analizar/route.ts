import { NextResponse } from 'next/server';
import { analizarExpediente } from '@/lib/analisis/expediente';
import { NOMBRE_DOCUMENTO, type Documento } from '@/lib/analisis/nombres';
import { antecedentesContraloria, territorio } from '@/lib/analisis/datos-servidor';
import { utmALatLng } from '@/lib/geo';
import type { PruebaAprendida } from '@/lib/analisis/aprendizaje';

// Análisis real del expediente: recibe las páginas YA LEÍDAS en el navegador (texto sin datos personales; el PDF nunca sale del equipo).
export async function POST(req: Request) {
  let body: { paginas?: { numero: number; lineas: string[] }[]; aprendidas?: PruebaAprendida[]; clasificacion?: { pagina: number; documento: string }[]; parcial?: boolean; partesIndicadas?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }); }
  const paginas = (body.paginas ?? []).filter((p) => Number.isInteger(p?.numero) && Array.isArray(p?.lineas)).slice(0, 600)
    .map((p) => ({ numero: p.numero, lineas: p.lineas.filter((l) => typeof l === 'string').slice(0, 400).map((l) => l.slice(0, 600)) }));
  if (!paginas.length) return NextResponse.json({ error: 'No llegaron páginas' }, { status: 400 });
  // Pruebas aprendidas validadas por el curador (vienen del navegador de quien prueba la demo)
  const aprendidas = (body.aprendidas ?? []).filter((p) => p?.estado === 'validada' && Number.isFinite(p?.hallazgo?.ubicacion?.lat) && Number.isFinite(p?.hallazgo?.ubicacion?.lng)
    && Array.isArray(p.palabrasPartida) && Array.isArray(p.palabrasEstudio)).slice(0, 100)
    .map((p) => ({ ...p, radio: Math.min(1000, Math.max(50, Number(p.radio) || 200)), palabrasPartida: p.palabrasPartida.slice(0, 20).map(String), palabrasEstudio: p.palabrasEstudio.slice(0, 20).map(String) }));
  const validos = new Set(Object.keys(NOMBRE_DOCUMENTO));
  const clasificacion = (body.clasificacion ?? []).filter((c) => Number.isInteger(c?.pagina) && validos.has(c?.documento)).slice(0, 600) as { pagina: number; documento: Documento }[];
  const t = territorio();
  const r = analizarExpediente(paginas, { territorio: t, utmALatLng: (e, n) => utmALatLng(e, n), aprendidas, antecedentes: antecedentesContraloria(), clasificacion, parcial: body.parcial === true, partesIndicadas: body.partesIndicadas === true });
  // La cuenca viaja como centros de celda (lat, lng) para dibujarla; no se envían índices internos del modelo.
  if (r.terreno?.cuenca && t.dem) {
    const d = t.dem; const { celdasCuenca, ...resto } = r.terreno.cuenca;
    const celdas = celdasCuenca.map(([i, j]) => [+(d.latN - (i + 0.5) * d.paso).toFixed(6), +(d.lonO + (j + 0.5) * d.paso).toFixed(6)]);
    return NextResponse.json({ ...r, presupuesto: undefined, total: r.presupuesto?.resumen.total?.monto ?? null, nombreObra: r.presupuesto?.nombreObra ?? null, terreno: { ...r.terreno, cuenca: { ...resto, celdas, paso: d.paso } } });
  }
  return NextResponse.json({ ...r, presupuesto: undefined, total: r.presupuesto?.resumen.total?.monto ?? null, nombreObra: r.presupuesto?.nombreObra ?? null });
}
