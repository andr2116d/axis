// Genera los expedientes técnicos SINTÉTICOS de pistas y veredas para la demostración de Axis (La Libertad).
//
// Los documentos imitan el formato real que se publica en el SEACE (presupuesto tipo S10, resumen de metrados,
// especificaciones, fórmula polinómica, cronograma, cotizaciones, estudio de suelos, índice de planos).
// Cada error sembrado reproduce un error REAL observado por postores en licitaciones de La Libertad (2026):
//   E1  Monto en letras ≠ total en números ............ Av. Jaime Blanco, El Porvenir (presupuesto publicado, CUI 2735216)
//   E2  Subtotal que no suma un subtítulo ............. Av. Jaime Blanco (01.07 no suma 01.07.05)
//   E3  Partida "global" con cantidades ............... Av. Jaime Blanco (señalización vertical glb 39)
//   E4  Metrado distinto entre presupuesto y planilla . Parcoy (vereda/pista, pliego de absolución 2026)
//   E5  Unidad distinta entre presupuesto y planilla .. Cochorco (8 partidas con unidad cambiada)
//   E6  Partida presupuestada sin metrado ............. Curgos (acero en presupuesto sin metrado)
//   E7  Espesor de vereda distinto en especificaciones  Parcoy (0.15 m vs 0.10 m)
//   E8  Cotización posterior a la fecha del presupuesto Curgos (cotizaciones de mayo para presupuesto de abril)
//   E9  Monomio de la fórmula polinómica < 0.05 ....... Pliego de absolución 2026 (incidencias menores al 5%)
//   E10 Pintura de tráfico antes de la carpeta ........ Curgos (acabados programados antes que la estructura)
//   E11 Cronograma más largo que el plazo ............. Pliego 2026 (80 días corridos vs 75 declarados)
//   E12 Estudio de suelos de otra obra ................ Chepén (se subió el estudio de mecánica de suelos de otro proyecto)
//   E13 Precio del presupuesto ≠ costo de su APU ...... Salaverry (concreto de veredas, CUI 2612633)
//   E14 Agregados insuficientes por m³ en el APU ...... Sarín (0.044 y 0.2625 m³ por m³, CUI 2711420)
//   E15 Cantidad de mano de obra ≠ cuadrilla/rendim. . Rendimientos observados en APU (pliegos 2026)
//   E16 Gastos generales por más tiempo que el plazo .. El Porvenir (CUI 2491504) y Pacanga (CUI 2601417)
//   E17 Partida sin especificación técnica ............ Huanchaco (CUI 2721029)
//   E20 Calle en pendiente sin drenaje pluvial ........ Contraloría: Julcán (Inf. 24415-2025-CG/TRACO-SVC), Orán (13-2026-CG/GRLO),
//       Yamango (36-2026-CG/GRPI). Lo detecta el gemelo de terreno (Copernicus + OSM), no el texto del expediente.
//   E21 Corte que no aloja las capas del pavimento .... Contraloría: Urubamba (070-2026-OCI/0392-SVC, espesores de capas
//       inconsistentes y rasante sin definir). Lo detecta la sección vial paramétrica (modelo 3D de capas).
//   E18 Partida sin su plano (señalización) ........... La Esperanza: plan de desvío sin plano (CUI 2713072)
//   E19 Cronograma imposible con el rendimiento del APU  Av. Jaime Blanco: 5,846 m² de base en 4 días
// El CONTEXTO (inversiones de agua pendientes, peligros) NO se siembra: lo calcula Axis con datos reales.
// Nombres de personas, empresas, CUI y RUC son ficticios.
// Uso: node scripts/demo/generar-expedientes.mjs <carpeta de salida> [archivo1 archivo2 …]
//   Sin lista, genera todos. Los de la demo del servidor (LL-01 a LL-03) están en public/demo.
import fs from 'node:fs';
import PDFDocument from 'pdfkit';

const OUT = new URL(`file://${(process.argv[2] ?? 'public/demo').replace(/^(?!\/)/, process.cwd() + '/').replace(/\/?$/, '/')}`);
fs.mkdirSync(OUT, { recursive: true });

const r2 = (n) => Math.round(n * 100) / 100;
const f2 = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f3 = (n) => n.toFixed(3);
const f4 = (n) => n.toFixed(4);
const fecha = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
const dia = (base, n) => new Date(Date.UTC(base[0], base[1] - 1, base[2] + n));

// ---------- Monto en letras ----------
const U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
function cientos(n) {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), r = n % 100;
  const dec = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' Y ' + U[r % 10] : '');
  return [C[c], dec].filter(Boolean).join(' ');
}
function letras(monto) {
  const ent = Math.floor(monto), cent = Math.round((monto - ent) * 100);
  const mill = Math.floor(ent / 1e6), miles = Math.floor((ent % 1e6) / 1000), resto = ent % 1000;
  const p = [];
  if (mill) p.push(mill === 1 ? 'UN MILLON' : cientos(mill) + ' MILLONES');
  if (miles) p.push(miles === 1 ? 'MIL' : cientos(miles) + ' MIL');
  if (resto) p.push(cientos(resto));
  return `${p.join(' ')} Y ${String(cent).padStart(2, '0')}/100 SOLES`;
}

