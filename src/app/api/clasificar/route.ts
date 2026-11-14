import { NextResponse } from 'next/server';
import { clasificador } from '@/lib/analisis/datos-servidor';
import { clasificar } from '@/lib/analisis/clasificador';
import { sugerirCausaHallazgo } from '@/lib/analisis/aprendizaje';

// Ubica un hallazgo u observación en la taxonomía de causas (modelo entrenado con consultas reales de La Libertad).
export async function POST(req: Request) {
  let body: { texto?: string; tipo?: 'hallazgo' | 'observacion' };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }); }
  const texto = (body.texto ?? '').slice(0, 3000);
  if (texto.trim().length < 10) return NextResponse.json({ error: 'Escriba al menos una frase' }, { status: 400 });
  const m = clasificador();
  const modelo = { version: m.version, tipo: m.tipo, entrenamiento: m.entrenamiento, evaluacion: m.evaluacion };
  // Hallazgos de obra: regla de campo para hechos físicos inequívocos; si no, el modelo
  if (body.tipo === 'hallazgo') return NextResponse.json({ ...sugerirCausaHallazgo(m, texto), modelo });
  return NextResponse.json({ ...clasificar(m, texto), modelo });
}
