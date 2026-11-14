// Guarda una muestra del resultado REAL del motor sobre la demo LL-01 para la vista previa del inicio.
// Uso: npx tsx scripts/analisis/muestra-inicio.ts   (rehacer cuando cambie el motor o la demo)
import fs from 'node:fs';
import { analizarExpediente } from '../../src/lib/analisis/expediente';
import { utmALatLng } from '../../src/lib/geo';
import { paginasDePdf, territorioReal } from './util';
(async () => {
  const r = analizarExpediente(await paginasDePdf('public/expedientes/LL-01_pistas-calle-los-incas_con-errores.pdf'), { territorio: territorioReal(), utmALatLng: (e, n) => utmALatLng(e, n) });
  const fallas = r.detecciones.filter((d) => d.resultado === 'falla' && d.verificador !== 'C-HISTORIAL');
  const elegir = ['V-LETRAS', 'C-DRENAJE', 'X-ET-PRES', 'C-COORDINACION'];
  const muestra = {
    generado: new Date().toISOString().slice(0, 10), nombre: r.generales.nombre, total: r.presupuesto?.resumen.total?.monto,
    observaciones: fallas.length, altas: fallas.filter((d) => d.severidad === 'alta').length,
    destacadas: elegir.map((id) => fallas.find((d) => d.verificador === id)).filter(Boolean).map((d) => ({ verificador: d!.verificador, titulo: d!.titulo, severidad: d!.severidad, evidencia: d!.evidencias[0] ?? null })),
    perfil: r.terreno?.perfil ? { ...r.terreno.perfil, puntos: r.terreno.perfil.puntos.map((p) => ({ d: p.d, z: p.z, p: p.p })) } : null,
    cuencaHa: r.terreno?.cuenca?.areaHa ?? null, via: r.terreno?.via.nombreOsm ?? null,
  };
  fs.writeFileSync('src/data/muestra-inicio.json', JSON.stringify(muestra));
  console.log(muestra.observaciones, muestra.destacadas.map((d) => d.titulo));
})();
