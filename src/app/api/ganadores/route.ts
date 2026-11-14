import { NextResponse } from 'next/server';
import { competencia, obrasSeace, proveedores } from '@/lib/analisis/datos-servidor';
import { esRuc } from '@/lib/analisis/proveedor';
import { verificarGanador } from '@/lib/analisis/ganador';
import { PERSONA_NATURAL, ocultarRucPersonas } from '@/lib/analisis/privacidad-ruc';

// Obras de La Libertad adjudicadas (SEACE/OECE) con la verificación de antecedentes de cada ganador a la fecha de la buena pro.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get('q') ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const tipo = u.searchParams.get('tipo');
  const solo = u.searchParams.get('solo'); // 'alertas' | 'consorcios'
  const pagina = Math.max(1, Number(u.searchParams.get('pagina') ?? 1));
  const { obras, fuente, descargado } = obrasSeace();
  const idx = proveedores().porRuc;
  const comp = competencia();
  let filas = obras.filter((o) => o.ganadores.length).map((o) => ({
    ...o,
    ganadores: o.ganadores.map((g) => (/^10\d{9}$/.test(g.ruc) ? { ...g, nombre: PERSONA_NATURAL } : g)),
    verificacion: o.ganadores.map((g) => {
      const det = verificarGanador(g.ruc, (g.fecha || o.fechaConvocatoria || '').slice(0, 10), idx, comp, o.proceso);
      return { ruc: g.ruc, nombre: /^10\d{9}$/.test(g.ruc) ? PERSONA_NATURAL : g.nombre, consorcio: !esRuc(g.ruc), integrantes: comp.miembros?.[g.ruc]?.length ?? null, alertas: det.filter((d) => d.resultado === 'falla') };
    }),
  }));
  if (q) filas = filas.filter((o) => (o.descripcion + ' ' + o.entidad + ' ' + o.nomenclatura + ' ' + (o.cui ?? '')).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  if (tipo) filas = filas.filter((o) => o.tipo === tipo);
  if (solo === 'alertas') filas = filas.filter((o) => o.verificacion.some((v) => v.alertas.length));
  if (solo === 'consorcios') filas = filas.filter((o) => o.verificacion.some((v) => v.consorcio));
  const resumen = {
    adjudicaciones: filas.reduce((s, o) => s + o.verificacion.length, 0),
    consorcios: filas.reduce((s, o) => s + o.verificacion.filter((v) => v.consorcio).length, 0),
    conAlertas: filas.reduce((s, o) => s + o.verificacion.filter((v) => v.alertas.length).length, 0),
  };
  const porPagina = 25;
  return NextResponse.json({ fuente, descargado, total: filas.length, resumen, pagina, filas: ocultarRucPersonas(filas.slice((pagina - 1) * porPagina, pagina * porPagina)) });
}