// ---------- Partidas de una calle (calzada 6.00 m, veredas 1.20 m a cada lado) ----------
function partidasCalle(L, e, drenaje) {
  const calz = r2(L * 6.0), ver = r2(L * 2 * 1.2), sard = r2(L * 2);
  const corte = e.E21 ? 0.2 : 0.35; // E21: corte de 20 cm para 25 cm de capas
  const T = (codigo, descripcion) => ({ codigo, descripcion, titulo: true });
  const P = (codigo, descripcion, unidad, metrado, precio) => ({ codigo, descripcion, unidad, metrado: r2(metrado), precio });
  return [
    T('01', 'OBRAS PROVISIONALES Y TRABAJOS PRELIMINARES'),
    P('01.01', 'CARTEL DE IDENTIFICACION DE OBRA 3.60X2.40M', 'und', 1, 1850.0),
    P('01.02', 'MOVILIZACION Y DESMOVILIZACION DE EQUIPOS', 'glb', 1, 6500.0),
    P('01.03', 'TRAZO Y REPLANTEO DURANTE LA OBRA', 'm2', calz + ver, 1.67),
    P('01.04', 'DESVIO Y MANTENIMIENTO DE TRANSITO', 'glb', 1, 3200.0),
    T('02', 'MOVIMIENTO DE TIERRAS'),
    P('02.01', 'CORTE DE TERRENO A NIVEL DE SUBRASANTE CON MAQUINARIA', 'm3', calz * corte, 15.67),
    P('02.02', 'PERFILADO Y COMPACTADO DE SUBRASANTE', 'm2', calz, 6.26),
    P('02.03', 'ELIMINACION DE MATERIAL EXCEDENTE D=5 KM', 'm3', calz * corte * 1.25, 25.51),
    T('03', 'PAVIMENTO FLEXIBLE'),
    P('03.01', 'BASE GRANULAR E=0.20M', 'm2', calz, 22.8),
    P('03.02', 'IMPRIMACION ASFALTICA CON MC-30', 'm2', calz, 9.4),
    P('03.03', 'CARPETA ASFALTICA EN CALIENTE E=2"', 'm2', calz, 70.65),
    T('04', 'SARDINELES'),
    P('04.01', 'EXCAVACION DE ZANJA PARA SARDINEL', 'm3', sard * 0.2 * 0.45, 109.34),
    P('04.02', 'ENCOFRADO Y DESENCOFRADO DE SARDINELES', 'm2', sard * 0.4 * 2, 58.56),
    P('04.03', "SARDINEL DE CONCRETO 0.15X0.40 F'C=175 KG/CM2", 'm3', sard * 0.15 * 0.4, 448.88),
    P('04.04', 'CURADO DE CONCRETO EN SARDINELES', 'm', sard, 3.15),
    T('05', 'VEREDAS'),
    P('05.01', 'EXCAVACION PARA VEREDA H=20CM', 'm3', ver * 0.2, 109.34),
    P('05.02', 'BASE DE AFIRMADO PARA VEREDAS E=0.10M', 'm2', ver, 14.49),
    P('05.03', 'ENCOFRADO Y DESENCOFRADO EN VEREDAS', 'm2', L * 2 * 2 * 0.1, 55.26),
    P('05.04', "VEREDA DE CONCRETO E=0.10 M F'C=175 KG/CM2", 'm3', ver * 0.1, 448.88),
    P('05.05', 'CURADO DE CONCRETO EN VEREDAS', 'm2', ver, 2.56),
    P('05.06', 'JUNTAS DE DILATACION EN VEREDAS @3.00M', 'm', (ver / 3) * 1.2, 7.62),
    T('06', 'SEÑALIZACION'),
    P('06.01', 'PINTURA DE TRAFICO SOBRE PAVIMENTO', 'm2', calz * 0.1, 22.27),
    T('06.02', 'SEÑALIZACION VERTICAL'),
    P('06.02.01', 'CONCRETO PARA SOPORTE DE SEÑALES', 'm3', 0.96, 392.07),
    P('06.02.02', 'SUMINISTRO E INSTALACION DE SEÑAL VERTICAL', e.E3 ? 'glb' : 'und', 6, 287.0), // E3
    T('07', 'VARIOS'),
    P('07.01', 'LIMPIEZA FINAL DE OBRA', 'm2', calz + ver, 0.35),
    P('07.02', 'MITIGACION DE IMPACTO AMBIENTAL', 'glb', 1, 4500.0),
    P('07.03', 'SEGURIDAD Y SALUD EN OBRA', 'glb', 1, 5976.0),
    ...(drenaje ? [
      T('08', 'DRENAJE PLUVIAL'),
      P('08.01', "CUNETA TRIANGULAR DE CONCRETO F'C=175 KG/CM2 A=0.60 M", 'm', L * 2, 38.0),
      P('08.02', "BADEN DE CONCRETO F'C=210 KG/CM2 E=0.20 M EN INTERSECCIONES", 'm2', 24, 120.0),
    ] : []),
  ];
}


