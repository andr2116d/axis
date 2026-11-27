// Pruebas de regresión de la lógica de Axis. Cada caso fija lo que DEBE detectarse y lo que NO debe detectarse.
// Uso: npm run analisis:regresion   (sale con código 1 si algo falla)
import fs from 'node:fs';
import { aNumero, letrasANumero } from '../../src/servidor/analisis/numeros';
import { leerPresupuesto } from '../../src/servidor/analisis/presupuesto';
import { verificarPresupuesto, espesorEnMetros } from '../../src/servidor/analisis/verificar-presupuesto';
import { analizarExpediente } from '../../src/servidor/analisis/expediente';
import { vias } from '../../src/servidor/analisis/contexto';
import { utmALatLng } from '../../src/servidor/analisis/geo';
import { paginasDePdf, paginasDeTexto, territorioReal } from './util';
import { sugerirCausaHallazgo } from '../../src/servidor/analisis/aprendizaje';
import { clasificar } from '../../src/servidor/analisis/clasificador';
import { cuencaAportante, elevacion, perfil, trazoDeVia } from '../../src/servidor/analisis/terreno';
import { seccionTipica, verificarSeccion } from '../../src/servidor/analisis/seccion';
import { evaluarPertinencia } from '../../src/servidor/analisis/pertinencia';
import { evaluarProceso } from '../../src/servidor/seleccion/evaluar';
import { detectarTipo } from '../../src/servidor/ejecucion/analizar';
import { diasEntre, fechasEnTexto, sumarDias } from '../../src/dominio/fechas';

let fallos = 0, total = 0;
function ok(cond: boolean, nombre: string, detalle = '') {
  total++;
  if (cond) console.log(`  ✔ ${nombre}`);
  else { fallos++; console.log(`  ✘ ${nombre}${detalle ? `\n      ${detalle}` : ''}`); }
}

