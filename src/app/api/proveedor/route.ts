import { NextResponse } from 'next/server';
import { competencia, proveedores } from '@/lib/analisis/datos-servidor';
import { verificarGanador } from '@/lib/analisis/ganador';
import { esRuc } from '@/lib/analisis/proveedor';
import { ocultarRucPersonas } from '@/lib/analisis/privacidad-ruc';

// Antecedentes oficiales (OECE) de un proveedor por RUC (o de cada integrante si es consorcio), su historial de
// ejecución en La Libertad y, si se indica ?proceso=, las señales de ese proceso. Fecha por defecto: hoy.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const ruc = (u.searchParams.get('ruc') ?? '').replace(/\D/g, '');
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get('fecha') ?? '') ? u.searchParams.get('fecha')! : new Date().toISOString().slice(0, 10);
  if (!ruc) return NextResponse.json({ error: 'Indique un RUC' }, { status: 400 });
  const d = proveedores();
  const a = d.porRuc[ruc];
  return NextResponse.json(ocultarRucPersonas({
    ruc, fecha, esRuc: esRuc(ruc), nombre: a?.nombre ?? null, fuentes: d.fuentes,
    conteo: a ? { inhabilitaciones: a.inhabilitaciones.length, multas: a.multas.length, penalidades: a.penalidades.length } : { inhabilitaciones: 0, multas: 0, penalidades: 0 },
    miembros: competencia().miembros?.[ruc] ?? null,
    detecciones: verificarGanador(ruc, fecha, d.porRuc, competencia(), u.searchParams.get('proceso') ?? undefined),
  }, ruc));
}