// ---------- Análisis de precios unitarios (formato S10) ----------
// Jornada de 8 h; cantidad de mano de obra o equipo = cuadrilla × 8 / rendimiento.
const MO = { OPERARIO: 26.4, OFICIAL: 21.2, PEON: 19.1, TOPOGRAFO: 26.4, 'OPERADOR DE EQUIPO PESADO': 26.4 };
const CODMO = { OPERARIO: '0147010002', OFICIAL: '0147010003', PEON: '0147010004', TOPOGRAFO: '0147030090', 'OPERADOR DE EQUIPO PESADO': '0147010022' };
const conc = [['CEMENTO PORTLAND TIPO I (42.5 KG)', 'bls', 8.43, 29.5], ['ARENA GRUESA', 'm3', 0.54, 65.0], ['PIEDRA CHANCADA 1/2"', 'm3', 0.55, 78.0], ['AGUA PUESTA EN OBRA', 'm3', 0.18, 6.5]];
const SPEC = {
  '01.01': { rend: 1, mo: [['OPERARIO', 1], ['PEON', 2]], mat: [['GIGANTOGRAFIA 3.60X2.40 M', 'und', 1, 980], ['MADERA TORNILLO', 'p2', 45, 6.5], ['CLAVOS PARA MADERA', 'kg', 1.5, 6.0]] },
  '01.02': { sub: [['MOVILIZACION Y DESMOVILIZACION DE EQUIPOS', 'glb', 1, 6500]] },
  '01.03': { rend: 500, mo: [['TOPOGRAFO', 1], ['PEON', 2]], mat: [['YESO EN BOLSAS DE 25 KG', 'bol', 0.01, 12], ['ESTACAS DE MADERA', 'und', 0.02, 1.5]], eq: [['ESTACION TOTAL', 'hm', 1, 22]] },
  '01.04': { sub: [['DESVIO Y MANTENIMIENTO DE TRANSITO', 'glb', 1, 3200]] },
  '02.01': { rend: 300, mo: [['OPERADOR DE EQUIPO PESADO', 1], ['PEON', 2]], eq: [['EXCAVADORA SOBRE ORUGAS 115-165 HP', 'hm', 1, 220]] },
  '02.02': { rend: 1500, mo: [['OPERADOR DE EQUIPO PESADO', 2], ['PEON', 4]], mat: [['AGUA PUESTA EN OBRA', 'm3', 0.02, 6.5]], eq: [['MOTONIVELADORA 125 HP', 'hm', 1, 210], ['RODILLO LISO VIBRATORIO 10-12 TN', 'hm', 1, 190]] },
  '02.03': { rend: 400, mo: [['PEON', 1]], eq: [['CARGADOR FRONTAL 125 HP', 'hm', 1, 180], ['CAMION VOLQUETE 15 M3', 'hm', 4, 170]] },
  '03.01': { rend: 500, mo: [['OPERADOR DE EQUIPO PESADO', 3], ['PEON', 4]], mat: [['AFIRMADO PARA BASE GRANULAR', 'm3', 0.26, 55], ['AGUA PUESTA EN OBRA', 'm3', 0.03, 6.5]], eq: [['MOTONIVELADORA 125 HP', 'hm', 1, 210], ['RODILLO LISO VIBRATORIO 10-12 TN', 'hm', 1, 190], ['CAMION CISTERNA 2000 GL', 'hm', 1, 120]] },
  '03.02': { rend: 2000, mo: [['OPERARIO', 1], ['PEON', 4]], mat: [['ASFALTO LIQUIDO MC-30', 'gal', 0.3, 14.2], ['KEROSENE INDUSTRIAL', 'gal', 0.06, 12.5]], eq: [['CAMION IMPRIMADOR 1800 GL', 'hm', 1, 260]] },
  '03.03': { rend: 1000, mo: [['OPERADOR DE EQUIPO PESADO', 3], ['PEON', 6]], mat: [['MEZCLA ASFALTICA EN CALIENTE', 'm3', 0.0635, 520]], eq: [['PAVIMENTADORA SOBRE ORUGAS 69 HP', 'hm', 1, 320], ['RODILLO NEUMATICO 81-100 HP', 'hm', 1, 210], ['RODILLO TANDEM ESTATICO 8-10 TN', 'hm', 1, 180]] },
  '04.01': { rend: 4, mo: [['PEON', 1]] },
  '04.02': { rend: 14, mo: [['OPERARIO', 1], ['OFICIAL', 1]], mat: [['MADERA TORNILLO', 'p2', 2.5, 6.5], ['CLAVOS PARA MADERA', 'kg', 0.2, 6.0], ['ALAMBRE NEGRO N° 8', 'kg', 0.2, 6.5]] },
  '04.03': { rend: 12, mo: [['OPERARIO', 1], ['OFICIAL', 1], ['PEON', 6]], mat: conc, eq: [['MEZCLADORA DE CONCRETO 9-11 P3', 'hm', 1, 25], ['VIBRADOR DE CONCRETO 4 HP 1.50"', 'hm', 1, 15]] },
  '04.04': { rend: 600, mo: [['PEON', 1]], mat: [['CURADOR QUIMICO PARA CONCRETO', 'gal', 0.012, 22]] },
  '05.01': { rend: 4, mo: [['PEON', 1]] },
  '05.02': { rend: 120, mo: [['OPERARIO', 1], ['PEON', 4]], mat: [['AFIRMADO', 'm3', 0.13, 55], ['AGUA PUESTA EN OBRA', 'm3', 0.02, 6.5]], eq: [['COMPACTADOR VIBRATORIO TIPO PLANCHA 4 HP', 'hm', 1, 12]] },
  '05.03': { rend: 14, mo: [['OPERARIO', 1], ['OFICIAL', 1]], mat: [['MADERA TORNILLO', 'p2', 2.2, 6.5], ['CLAVOS PARA MADERA', 'kg', 0.2, 6.0]] },
  '05.04': { rend: 12, mo: [['OPERARIO', 1], ['OFICIAL', 1], ['PEON', 6]], mat: conc, eq: [['MEZCLADORA DE CONCRETO 9-11 P3', 'hm', 1, 25]] },
  '05.05': { rend: 600, mo: [['PEON', 1]], mat: [['CURADOR QUIMICO PARA CONCRETO', 'gal', 0.04, 22]] },
  '05.06': { rend: 120, mo: [['OPERARIO', 1], ['PEON', 1]], mat: [['ASFALTO RC-250', 'gal', 0.05, 15], ['ARENA FINA', 'm3', 0.002, 60]] },
  '06.01': { rend: 150, mo: [['OPERARIO', 1], ['PEON', 2]], mat: [['PINTURA DE TRAFICO', 'gal', 0.12, 85], ['MICROESFERAS DE VIDRIO', 'kg', 0.15, 9]], eq: [['MAQUINA PINTADORA DE TRAFICO', 'hm', 1, 30]] },
  '06.02.01': { rend: 3, mo: [['OPERARIO', 1], ['PEON', 2]], mat: conc },
  '06.02.02': { rend: 6, mo: [['OPERARIO', 1], ['PEON', 1]], mat: [['SEÑAL VERTICAL REGLAMENTARIA 0.60X0.60 M', 'und', 1, 180], ['TUBO DE FIERRO GALVANIZADO 2" X 3.00 M', 'und', 1, 65]] },
  '07.01': { rend: 1500, mo: [['PEON', 2]] },
  '07.02': { sub: [['MITIGACION DE IMPACTO AMBIENTAL', 'glb', 1, 4500]] },
  '07.03': { sub: [['EQUIPOS DE PROTECCION INDIVIDUAL Y COLECTIVA', 'glb', 1, 5976]] },
  '08.01': { rend: 40, mo: [['OPERARIO', 1], ['OFICIAL', 1], ['PEON', 4]], mat: [['CEMENTO PORTLAND TIPO I (42.5 KG)', 'bls', 0.506, 29.5], ['ARENA GRUESA', 'm3', 0.033, 65.0], ['PIEDRA CHANCADA 1/2"', 'm3', 0.033, 78.0], ['MADERA TORNILLO', 'p2', 0.8, 6.5]], eq: [['MEZCLADORA DE CONCRETO 9-11 P3', 'hm', 1, 25]] },
  '08.02': { rend: 20, mo: [['OPERARIO', 1], ['OFICIAL', 1], ['PEON', 4]], mat: [['CEMENTO PORTLAND TIPO I (42.5 KG)', 'bls', 1.94, 29.5], ['ARENA GRUESA', 'm3', 0.104, 65.0], ['PIEDRA CHANCADA 1/2"', 'm3', 0.11, 78.0], ['ACERO CORRUGADO FY=4200 KG/CM2', 'kg', 3.2, 4.6]], eq: [['MEZCLADORA DE CONCRETO 9-11 P3', 'hm', 1, 25], ['VIBRADOR DE CONCRETO 4 HP 1.50"', 'hm', 1, 15]] },
};
const CODMAT = (d) => '02' + String(Math.abs([...d].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 99999999).padStart(8, '0');

function construirApu(i, e) {
  const s = SPEC[i.codigo];
  const rec = [];
  let mo = 0;
  if (s.mo) for (const [rol, cuad] of s.mo) {
    let cant = Math.round((cuad * 8 / s.rend) * 10000) / 10000;
    if (e.E15 && i.codigo === '01.03' && rol === 'TOPOGRAFO') cant = 0.04; // E15: cantidad que no corresponde a cuadrilla y rendimiento
    const parc = r2(cant * MO[rol]); mo += parc;
    rec.push(['Mano de Obra', CODMO[rol], rol, 'hh', cuad, cant, MO[rol], parc]);
  }
  if (s.mo) { const parc = r2(mo * 0.03); rec.push(['Equipos', '0337010001', 'HERRAMIENTAS MANUALES', '%MO', null, 3, r2(mo), parc]); }
  let mat = s.mat ?? [];
  if (e.E14 && i.codigo === '04.03') mat = [['CEMENTO PORTLAND TIPO I (42.5 KG)', 'bls', 8.43, 29.5], ['ARENA GRUESA', 'm3', 0.3, 65.0], ['PIEDRA CHANCADA 1/2"', 'm3', 0.2, 78.0], ['AGUA PUESTA EN OBRA', 'm3', 0.18, 6.5]]; // E14
  for (const [d, u, c, p] of mat) rec.push(['Materiales', CODMAT(d), d, u, null, c, p, r2(c * p)]);
  for (const [d, u, cuad, p] of s.eq ?? []) { const cant = Math.round((cuad * 8 / s.rend) * 10000) / 10000; rec.push(['Equipos', CODMAT(d), d, u, cuad, cant, p, r2(cant * p)]); }
  for (const [d, u, c, p] of s.sub ?? []) rec.push(['Subcontratos', CODMAT(d), d, u, null, c, p, r2(c * p)]);
  const costo = r2(rec.reduce((a, r) => a + r[7], 0));
  return { codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, rend: s.rend ?? 1, costo, rec };
}

/** Calcula parciales y subtotales; si E2, el título 06 no suma su subtítulo 06.02 (como en Jaime Blanco). */
function calcular(items, e) {
  for (const i of items) if (!i.titulo) i.parcial = r2(i.metrado * i.precio);
  const hojasDe = (c) => items.filter((x) => !x.titulo && x.codigo.startsWith(c + '.'));
  for (const t of items.filter((x) => x.titulo)) {
    let s = hojasDe(t.codigo).reduce((a, b) => a + b.parcial, 0);
    if (e.E2 && t.codigo === '06') s -= hojasDe('06.02').reduce((a, b) => a + b.parcial, 0);
    t.parcial = r2(s);
  }
  const cd = r2(items.filter((x) => !x.titulo).reduce((a, b) => a + b.parcial, 0));
  const gg = r2(cd * 0.08), ut = r2(cd * 0.05), st = r2(cd + gg + ut), igv = r2(st * 0.18), total = r2(st + igv);
  return { cd, gg, ut, st, igv, total };
}

// ---------- Escritura PDF ----------
function nuevoDoc(exp) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 40, right: 40 }, bufferPages: true, info: { Title: exp.nombre, Author: 'Documento sintético – Axis' } });
  doc.pipe(fs.createWriteStream(new URL(exp.archivo, OUT)));
  return doc;
}
function cabecera(doc, titulo) {
  doc.font('Helvetica').fontSize(7).fillColor('#888').text('EXPEDIENTE TECNICO SINTETICO - DEMOSTRACION Axis (no corresponde a una obra real)', 40, 24, { width: 515, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#222').text(titulo, 40, 44, { width: 515, lineBreak: false });
  return 66;
}
function fila(doc, y, celdas, cols, { bold = false, size = 7.2 } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#111');
  celdas.forEach((c, i) => { if (c !== '' && c != null) doc.text(String(c), cols[i].x, y, { width: cols[i].w, align: cols[i].a ?? 'left', lineBreak: false }); });
  return y + size + 4.2;
}
function parrafo(doc, y, t, { size = 8.5, bold = false } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#111').text(t, 40, y, { width: 515 });
  return doc.y + 3;
}

const COLS_PRES = [{ x: 40, w: 46 }, { x: 88, w: 280 }, { x: 370, w: 26 }, { x: 398, w: 50, a: 'right' }, { x: 450, w: 45, a: 'right' }, { x: 497, w: 58, a: 'right' }];

function generar(exp) {
  const e = exp.errores;
  const items = partidasCalle(exp.longitud, e, !!exp.drenaje && !e.E20);
  const apus = items.filter((i) => !i.titulo).map((i) => construirApu(i, e));
  for (const a of apus) {
    const i = items.find((x) => x.codigo === a.codigo);
    i.precio = a.costo;
    if (e.E13 && i.codigo === '05.04') i.precio = r2(a.costo + 6.32); // E13: precio del presupuesto ≠ costo del APU (Salaverry)
  }
  const tot = calcular(items, e);
  const doc = nuevoDoc(exp);
  const inicio = exp.inicio; // [a, m, d]

  // 1. Carátula
  let y = cabecera(doc, 'EXPEDIENTE TECNICO DE OBRA');
  y = parrafo(doc, 120, `PROYECTO: ${exp.nombre}`, { bold: true, size: 9 });
  y = parrafo(doc, y + 6, `CUI: ${exp.cui} (ficticio)`);
  y = parrafo(doc, y, `ENTIDAD: ${exp.entidad}`);
  y = parrafo(doc, y, `UBICACION: DISTRITO DE ${exp.distrito}, PROVINCIA DE TRUJILLO, DEPARTAMENTO DE LA LIBERTAD`);
  if (exp.coord) y = parrafo(doc, y, `COORDENADAS (WGS84): ${exp.coord[0].toFixed(5)}, ${exp.coord[1].toFixed(5)}`);
  y = parrafo(doc, y, `PLAZO DE EJECUCION: ${exp.plazo} DIAS CALENDARIO`);
  y = parrafo(doc, y, 'SISTEMA DE CONTRATACION: PRECIOS UNITARIOS');
  y = parrafo(doc, y, 'PROYECTISTA: CONSULTORA FICTICIA DEMO S.A.C.');
  // Datos personales FICTICIOS: sirven para mostrar que Axis los oculta en el navegador antes de enviar el texto
  y = parrafo(doc, y, 'Responsable del proyecto: Ing. Rosa Quispe Díaz, CIP 123456, DNI 41234567');
  y = parrafo(doc, y, 'Contacto: 987 654 321, proyectista.demo@ejemplo.pe');
  parrafo(doc, y + 20, 'Documento elaborado para pruebas del prototipo Axis (Hackathon Innova Norte 3G, UNT). Los errores que contiene reproducen errores reales observados en licitaciones de obras de La Libertad.', { size: 7.5 });

  // 2. Memoria descriptiva
  doc.addPage();
  y = cabecera(doc, 'MEMORIA DESCRIPTIVA');
  y = parrafo(doc, y + 6, `PROYECTO: ${exp.nombre}`, { bold: true });
  y = parrafo(doc, y, `1. Antecedentes. La vía no cuenta con pavimento ni veredas en ${exp.longitud} m de longitud. Los vecinos han solicitado su mejoramiento.`);
  y = parrafo(doc, y, `2. Metas físicas. Pavimento flexible de 6.00 m de ancho (${f2(r2(exp.longitud * 6))} m2), sardineles de concreto (${f2(r2(exp.longitud * 2))} m), veredas de concreto de 1.20 m de ancho a ambos lados (${f2(r2(exp.longitud * 2.4))} m2) y señalización.`);
  y = parrafo(doc, y, `3. Plazo de ejecución: ${exp.plazo} días calendario. Modalidad: contrata, a precios unitarios.`);
  if (exp.coord) y = parrafo(doc, y, `4. Ubicación: ${exp.via}, distrito de ${exp.distrito.toLowerCase()}. Coordenadas del punto medio del tramo: ${exp.coord[0].toFixed(5)}, ${exp.coord[1].toFixed(5)} (WGS84).`);
  else y = parrafo(doc, y, `4. Ubicación: ${exp.via}, distrito de ${exp.distrito.toLowerCase()}.`);
  if (exp.drenaje && !e.E20) y = parrafo(doc, y, `5. Drenaje pluvial. La calle tiene pendiente y recibe agua de las calles altas; se proyectan cunetas triangulares de concreto a ambos lados (${f2(r2(exp.longitud * 2))} m) y badenes en las intersecciones, según la Norma CE.040.`);
  y = parrafo(doc, y, '6. Redes existentes. El proyecto no interviene las redes de agua potable ni de alcantarillado; se ejecutará sobre las redes existentes.');

  // 3. Presupuesto (tipo S10)
  doc.addPage();
  y = cabecera(doc, 'PRESUPUESTO');
  y = fila(doc, y + 4, ['Presupuesto', '0101001', exp.nombre], [{ x: 40, w: 50 }, { x: 92, w: 40 }, { x: 134, w: 420 }]);
  y = fila(doc, y, ['Cliente', exp.entidad, 'Costo al', exp.costoAl], [{ x: 40, w: 50 }, { x: 92, w: 330 }, { x: 440, w: 40 }, { x: 485, w: 70 }]);
  y = fila(doc, y, ['Lugar', `LA LIBERTAD - TRUJILLO - ${exp.distrito}`], [{ x: 40, w: 50 }, { x: 92, w: 400 }]);
  y = fila(doc, y + 4, ['Item', 'Descripción', 'Und.', 'Metrado', 'Precio S/', 'Parcial S/'], COLS_PRES, { bold: true });
  for (const i of items) {
    if (y > 770) { doc.addPage(); y = cabecera(doc, 'PRESUPUESTO'); y = fila(doc, y + 4, ['Item', 'Descripción', 'Und.', 'Metrado', 'Precio S/', 'Parcial S/'], COLS_PRES, { bold: true }); }
    y = i.titulo ? fila(doc, y, [i.codigo, i.descripcion, '', '', '', f2(i.parcial)], COLS_PRES, { bold: true })
      : fila(doc, y, [i.codigo, i.descripcion, i.unidad, f2(i.metrado), f2(i.precio), f2(i.parcial)], COLS_PRES);
  }
  const R = [{ x: 88, w: 300 }, { x: 497, w: 58, a: 'right' }];
  y = fila(doc, y + 6, ['COSTO DIRECTO', f2(tot.cd)], R, { bold: true });
  y = fila(doc, y, ['GASTOS GENERALES (8%)', f2(tot.gg)], R);
  y = fila(doc, y, ['UTILIDAD (5%)', f2(tot.ut)], R);
  y = fila(doc, y, ['SUB TOTAL', f2(tot.st)], R, { bold: true });
  y = fila(doc, y, ['IGV (18%)', f2(tot.igv)], R);
  y = fila(doc, y, ['PRESUPUESTO DE OBRA', f2(tot.total)], R, { bold: true });
  const enLetras = e.E1 ? r2(tot.total + 20000) : tot.total; // E1
  y = fila(doc, y + 6, ['SON :', letras(enLetras)], [{ x: 40, w: 30 }, { x: 74, w: 480 }]);

  // 4. Resumen de metrados
  if (!exp.falta?.includes('metrados')) {
  doc.addPage();
  // Planilla como las reales: cada metrado sale de sus medidas (veces × largo × ancho × alto).
  y = cabecera(doc, 'PLANILLA DE METRADOS');
  const COLS_M = [{ x: 40, w: 34 }, { x: 76, w: 216 }, { x: 294, w: 20 }, { x: 316, w: 24, a: 'right' }, { x: 342, w: 38, a: 'right' }, { x: 382, w: 34, a: 'right' }, { x: 418, w: 28, a: 'right' }, { x: 448, w: 50, a: 'right' }, { x: 500, w: 55, a: 'right' }];
  const filaM = (yy, celdas, op = {}) => fila(doc, yy, celdas, COLS_M, { size: 6.4, ...op });
  const TRAMO = exp.longitud ?? 260;
  const medidas = (und, met, desc) => {
    const espesor = Number((/(?:E|H)\s*=\s*([\d.]+)\s*(CM|M)?/i.exec(desc) ?? [])[1] ?? 0);
    const alto = espesor ? (/H\s*=\s*[\d.]+\s*CM/i.test(desc) ? espesor / 100 : espesor) : 0.2;
    if (und === 'm3') return ['1.00', f2(TRAMO), f2(met / (TRAMO * alto)), f2(alto)];
    if (und === 'm2') return ['1.00', f2(TRAMO), f2(met / TRAMO), ''];
    if (und === 'm') return [f2(met / TRAMO), f2(TRAMO), '', ''];
    return [f2(met), '', '', ''];
  };
  y = filaM(y + 4, ['Item', 'Descripción', 'Und.', 'Veces', 'Largo', 'Ancho', 'Alto', 'Parcial', 'Total'], { bold: true });
  for (const i of items) {
    if (e.E6 && i.codigo === '05.06') continue; // E6: partida presupuestada sin metrado
    let und = i.unidad, met = i.metrado;
    if (e.E5 && i.codigo === '01.03') und = 'm'; // E5: unidad distinta
    if (e.E4 && i.codigo === '03.01') met = r2(i.metrado * 0.96); // E4: metrado distinto (4%)
    if (y > 770) { doc.addPage(); y = cabecera(doc, 'PLANILLA DE METRADOS'); y = filaM(y + 4, ['Item', 'Descripción', 'Und.', 'Veces', 'Largo', 'Ancho', 'Alto', 'Parcial', 'Total'], { bold: true }); }
    y = i.titulo ? filaM(y, [i.codigo, i.descripcion, '', '', '', '', '', '', ''], { bold: true })
      : filaM(y, [i.codigo, i.descripcion, und, ...medidas(und, met, i.descripcion), f2(met), f2(met)]);
  }
  }

  // 4b. Análisis de precios unitarios
  if (!exp.falta?.includes('apu')) {
    doc.addPage();
    y = cabecera(doc, 'ANALISIS DE PRECIOS UNITARIOS');
    const COLS_A = [{ x: 40, w: 56 }, { x: 98, w: 230 }, { x: 330, w: 30 }, { x: 362, w: 44, a: 'right' }, { x: 408, w: 48, a: 'right' }, { x: 458, w: 46, a: 'right' }, { x: 506, w: 49, a: 'right' }];
    for (const a of apus) {
      const alto = (3 + a.rec.length + new Set(a.rec.map((r) => r[0])).size) * 11.5;
      if (y + alto > 790) { doc.addPage(); y = cabecera(doc, 'ANALISIS DE PRECIOS UNITARIOS'); } // el bloque nunca se corta entre páginas
      y = fila(doc, y + 5, ['Partida', a.codigo, a.descripcion], [{ x: 40, w: 40 }, { x: 82, w: 50 }, { x: 134, w: 420 }], { bold: true });
      y = fila(doc, y, ['Rendimiento', `${a.unidad}/DIA`, f4(a.rend), 'EQ.', f4(a.rend), `Costo unitario directo por : ${a.unidad}`, f2(a.costo)],
        [{ x: 40, w: 48 }, { x: 90, w: 40 }, { x: 132, w: 50, a: 'right' }, { x: 186, w: 20 }, { x: 208, w: 50, a: 'right' }, { x: 300, w: 180 }, { x: 497, w: 58, a: 'right' }]);
      let cat = '';
      for (const r of a.rec) {
        if (r[0] !== cat) { cat = r[0]; y = fila(doc, y, ['', cat], COLS_A, { bold: true }); }
        y = fila(doc, y, [r[1], r[2], r[3], r[4] == null ? '' : f4(r[4]), f4(r[5]), f2(r[6]), f2(r[7])], COLS_A);
      }
    }
  }

  // 4c. Desagregado de gastos generales
  if (!exp.falta?.includes('gastos')) {
    doc.addPage();
    y = cabecera(doc, 'DESAGREGADO DE GASTOS GENERALES');
    const meses = exp.plazo / 30;
    const personal = [['Residente de obra', 9500], ['Asistente técnico', 4000], ['Prevencionista de seguridad', 4000]];
    const base = personal.reduce((a, [, p]) => a + meses * p, 0);
    const part = Math.max(0.1, Math.floor((0.7 * tot.gg / base) * 100) / 100);
    const filas = personal.map(([d, p], k) => {
      const t = e.E16 && k === 0 ? meses + 1 : meses; // E16: residente pagado un mes más que el plazo (El Porvenir, Pacanga)
      return [d, 'mes', part, t, p, r2(part * t * p)];
    });
    filas.push(['Gastos de licitación y contrato', 'glb', 1, 1, 800, 800]);
    const resto = r2(tot.gg - filas.reduce((a, f) => a + f[5], 0));
    filas.push(['Seguros, fianzas y gastos financieros', 'glb', 1, 1, resto, resto]);
    const COLS_G = [{ x: 40, w: 240 }, { x: 282, w: 36 }, { x: 320, w: 50, a: 'right' }, { x: 372, w: 56, a: 'right' }, { x: 430, w: 60, a: 'right' }, { x: 492, w: 63, a: 'right' }];
    y = fila(doc, y + 4, ['Descripción', 'Unidad', 'Cantidad', 'Tiempo (meses)', 'Precio S/', 'Parcial S/'], COLS_G, { bold: true });
    for (const f of filas) y = fila(doc, y, [f[0], f[1], f2(f[2]), f2(f[3]), f2(f[4]), f2(f[5])], COLS_G);
    y = fila(doc, y + 4, ['TOTAL GASTOS GENERALES', f2(tot.gg)], [{ x: 40, w: 300 }, { x: 492, w: 63, a: 'right' }], { bold: true });
  }

  // 5. Especificaciones técnicas
  const UM = { m2: 'Metro cuadrado (m2)', m3: 'Metro cúbico (m3)', m: 'Metro lineal (m)', und: 'Unidad (und)', glb: 'Global (glb)' };
  doc.addPage();
  y = cabecera(doc, 'ESPECIFICACIONES TECNICAS');
  for (const i of items.filter((x) => !x.titulo)) {
    if (e.E17 && i.codigo === '07.02') continue; // E17: partida sin especificación técnica (Huanchaco)
    if (y > 700) { doc.addPage(); y = cabecera(doc, 'ESPECIFICACIONES TECNICAS'); }
    let titulo = i.descripcion;
    let texto = 'El contratista ejecutará la partida conforme a los planos, a estas especificaciones y a las indicaciones del supervisor.';
    if (i.codigo === '05.04') {
      const esp = e.E7 ? '0.15' : '0.10'; // E7
      titulo = `VEREDA DE CONCRETO E=${esp} M F'C=175 KG/CM2`;
      texto = `Vereda de concreto f'c = 175 kg/cm2 de espesor e = ${esp} m, con bruñas cada 1.00 m y juntas de dilatación cada 3.00 m.`;
    } else if (/SARDINEL DE CONCRETO/.test(i.descripcion)) texto = "Concreto f'c = 175 kg/cm2, sección 0.15 x 0.40 m, vaciado sobre terreno compactado.";
    y = fila(doc, y + 3, [i.codigo, titulo.toUpperCase()], [{ x: 40, w: 46 }, { x: 88, w: 467 }], { bold: true, size: 8 });
    y = parrafo(doc, y, `Descripción. ${texto}`, { size: 7.8 });
    y = parrafo(doc, y, `Unidad de medida: ${UM[i.unidad] ?? i.unidad}.`, { size: 7.8 });
    y = parrafo(doc, y, 'Forma de pago: según el metrado ejecutado y aprobado por la supervisión, al precio unitario del presupuesto.', { size: 7.8 });
  }

  // 6. Fórmula polinómica
  if (!exp.falta?.includes('formula')) {
    doc.addPage();
    y = cabecera(doc, 'FORMULA POLINOMICA');
    y = parrafo(doc, y + 6, 'Fórmula de reajuste de precios elaborada conforme al D.S. N° 011-79-VC y sus modificatorias.');
    const mon = e.E9
      ? [[0.42, 'MO', 'Mano de obra (47)'], [0.21, 'A', 'Asfalto (13)'], [0.16, 'C', 'Cemento (21)'], [0.18, 'E', 'Maquinaria y equipo (49)'], [0.03, 'F', 'Fierro corrugado (03)']] // E9
      : [[0.40, 'MO', 'Mano de obra (47)'], [0.21, 'A', 'Asfalto (13)'], [0.16, 'C', 'Cemento (21)'], [0.15, 'E', 'Maquinaria y equipo (49)'], [0.08, 'GU', 'Índice general de precios al consumidor (39)']];
    const exprs = mon.map(([c, s]) => `${f3(c)}*(${s}r/${s}o)`);
    y = parrafo(doc, y + 4, `K = ${exprs.slice(0, 3).join(' + ')}`, { bold: true });
    y = parrafo(doc, y, `+ ${exprs.slice(3).join(' + ')}`, { bold: true });
    for (const [c, s, n] of mon) y = parrafo(doc, y, `${s}: ${n} — coeficiente de incidencia ${f3(c)}`, { size: 7.8 });
  }

  // 7. Cronograma
  if (!exp.falta?.includes('cronograma')) {
    doc.addPage();
    y = cabecera(doc, 'CRONOGRAMA DE EJECUCION DE OBRA');
    const plan = { // [inicio, duración] en días desde el inicio
      '01.01': [0, 2], '01.02': [0, 2], '01.03': [1, 6], '01.04': [0, 85],
      '02.01': [2, 12], '02.02': [12, 8], '02.03': [3, 14],
      '04.01': [14, 8], '04.02': [18, 12], '04.03': [20, 14], '04.04': [21, 15],
      '03.01': [24, 14], '03.02': [40, 3], '03.03': [43, 7],
      '05.01': [34, 10], '05.02': [42, 8], '05.03': [48, 12], '05.04': [50, 16], '05.05': [51, 17], '05.06': [52, 16],
      '06.01': [70, 8], '06.02.01': [70, 4], '06.02.02': [74, 5],
      '07.01': [86, 4], '07.02': [0, 90], '07.03': [0, 90],
      '08.01': [56, 18], '08.02': [62, 8],
    };
    if (e.E10) plan['06.01'] = [20, 8]; // E10: pintura de tráfico antes de base, imprimación y carpeta
    if (e.E11) { plan['07.01'] = [90, 5]; } // E11: 95 días frente a 90 declarados
    if (e.E19) plan['03.01'] = [24, 1]; // E19: base granular en 1 día, imposible con el rendimiento del APU (Jaime Blanco)
    const COLS_C = [{ x: 40, w: 46 }, { x: 88, w: 300 }, { x: 390, w: 40, a: 'right' }, { x: 440, w: 55, a: 'right' }, { x: 500, w: 55, a: 'right' }];
    y = parrafo(doc, y + 4, `Plazo de ejecución: ${exp.plazo} días calendario. Inicio previsto: ${fecha(dia(inicio, 0))}.`);
    y = fila(doc, y + 4, ['Item', 'Actividad', 'Días', 'Inicio', 'Fin'], COLS_C, { bold: true });
    for (const i of items.filter((x) => !x.titulo)) {
      const [ini, dur] = plan[i.codigo];
      y = fila(doc, y, [i.codigo, i.descripcion, String(dur), fecha(dia(inicio, ini)), fecha(dia(inicio, ini + dur - 1))], COLS_C);
    }
  }

  // 8. Cotizaciones
  doc.addPage();
  y = cabecera(doc, 'COTIZACION N° 0457-2026');
  y = parrafo(doc, y + 6, 'Proveedor: ASFALTOS Y AGREGADOS DEL NORTE S.A.C.');
  y = parrafo(doc, y, 'RUC: 20000000001 (ficticio)');
  y = parrafo(doc, y, `Fecha: ${exp.fechaCotizacion}`); // E8 si es posterior al "costo al"
  y = parrafo(doc, y, `Obra: ${exp.nombre}`);
  y = parrafo(doc, y + 4, 'Mezcla asfáltica en caliente puesta en obra: S/ 520.00 por m3. Asfalto líquido MC-30: S/ 14.20 por galón. Validez de la oferta: 30 días.');

  // 9. Estudio de mecánica de suelos
  if (!exp.falta?.includes('suelos')) {
    doc.addPage();
    y = cabecera(doc, 'ESTUDIO DE MECANICA DE SUELOS CON FINES DE PAVIMENTACION');
    const proy = e.E12 ? 'MEJORAMIENTO DEL SERVICIO DE AGUA POTABLE Y ALCANTARILLADO EN EL AA.HH. LAS GARDENIAS - CHEPEN' : exp.nombre; // E12
    y = parrafo(doc, y + 6, `PROYECTO: ${proy}`, { bold: true });
    y = parrafo(doc, y, 'Se ejecutaron 3 calicatas de 1.50 m de profundidad a lo largo del eje de la vía.');
    y = parrafo(doc, y, 'Perfil estratigráfico: arena limosa (SM) de compacidad media. No se encontró nivel freático hasta la profundidad explorada.');
    y = parrafo(doc, y, 'CBR al 95% de la máxima densidad seca: 14.5%. Se recomienda una base granular de 0.20 m y carpeta asfáltica de 2".');
  }

  // 10. Índice de planos
  if (!exp.falta?.includes('planos')) {
    doc.addPage();
    y = cabecera(doc, 'INDICE DE PLANOS');
    const lista = [['U-01', 'Ubicación y localización'], ['T-01', 'Topografía y perfil longitudinal'], ['SV-01', 'Secciones viales'], ['PV-01', 'Pavimentos, sardineles y veredas - detalles'], ['SE-01', 'Señalización horizontal y vertical'], ['PD-01', 'Plan de desvío de tránsito'], ...(exp.drenaje && !e.E20 ? [['D-01', 'Drenaje pluvial: cunetas y badenes']] : [])]
      .filter(([c]) => !(e.E18 && c === 'SE-01')); // E18: falta el plano de señalización (La Esperanza: partida sin plano)
    for (const [c, n] of lista) y = parrafo(doc, y + 2, `${c}  ${n}`);
  }

  // Numeración
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor('#888').text(`Página ${i + 1} de ${rango.count}`, 40, 810, { width: 515, align: 'center', lineBreak: false });
  }
  doc.end();
  return { total: tot.total, partidas: items.filter((x) => !x.titulo).length };
}

// ---------- Los 3 expedientes ----------
const TODOS = { E1: 1, E2: 1, E3: 1, E4: 1, E5: 1, E6: 1, E7: 1, E8: 1, E9: 1, E10: 1, E11: 1, E12: 1, E13: 1, E14: 1, E15: 1, E16: 1, E17: 1, E18: 1, E19: 1, E20: 1, E21: 1 };
const EXPEDIENTES = [
  {
    archivo: 'LL-01_pistas-calle-los-incas_con-errores.pdf', cui: '0000101',
    nombre: 'MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE LOS INCAS CUADRAS 4 A 6 - EL PORVENIR',
    entidad: 'MUNICIPALIDAD DISTRITAL DE EL PORVENIR', distrito: 'EL PORVENIR', via: 'Calle Los Incas, cuadras 4 a 6, sector El Mirador',
    coord: [-8.08600, -78.99480], longitud: 288, plazo: 90, inicio: [2026, 10, 5], costoAl: '15/08/2026', fechaCotizacion: '02/09/2026', errores: TODOS, drenaje: true,
  },
  {
    archivo: 'LL-02_pistas-calle-santa-clara_limpio.pdf', cui: '0000102',
    nombre: 'MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE SANTA CLARA CUADRAS 1 A 3 - EL PORVENIR',
    entidad: 'MUNICIPALIDAD DISTRITAL DE EL PORVENIR', distrito: 'EL PORVENIR', via: 'Calle Santa Clara, cuadras 1 a 3',
    coord: [-8.07839, -78.99510], longitud: 300, plazo: 90, inicio: [2026, 10, 5], costoAl: '15/08/2026', fechaCotizacion: '05/08/2026', errores: {}, drenaje: true,
  },
  {
    archivo: 'LL-03_pistas-pasaje-los-rosales_incompleto.pdf', cui: '0000103',
    nombre: 'MEJORAMIENTO DE PISTAS Y VEREDAS EN EL PASAJE LOS ROSALES - LA ESPERANZA',
    entidad: 'MUNICIPALIDAD DISTRITAL DE LA ESPERANZA', distrito: 'LA ESPERANZA', via: 'Pasaje Los Rosales',
    coord: null, longitud: 120, plazo: 60, inicio: [2026, 11, 2], costoAl: '20/09/2026', fechaCotizacion: '10/09/2026', errores: {},
    falta: ['metrados', 'formula', 'cronograma', 'suelos', 'planos'],
  },
  // Segundo set (La Esperanza): la obra de Morelos se paraliza por napa freática; O'Higgins está a 70 m.
  {
    archivo: 'LL-04_pistas-calle-jose-maria-morelos.pdf', cui: '0000104',
    nombre: 'MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE JOSE MARIA MORELOS - LA ESPERANZA',
    entidad: 'MUNICIPALIDAD DISTRITAL DE LA ESPERANZA', distrito: 'LA ESPERANZA', via: 'Calle José María Morelos',
    coord: [-8.07615, -79.04546], longitud: 260, plazo: 75, inicio: [2026, 3, 2], costoAl: '10/01/2026', fechaCotizacion: '05/01/2026',
    errores: { E4: 1, E7: 1, E13: 1, E16: 1, E17: 1 }, drenaje: true,
  },
  {
    archivo: 'LL-05_pistas-calle-bernardo-ohiggins.pdf', cui: '0000105',
    nombre: "MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE BERNARDO O'HIGGINS - LA ESPERANZA",
    entidad: 'MUNICIPALIDAD DISTRITAL DE LA ESPERANZA', distrito: 'LA ESPERANZA', via: "Calle Bernardo O'Higgins",
    coord: [-8.07650, -79.04608], longitud: 280, plazo: 90, inicio: [2026, 12, 1], costoAl: '20/10/2026', fechaCotizacion: '15/10/2026',
    errores: {}, drenaje: true,
  },
  // Un expediente nuevo en El Porvenir, a unos 870 m de Calle Los Incas.
  {
    archivo: 'LL-06_pistas-calle-hermanos-angulo.pdf', cui: '0000106',
    nombre: 'MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE HERMANOS ANGULO - EL PORVENIR',
    entidad: 'MUNICIPALIDAD DISTRITAL DE EL PORVENIR', distrito: 'EL PORVENIR', via: 'Calle Hermanos Angulo',
    coord: [-8.07885, -78.99809], longitud: 320, plazo: 90, inicio: [2026, 12, 7], costoAl: '25/10/2026', fechaCotizacion: '02/11/2026',
    errores: { E1: 1, E3: 1, E8: 1 }, drenaje: true,
  },
];

// Escenarios de la demo del servidor (src/datos/escenarios-demo.json): expediente original y cercano.
const rutaEscenarios = new URL('../../src/datos/escenarios-demo.json', import.meta.url);
const ESCENARIOS = fs.existsSync(rutaEscenarios) ? JSON.parse(fs.readFileSync(rutaEscenarios, 'utf8')) : [];
const articulo = (via) => (/^(Jirón|Pasaje)/.test(via) ? 'EL' : 'LA');
const sinTildes = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
for (const [n, esc] of ESCENARIOS.filter((x) => x.id !== 'E01').entries()) {
  for (const [lado, d] of [['A', esc.original], ['B', esc.cercano]]) {
    EXPEDIENTES.push({
      archivo: d.archivo.replace('/demo/', ''), cui: `00002${String(n * 2 + (lado === 'A' ? 1 : 2)).padStart(2, '0')}`,
      nombre: `MEJORAMIENTO DE PISTAS Y VEREDAS EN ${articulo(d.via)} ${sinTildes(d.via)} - ${sinTildes(esc.zona.split(',')[0])}`,
      entidad: `MUNICIPALIDAD DISTRITAL DE ${esc.original.distrito}`, distrito: esc.original.distrito, via: d.via,
      coord: d.coord, longitud: 240 + n * 10, plazo: 90, inicio: [2026, 12, 1], costoAl: '20/10/2026', fechaCotizacion: '15/10/2026',
      errores: lado === 'A' ? Object.fromEntries(esc.original.errores.map((e) => [e, 1])) : {},
      drenaje: !d.sinDrenaje,
    });
  }
}

const SOLO = process.argv.slice(3);
for (const exp of EXPEDIENTES.filter((x) => !SOLO.length || SOLO.includes(x.archivo))) {
  const r = generar(exp);
  console.log(`${exp.archivo}: ${r.partidas} partidas, presupuesto S/ ${f2(r.total)}`);
}