async function main() {
  console.log('Números y textos');
  ok(aNumero('2,090,093.80') === 2090093.8, 'número con comas de miles');
  ok(aNumero('45.500.00') === 45500, 'número con puntos de miles (OCR)');
  ok(aNumero('3.000,00') === 3000, 'número con coma decimal');
  ok(letrasANumero('DOS MILLONES OCHOCIENTOS CINCUENTA MIL NOVECIENTOS TREINTA Y UNO Y 07/100 SOLES') === 2850931.07, 'monto en letras');
  ok(letrasANumero('TRES MILLONES VEINTE MIL QUINIENTOS NOVENTIOCHO Y 92/100 NUEVOS SOLES') === 3020598.92, 'contracción "NOVENTIOCHO"');
  ok(Number.isNaN(letrasANumero('DOS MILLONES PATATA')), 'palabra desconocida → no se inventa un valor');
  ok(espesorEnMetros('VEREDA DE CONCRETO E=0.10 M') === 0.1 && espesorEnMetros('EXCAVACION H=20CM') === 0.2 && Math.abs(espesorEnMetros('CARPETA E=2"')! - 0.0508) < 1e-9, 'espesores en m, cm y pulgadas');
  ok([...vias('CALLE LOS INCAS CDRA.5 - EL PORVENIR')].join() === 'CALLE LOS INCAS', 'vía con cuadra abreviada');
  ok([...vias('AV. LAS DELICIAS Y JR. ENRIQUE LOPEZ')].join() === 'AV. LAS DELICIAS,JR. ENRIQUE LOPEZ', 'vías con palabras que empiezan como palabras vacías');

  console.log('Presupuestos reales (SEACE)');
  const real = (f: string) => verificarPresupuesto(leerPresupuesto(paginasDeTexto(fs.readFileSync('scripts/analisis/casos/' + f, 'utf8'))));
  const jb = real('real_jaime-blanco_2735216.txt');
  const ids = (d: ReturnType<typeof real>) => d.filter((x) => x.resultado === 'falla').map((x) => x.verificador).sort().join(',');
  ok(ids(jb) === 'V-ARIT-TITULO,V-GLOBAL,V-GLOBAL,V-GLOBAL,V-LETRAS', 'Av. Jaime Blanco: letras, subtotal 01.07 y 3 partidas global', ids(jb));
  ok(jb.some((d) => d.verificador === 'V-ARIT-TITULO' && d.detalle.includes('01.07.05')), 'Av. Jaime Blanco: identifica el subtítulo no sumado');
  for (const f of ['real_santa-veronica_1146577.txt', 'real_indoamerica_1171872.txt', 'real_av-peru_2628176.txt', 'real_av-c-alto-trujillo_1218514.txt']) {
    const d = real(f);
    ok(!d.some((x) => x.resultado === 'falla'), `${f}: sin falsas alarmas`, d.filter((x) => x.resultado === 'falla').map((x) => x.titulo).join(' | '));
  }
  {
    const pr = leerPresupuesto(paginasDeTexto(fs.readFileSync('scripts/analisis/casos/real_jaime-blanco_2735216.txt', 'utf8')));
    const sec = verificarSeccion(seccionTipica(pr, [], {}));
    ok(!sec.some((d) => d.resultado === 'falla'), 'Av. Jaime Blanco (rehabilitación con parches, sellado y reconstrucción): la sección no acusa', sec.map((d) => d.titulo).join(' | '));
  }
  const mb = real('real_miguel-barreto_2721555.txt');
  ok(ids(mb) === 'V-GLOBAL,V-IMPOSIBLE', 'Calle Miguel Barreto (presupuesto desagregado real): zanja de "H=35 m" y partida global con metrado 4', ids(mb));
  const ocr = real('real_ocr_alto-trujillo_1175229.txt');
  ok(ocr.length === 1 && ocr[0].verificador === 'V-LEGIBLE' && ocr[0].resultado === 'no_verificable', 'Presupuesto escaneado (OCR): no se acusa, se declara no verificable');

  console.log('Expedientes sintéticos (PDF → navegador → análisis completo)');
  const t = territorioReal();
  const analizar = async (f: string, extra = {}) => analizarExpediente(await paginasDePdf('public/demo/' + f), { territorio: t, utmALatLng: (e, n) => utmALatLng(e, n), ...extra });
  const r1 = await analizar('LL-01_pistas-calle-los-incas_con-errores.pdf');
  const f1 = r1.detecciones.filter((d) => d.resultado === 'falla');
  const tiene = (v: string, txt: string) => f1.some((d) => d.verificador === v && (d.titulo + ' ' + d.detalle).includes(txt));
  const sembrados: [string, string, string][] = [
    ['E1', 'V-LETRAS', 'letras'], ['E2', 'V-ARIT-TITULO', '06.02'], ['E3', 'V-GLOBAL', 'metrado 6'], ['E4', 'X-MET-PRES', '03.01'],
    ['E5', 'X-MET-PRES', '01.03'], ['E6', 'X-MET-PRES', '05.06'], ['E7', 'X-ET-PRES', '05.04'], ['E8', 'X-FECHAS', '02/09/2026'],
    ['E9', 'X-FORMULA', '0.03'], ['E10', 'X-CRONOGRAMA', 'PINTURA DE TRAFICO'], ['E11', 'X-CRONOGRAMA', '90 días'], ['E12', 'X-IDENTIDAD', 'suelos'],
    ['E13', 'X-APU-PRES', '05.04'], ['E14', 'V-APU-COEF', '04.03'], ['E15', 'V-APU-CUADRILLA', '01.03'], ['E16', 'X-GG', 'Residente'],
    ['E17', 'X-ET-COBERTURA', '07.02'], ['E18', 'D-PLANOS', 'señalización'], ['E19', 'X-RENDIMIENTO', '03.01'],
    ['E20', 'C-DRENAJE', 'drenaje'], ['E21', 'X-SECCION', 'corte'],
  ];
  for (const [e, v, txt] of sembrados) ok(tiene(v, txt), `LL-01 detecta ${e} (${v})`);
  ok(tiene('C-COORDINACION', 'CALLE LOS INCAS'), 'LL-01: contexto real — redes de agua pendientes en la misma calle');
  ok(f1.length <= sembrados.length + 2, `LL-01: sin alertas de más (${f1.length})`, f1.map((d) => d.verificador + ' ' + d.titulo).join(' | '));
  const r2 = await analizar('LL-02_pistas-calle-santa-clara_limpio.pdf');
  const f2 = r2.detecciones.filter((d) => d.resultado === 'falla' && d.verificador !== 'C-HISTORIAL');
  ok(f2.length === 0, 'LL-02 (limpio): ninguna falla en sus documentos', f2.map((d) => d.verificador + ' ' + d.titulo).join(' | '));
  ok(r2.detecciones.some((d) => d.verificador === 'C-DRENAJE' && d.resultado === 'pasa'), 'LL-02: el gemelo de terreno reconoce sus cunetas y badenes');
  ok(r2.seccion?.paqueteCalzada !== undefined && Math.abs(r2.seccion.paqueteCalzada - 0.2508) < 1e-3 && r2.seccion.anchoCalzada === 6, 'LL-02: sección vial paramétrica (capas 25.1 cm, calzada 6 m)');
  const r3 = await analizar('LL-03_pistas-pasaje-los-rosales_incompleto.pdf');
  ok(r3.faltantes.length === 5 && !r3.detecciones.some((d) => d.resultado === 'falla' && !d.verificador.startsWith('D-') && !d.verificador.startsWith('C-')) && r3.detecciones.some((d) => d.verificador === 'C-UBICACION'), 'LL-03 (incompleto): 5 documentos faltantes; sin coordenadas, la ubicación se marca como estimada o no verificable', r3.faltantes.join(','));

  console.log('Expedientes reales subidos por partes (sin coordenadas)');
  const port = analizarExpediente(paginasDeTexto(fs.readFileSync('scripts/analisis/casos/real_portugal_desagregado_1250651.txt', 'utf8')), { territorio: t, utmALatLng: (e, n) => utmALatLng(e, n), parcial: true });
  ok(port.conteos.partidas >= 30 && !port.detecciones.some((d) => d.verificador === 'V-LEGIBLE'), `Calle Portugal: presupuesto «desagregado» leído (${port.conteos.partidas} partidas)`);
  ok(port.generales.ubicacionEstimada?.via === 'CALLE PORTUGAL' && port.generales.ubicacionEstimada.distrito === 'EL PORVENIR', 'Calle Portugal: sin coordenadas, se ubica por el nombre de la vía dentro del distrito');
  ok(!port.detecciones.some((d) => d.resultado === 'falla' && d.verificador === 'C-DRENAJE'), 'Calle Portugal (reparación): el drenaje no se acusa');
  ok(!port.detecciones.some((d) => d.resultado === 'falla' && d.verificador === 'D-CONTENIDO'), 'Subida parcial: lo que no se subió no es observación');

  console.log('Gemelo de terreno (Copernicus GLO-30 + OpenStreetMap)');
  const via = (lat: number, lng: number, nombre: string, L?: number) => { const tr = trazoDeVia(t.red!, { lat, lng }, [nombre], L)!; return { tr, pf: perfil(t.dem!, tr.trazo)!, cu: cuencaAportante(t.dem!, tr.trazo)! }; };
  const incas = via(-8.086, -78.9948, 'Calle Los Incas', 288);
  ok(incas.tr.porNombre && Math.abs(incas.pf.longitud - 288) < 15, `Calle Los Incas encontrada por nombre en OSM (${incas.pf.longitud.toFixed(0)} m)`);
  ok(incas.pf.pendienteMedia > 0.08 && incas.pf.pendienteMedia < 0.16, `Calle Los Incas: pendiente fuerte (${(incas.pf.pendienteMedia * 100).toFixed(1)}%)`);
  const jb2 = via(-8.0771, -78.9961, 'Av. Jaime Blanco');
  ok(jb2.cu.areaHa > 50, `Av. Jaime Blanco: colector de escorrentía (${jb2.cu.areaHa.toFixed(0)} ha aguas arriba)`);
  const esp = via(-8.1105, -79.0225, 'Avenida España', 400);
  ok(esp.pf.pendienteMedia < 0.02, `Av. España (centro): casi plana (${(esp.pf.pendienteMedia * 100).toFixed(1)}%)`);
  ok(elevacion(t.dem!, { lat: -8.15, lng: -79.11 }) === 0, 'El mar tiene cota 0 en el modelo');

  console.log('Plan de verificación en obra (supervisor)');
  const ant = JSON.parse(fs.readFileSync('src/datos/real/antecedentes_contraloria.json', 'utf8'));
  const s2 = await analizar('LL-02_pistas-calle-santa-clara_limpio.pdf', { antecedentes: ant });
  const ver = s2.planObra?.find((x) => x.elemento === 'vereda');
  ok(!!ver && ver.verificar.some((v) => v.valor === '10 cm') && ver.verificar.some((v) => v.valor.includes("f'c = 175")), 'LL-02: controla espesor (10 cm) y resistencia (175) de veredas, valores del expediente');
  ok(!!ver && ver.antecedentes.length > 0 && ver.antecedentes[0].lugar.includes('La Libertad'), 'Cada punto cita un informe real de la Contraloría (primero La Libertad)');
  const s1 = await analizar('LL-01_pistas-calle-los-incas_con-errores.pdf', { antecedentes: ant });
  ok(!!s1.planObra?.find((x) => x.elemento === 'vereda')?.verificar[0].valor.includes('aclarar'), 'LL-01: si especificación y presupuesto se contradicen, el plan pide aclarar (no elige un valor)');

  console.log('Pertinencia: ¿lo subido es un expediente?');
  const doc = (...ls: string[]) => [{ numero: 1, lineas: ls }, { numero: 2, lineas: ls.slice(1) }];
  const ajenos: [string, ReturnType<typeof doc>][] = [
    ['currículum', doc('CURRICULUM VITAE', 'Juan Pérez Gómez', 'Bachiller en Administración', 'EXPERIENCIA LABORAL', 'Asistente administrativo (2021-2024)', 'Excel avanzado, trabajo en equipo')],
    ['receta', doc('RECETA: CEVICHE', 'Ingredientes', '1 kg de pescado', '15 limones', 'Preparación', 'Cortar el pescado en cubos')],
    ['factura', doc('FACTURA ELECTRÓNICA F001-000234', 'RUC 20123456789', '2 Laptop 2,500.00 5,000.00', 'IGV 18% 906.10', 'Importe total 5,940.00')],
    ['valorización de obra', doc('VALORIZACIÓN N° 03 - OCTUBRE 2026', 'OBRA: MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE LAS FLORES', 'Avance físico acumulado: 62%', 'El supervisor de obra da conformidad')],
    ['contrato', doc('CONTRATO N° 015-2026-MDEP', 'CLÁUSULA PRIMERA: ANTECEDENTES', 'LA ENTIDAD y EL CONTRATISTA acuerdan', 'CLÁUSULA SEGUNDA: OBJETO', 'ejecución de la obra de pavimentación de la calle')],
    ['glosario (LOSA dentro de GLOSARIO no es vocabulario de obra)', doc('GLOSARIO DE TÉRMINOS', 'Concreto: específico', 'Junta directiva', 'Valor agregado', 'Utilidad pública', 'Oficial')],
  ];
  for (const [nombre, ps] of ajenos) {
    const r = analizarExpediente(ps, { territorio: t, parcial: true });
    ok(evaluarPertinencia(ps).nivel !== 'expediente' && r.detecciones.length === 1 && r.detecciones[0].verificador === 'D-PERTINENCIA' && r.cobertura.length === 0,
      `Un ${nombre} no se revisa ni sale "sin observaciones"`, `${evaluarPertinencia(ps).nivel}: ${r.detecciones.map((d) => d.verificador).join(',')}`);
  }
  // Informes que hablan de la obra y hasta nombran partes del expediente: siguen sin ser un expediente
  const informe = [{ numero: 1, lineas: ['INFORME N° 123-2026-MDEP/GDU/SGOP', 'A : GERENTE DE DESARROLLO URBANO', 'ASUNTO : ESTADO DE LA OBRA', 'OBRA: MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE LAS FLORES, DISTRITO DE EL PORVENIR',
    'Se informa que el contratista viene ejecutando la excavación, el relleno compactado y la base granular. El concreto de veredas y sardineles está pendiente.', 'La carpeta asfáltica, las cunetas y la señalización se ejecutarán el próximo mes.'] },
    { numero: 2, lineas: ['PRESUPUESTO', 'El presupuesto aprobado no ha variado. Las especificaciones técnicas se cumplen según el residente de obra y el supervisor de obra.', 'METRADOS', 'Los metrados se verificarán en la valorización.'] }];
  const ficha = [{ numero: 1, lineas: ['Ficha Resumen - Informe de Control Simultáneo', 'I. Información general de informes de control simultáneo:', 'Entidad: MUNICIPALIDAD DISTRITAL DE EL PORVENIR'] },
    { numero: 2, lineas: ['ESPECIFICACIONES TECNICAS', 'Se evidenció que el concreto de la losa no cumple con la resistencia f\'c especificada; la excavación y el relleno no fueron compactados; el pavimento presenta fisuras; las veredas y sardineles...'] }];
  for (const [nombre, ps] of [['informe técnico de la obra que nombra el presupuesto y los metrados', informe], ['informe de control que cita las especificaciones técnicas', ficha]] as const) {
    const r = analizarExpediente(ps as never, { territorio: t, parcial: true });
    ok(r.detecciones.length === 1 && r.detecciones[0].verificador === 'D-PERTINENCIA', `Un ${nombre} no se revisa`, `${r.pertinencia.nivel}/${r.pertinencia.parece}: ${r.pertinencia.motivo}`);
  }
  ok(evaluarPertinencia(ajenos[3][1]).parece === 'ejecucion' && evaluarPertinencia(ajenos[4][1]).parece === 'contrato', 'Dice qué parece: valorización → ejecución de obra, contrato → contrato');
  ok([r1, r2, r3].every((r) => r.pertinencia.nivel === 'expediente'), 'Los tres ejemplos se reconocen como expedientes');
  const casosReales = fs.readdirSync('scripts/analisis/casos').filter((f) => f.startsWith('real_'));
  const perdidos = casosReales.filter((f) => evaluarPertinencia(paginasDeTexto(fs.readFileSync('scripts/analisis/casos/' + f, 'utf8'))).nivel !== 'expediente');
  ok(!perdidos.length, `Los ${casosReales.length} presupuestos reales se reconocen como parte de un expediente`, perdidos.join(','));
  const hoja = doc('RESUMEN DE PRESUPUESTO', '"REPARACION DE CALZADA O PISTA; EN EL(LA) CALLE MANUEL SOANE DEL SECTOR VICTOR RAUL HAYA', 'CUI:2720325', 'COSTO DIRECTO | 266,521.91', 'GASTOS GENERALES (10%) | 26,652.19', 'UTILIDADES (5%) | 13,326.10', 'IGV (18%) | 55,170.04', 'PRESUPUESTO DE OBRA | 361,670.24');
  ok(evaluarPertinencia(hoja).nivel === 'expediente', 'Una hoja suelta real (resumen del presupuesto con CUI) sí cuenta como parte del expediente');
  ok(r2.cobertura.length >= 8, `LL-02: el "sin observaciones" se apoya en ${r2.cobertura.length} grupos de pruebas que sí corrieron`);
  const cambiar = (ps: { numero: number; lineas: string[] }[], de: RegExp, a: string) => ps.map((p) => ({ ...p, lineas: p.lineas.map((l) => l.replace(de, a)) }));
  const pags2 = await paginasDePdf('public/demo/LL-02_pistas-calle-santa-clara_limpio.pdf');
  const cole = analizarExpediente(cambiar(pags2, /PISTAS Y VEREDAS/g, 'SERVICIO EDUCATIVO DE LA I.E. 80045'), { territorio: t, utmALatLng: (e, n) => utmALatLng(e, n) });
  ok(cole.ambito.tipo === 'educacion' && cole.detecciones.some((d) => d.verificador === 'D-ALCANCE') && !cole.seccion && !cole.detecciones.some((d) => d.verificador === 'C-DRENAJE' || d.verificador === 'X-SECCION'),
    'Obra que no es vial (colegio): se avisa y no se aplican las pruebas de la calle', cole.ambito.tipo);
  const lima = analizarExpediente(cambiar(pags2, /-8\.07839, -78\.99510/g, '-12.04640, -77.04280'), { territorio: t, utmALatLng: (e, n) => utmALatLng(e, n) });
  ok(lima.detecciones.some((d) => d.verificador === 'C-UBICACION' && d.titulo.includes('fuera de La Libertad')) && !lima.detecciones.some((d) => d.verificador.startsWith('C-') && d.resultado === 'falla'),
    'Obra con coordenadas fuera de La Libertad: se avisa y no se inventa el entorno', JSON.stringify(lima.generales.ubicacion));

  console.log('Ciclo de aprendizaje');
  const prueba = { id: 'A-001', nombre: 'Red existente no catastrada', causa: 'Interferencias', radio: 300, estado: 'validada' as const,
    palabrasPartida: ['reubicacion', 'proteccion de red', 'interferencia'], palabrasEstudio: ['interferencia', 'catastro de redes'], recomendacion: '',
    hallazgo: { id: 'H-1', obra: 'Av. Jaime Blanco', descripcion: 'Tubería de desagüe no catastrada', ubicacion: { lat: -8.077054, lng: -78.996063 }, fecha: '2026-12-03', fuente: 'Cuaderno de obra' } };
  const a2 = await analizar('LL-02_pistas-calle-santa-clara_limpio.pdf', { aprendidas: [prueba] });
  ok(a2.detecciones.some((d) => d.verificador === 'A-001' && d.resultado === 'falla'), 'Hallazgo validado genera alerta nueva en un expediente cercano (183 m)');
  const a1 = await analizar('LL-01_pistas-calle-los-incas_con-errores.pdf', { aprendidas: [prueba] });
  ok(!a1.detecciones.some((d) => d.verificador === 'A-001'), 'y no en uno lejano (1 km)');

  console.log('Clasificador de causas');
  const modelo = JSON.parse(fs.readFileSync('src/datos/aprendido/clasificador.json', 'utf8'));
  const cv = modelo.evaluacion.comparacion[modelo.evaluacion.modelo];
  ok(cv.expedienteVsBases >= 0.85 && cv.causaEnObservacionesDeExpediente >= 0.7, `Validación cruzada: ${cv.expedienteVsBases} expediente/bases, ${cv.causaEnObservacionesDeExpediente} causa (mínimos 0.85 y 0.70)`);
  const campo: [string, string][] = [
    ['Al excavar la zanja para el sardinel encontramos una tubería de desagüe existente que no figuraba en los planos', 'Interferencias'],
    ['Se encontró un poste de alumbrado público en medio de la vereda proyectada', 'Interferencias'],
    ['A 1.20 m de profundidad apareció agua (napa freática)', 'Estudios básicos'],
    ['Relleno no controlado con desmonte a 1 m de profundidad en el eje de la calle', 'Estudios básicos'],
  ];
  for (const [t, c] of campo) { const s2 = sugerirCausaHallazgo(modelo, t); ok(s2.causa === c, `Hallazgo de obra → ${c} (${s2.fuente})`, `${s2.causa}: ${t}`); }
  ok(clasificar(modelo, 'El metrado de la carpeta asfáltica en el presupuesto no coincide con la planilla de metrados').causa === 'Metrados', 'Observación de postor → Metrados (modelo)');
  ok(clasificar(modelo, 'Se solicita reducir la experiencia del personal clave residente de obra').causa === 'Bases y procedimiento', 'Consulta sobre bases → Bases y procedimiento (modelo)');

  console.log('\nFases: selección y ejecución');
  ok(sumarDias('2026-09-25', 10, true) === '2026-10-12', 'diez días hábiles saltan el feriado del 8 de octubre');
  ok(diasEntre('2026-11-18', '2026-11-22', true) === 2, 'días hábiles entre dos fechas');
  ok(fechasEnTexto('desde el 2 de setiembre hasta el 8 de setiembre de 2026').map((f) => f.fecha).join() === '2026-09-02,2026-09-08', 'fechas en texto, año tomado de la vecina');
  ok(detectarTipo('Se solicita AMPLIACIÓN DE PLAZO N° 1') === 'ampliacion' && detectarTipo('PRESTACIÓN ADICIONAL DE OBRA N° 2') === 'adicional' && detectarTipo('CONSULTA N° 3: precisar') === 'consulta', 'tipo de solicitud');
  {
    const idx = JSON.parse(fs.readFileSync('src/datos/real/proveedores.json', 'utf8'));
    const comp = JSON.parse(fs.readFileSync('src/datos/real/competencia_la_libertad.json', 'utf8'));
    const sancionado = '20600147464';
    const postor = (id: string, oferta: number, puntajeTotal: number, integrantes: any[], extra: any = {}) => ({ id, nombre: id, oferta, puntajeTotal, personal: [], integrantes, ...extra });
    const r = evaluarProceso({
      nomenclatura: 'X', objeto: 'X', procedimiento: 'abreviada', valorReferencial: 1000000, fechaBuenaPro: '2026-09-15',
      postores: [
        postor('A', 950000, 100, [{ nombre: 'Nueva', ruc: '20612345671', participacion: 90, experiencia: 0, inicio: '2026-03-01' }, { nombre: 'Experta', ruc: '20481234567', participacion: 10, experiencia: 5e6 }], { domicilio: 'Jr. Uno 1' }),
        postor('B', 960000, 100, [{ nombre: 'Sancionada', ruc: sancionado, participacion: 100, experiencia: 1e6 }]),
        postor('C', 1000000, 95, [{ nombre: 'C', ruc: '20530987651', participacion: 100, experiencia: 1e6 }], { domicilio: 'JR UNO 1' }),
        postor('D', 1200000, 80, [{ nombre: 'D', ruc: '20477889901', participacion: 100, experiencia: 1e6 }]),
      ],
    }, { idx, comp });
    ok(r.orden.find((o) => o.postor === 'B')?.admitida === false, 'un inhabilitado vigente no se admite (Ley, art. 30)');
    ok(r.orden.find((o) => o.postor === 'D')?.admitida === false, 'oferta sobre 110 % del valor referencial no se admite');
    ok(r.ganador === 'A', 'el ganador es el de mejor puntaje entre los admitidos');
    ok(r.senales.some((x) => x.postor === 'A' && /socio con 10/.test(x.titulo)), 'consorcio con la experiencia en un socio de 10 %');
    ok(r.senales.some((x) => /comparten/.test(x.titulo)), 'vínculo por domicilio compartido');
    ok(r.recomendaciones.some((x) => x.base === 'Reglamento, art. 83'), 'recomienda la verificación posterior del ganador');
  }
  console.log(`\n${total - fallos}/${total} pruebas pasan`);
  if (fallos) process.exit(1);
}
main();
