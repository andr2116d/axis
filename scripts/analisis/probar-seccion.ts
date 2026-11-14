// Sección vial paramétrica de un expediente. Uso: npx tsx scripts/analisis/probar-seccion.ts [pdf]
import { analizarExpediente } from '../../src/lib/analisis/expediente';
import { paginasDePdf } from './util';
(async () => {
  for (const f of process.argv.slice(2).length ? process.argv.slice(2) : ['public/expedientes/LL-01_pistas-calle-los-incas_con-errores.pdf', 'public/expedientes/LL-02_pistas-calle-santa-clara_limpio.pdf']) {
    const r = analizarExpediente(await paginasDePdf(f));
    console.log(f.split('/').pop(), JSON.stringify(r.seccion, null, 0));
    for (const d of r.detecciones.filter((d) => d.verificador === 'X-SECCION')) console.log('  ', d.resultado, d.titulo, '|', d.detalle);
  }
})();
