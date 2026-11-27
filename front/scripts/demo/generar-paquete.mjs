// Genera el paquete de documentos SINTÉTICOS para recorrer Axis de punta a punta con una sola
// obra: Calle José María Morelos (La Esperanza). Empresas, RUC, personas y hechos son ficticios;
// la estructura sigue los anexos de las bases estándar (Ley 32069) y documentos reales del SEACE.
// Uso: node scripts/demo/generar-paquete.mjs <carpeta de salida>
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const SALIDA = process.argv[2];
if (!SALIDA) throw new Error('Indica la carpeta de salida.');

const OBRA = 'MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE JOSE MARIA MORELOS - LA ESPERANZA';
const ENTIDAD = 'MUNICIPALIDAD DISTRITAL DE LA ESPERANZA';
const PROCESO = 'LICITACIÓN PÚBLICA ABREVIADA N° 3-2026-MDLE/CS-1';
const VALOR_REFERENCIAL = 376279.8;
const CONTRATO = '045-2026-MDLE';
const SUPERVISOR = 'Ing. Carlos Rivas Soto – SUPERVISORES ASOCIADOS DEL NORTE S.A.C.';
const soles = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const redondeo = (n) => Math.round(n * 100) / 100;

function nuevo(carpeta, archivo) {
  fs.mkdirSync(path.join(SALIDA, carpeta), { recursive: true });
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 64, right: 64 }, autoFirstPage: false });
  doc.pipe(fs.createWriteStream(path.join(SALIDA, carpeta, archivo)));
  return doc;
}
function marca(doc, texto) {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#a02b25').text(texto, { align: 'center' }).moveDown(1).fillColor('#111');
}
const linea = (doc, etiqueta, valor) => doc.font('Helvetica-Bold').fontSize(10).text(`${etiqueta}: `, { continued: true }).font('Helvetica').text(valor);
const parrafo = (doc, t) => doc.font('Helvetica').fontSize(10).text(t, { align: 'justify', lineGap: 1.5 }).moveDown(0.6);
const firma = (doc, quien, ciudad) => { doc.moveDown(1.2).font('Helvetica').fontSize(10).text(ciudad).moveDown(1.5).text('………………………………………').text(quien); };
function tabla(doc, cabecera, filas, anchos) {
  let y = doc.y + 4;
  const x0 = doc.page.margins.left;
  const fila = (celdas, negrita) => {
    let x = x0;
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.6);
    celdas.forEach((c, i) => { doc.text(String(c), x, y, { width: anchos[i] - 6, lineBreak: false }); x += anchos[i]; });
    y += 15;
  };
  fila(cabecera, true);
  filas.forEach((f) => fila(f, false));
  doc.x = x0;
  doc.y = y + 6;
}

// ── 2. Selección: ofertas de los postores ───────────────────────────
const POSTORES = [
  {
    archivo: 'OFERTA-1_consorcio-vias-del-norte.pdf', consorcio: 'CONSORCIO VÍAS DEL NORTE', pct: 0.95,
    comun: { representante: 'Rosa Mendoza Lara', domicilio: 'Jr. Pizarro 410, Trujillo', correo: 'viasdelnorte@ejemplo.pe' },
    integrantes: [
      { nombre: 'INVERSIONES KALLPA S.A.C.', ruc: '20612345671', pct: 90, mype: 'SI', domicilio: 'Jr. Pizarro 410, Trujillo', telefono: '044-201010', correo: 'kallpa@ejemplo.pe', apoderado: 'Rosa Mendoza Lara', constitucion: '10 de febrero de 2026', partida: '11458822' },
      { nombre: 'CONSTRUCTORA ANDINA NORTE S.A.C.', ruc: '20481234567', pct: 10, mype: 'NO', domicilio: 'Av. América Norte 1820, Trujillo', telefono: '044-233400', correo: 'licitaciones@andinanorte.pe', apoderado: 'Jorge Salas Ibáñez', constitucion: '4 de mayo de 2009', partida: '11032291' },
    ],
  },
  { archivo: 'OFERTA-2_constructora-moche.pdf', pct: 1.0, integrantes: [{ nombre: 'CONSTRUCTORA MOCHE S.A.C.', ruc: '20530987651', pct: 100, mype: 'SI', domicilio: 'Av. España 1250, Of. 302, Trujillo', telefono: '044-245566', correo: 'licitaciones@moche-ejemplo.pe', apoderado: 'Julio Vega Castro', constitucion: '20 de agosto de 2015', partida: '11205541' }] },
  { archivo: 'OFERTA-3_ingenieria-chimu.pdf', pct: 1.1, integrantes: [{ nombre: 'INGENIERÍA CHIMÚ E.I.R.L.', ruc: '20600111221', pct: 100, mype: 'SI', domicilio: 'Av. España 1250 Of. 302 Trujillo', telefono: '044-245566', correo: 'chimu.obras@ejemplo.pe', apoderado: 'Ana Torres Gil', constitucion: '15 de enero de 2018', partida: '11299870' }] },
  { archivo: 'OFERTA-4_obras-generales-trujillo.pdf', pct: 1.099, integrantes: [{ nombre: 'OBRAS GENERALES TRUJILLO S.A.C.', ruc: '20477889901', pct: 100, mype: 'NO', domicilio: 'Calle Bolívar 233, Trujillo', telefono: '044-290011', correo: 'ogt@ejemplo.pe', apoderado: 'Luis Rojas Peña', constitucion: '2 de marzo de 2011', partida: '11088765' }] },
];
const FECHA_OFERTA = 'Trujillo, 22 de setiembre de 2026';
const AVISO_OFERTA = 'OFERTA SINTÉTICA · Empresas, RUC y personas ficticias · Documento de prueba para Axis';

function paginaOferta(doc, anexo, titulo, layout = 'portrait') {
  doc.addPage({ size: 'A4', layout, margins: { top: 56, bottom: 56, left: 64, right: 64 } });
  marca(doc, AVISO_OFERTA);
  if (anexo) doc.font('Helvetica-Bold').fontSize(11).text(anexo, { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).text(titulo, { align: 'center' }).moveDown(0.8);
  doc.font('Helvetica').fontSize(9.5).text(`Señores\nCOMITÉ\n${PROCESO}\nPresente.-`).moveDown(0.8);
}

for (const p of POSTORES) {
  const oferta = redondeo(VALOR_REFERENCIAL * p.pct);
  const doc = nuevo('2_seleccion/ofertas', p.archivo);
  const nombre = p.consorcio ?? p.integrantes[0].nombre;
  const representante = p.comun?.representante ?? p.integrantes[0].apoderado;
  for (const m of p.integrantes) {
    paginaOferta(doc, 'ANEXO Nº 1', 'DECLARACIÓN JURADA DE DATOS DEL POSTOR');
    parrafo(doc, `El que se suscribe, ${m.apoderado}, representante legal de ${m.nombre}${p.consorcio ? `, integrante del ${p.consorcio}` : ''}, DECLARO BAJO JURAMENTO que la siguiente información se sujeta a la verdad:`);
    linea(doc, 'Nombre, Denominación o Razón Social', m.nombre);
    linea(doc, 'Domicilio Legal', m.domicilio);
    linea(doc, 'RUC', m.ruc);
    linea(doc, 'Teléfono(s)', m.telefono);
    linea(doc, 'MYPE', m.mype === 'SI' ? 'SI ( X )   NO (   )' : 'SI (   )   NO ( X )');
    linea(doc, 'Correo electrónico', m.correo);
    firma(doc, m.apoderado, FECHA_OFERTA);
    paginaOferta(doc, null, 'CERTIFICADO DE VIGENCIA DE PODER');
    parrafo(doc, `SUNARP · Zona Registral N° V – Sede Trujillo. Certifica que en la Partida Electrónica N° ${m.partida} del Registro de Personas Jurídicas consta inscrita la sociedad ${m.nombre}, con RUC ${m.ruc}.`);
    linea(doc, 'Fecha de constitución', m.constitucion);
    linea(doc, 'Apoderado', m.apoderado);
    linea(doc, 'Cargo', 'Gerente General');
    parrafo(doc, 'Facultades: representar a la sociedad en procedimientos de selección y suscribir contratos con el Estado.');
  }
  paginaOferta(doc, 'ANEXO Nº 3', 'DECLARACIÓN JURADA');
  parrafo(doc, `Mediante el presente, el que suscribe, en representación de ${nombre}, declara bajo juramento: (i) ser responsable de la veracidad de los documentos e información de la oferta, y (ii) no encontrarse impedido para contratar con el Estado, de acuerdo con el artículo 30 de la Ley N° 32069.`);
  firma(doc, representante, FECHA_OFERTA);
  if (p.consorcio) {
    paginaOferta(doc, 'ANEXO Nº 4', 'PROMESA DE CONSORCIO');
    parrafo(doc, `Los suscritos declaramos expresamente que hemos convenido en forma irrevocable, durante el lapso que dure el procedimiento de selección, para presentar una oferta conjunta como ${p.consorcio}. Designamos como representante común a ${p.comun.representante}, fijamos domicilio común en ${p.comun.domicilio} y correo electrónico común ${p.comun.correo}.`);
    parrafo(doc, 'OBLIGACIONES DE CADA INTEGRANTE:');
    tabla(doc, ['INTEGRANTE', 'RUC', '% DE OBLIGACIONES'], p.integrantes.map((m) => [m.nombre, m.ruc, `${m.pct}%`]), [250, 120, 100]);
    linea(doc, 'TOTAL OBLIGACIONES', '100%');
    firma(doc, p.integrantes.map((m) => m.apoderado).join(' / '), FECHA_OFERTA);
  }
  paginaOferta(doc, 'ANEXO Nº 6', 'OFERTA ECONÓMICA');
  parrafo(doc, `Es grato dirigirme a usted, para hacer de su conocimiento que, de acuerdo con las bases, mi oferta para la ejecución de la obra «${OBRA}» es la siguiente:`);
  tabla(doc, ['CONCEPTO', 'OFERTA S/'], [['Costo total de la obra (incluye IGV)', soles(oferta)]], [320, 150]);
  linea(doc, 'MONTO TOTAL DE LA OFERTA', `S/ ${soles(oferta)}`);
  firma(doc, representante, FECHA_OFERTA);
  paginaOferta(doc, 'ANEXO Nº 18', 'DECLARACIÓN JURADA DE CUMPLIMIENTO DE LOS REQUISITOS DE CALIFICACIÓN');
  parrafo(doc, `${nombre} declara bajo juramento que cumple con los requisitos de calificación del numeral 3.6 del Capítulo III de las bases y que los acreditará para la suscripción del contrato.`);
  firma(doc, representante, FECHA_OFERTA);
  doc.end();
}

// Bases del procedimiento: de aquí salen los datos que el comité ya no tiene que digitar.
{
  const doc = nuevo('2_seleccion', 'BASES_datos-del-procedimiento.pdf');
  doc.addPage();
  marca(doc, 'BASES SINTÉTICAS · Documento de prueba para Axis · No es un documento oficial');
  doc.font('Helvetica-Bold').fontSize(12).text('BASES INTEGRADAS', { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).text(PROCESO, { align: 'center' }).moveDown(1);
  doc.font('Helvetica-Bold').fontSize(10.5).text('CAPÍTULO I · GENERALIDADES').moveDown(0.4);
  linea(doc, 'ENTIDAD', ENTIDAD);
  linea(doc, 'NOMENCLATURA', 'LP-ABR-3-2026-MDLE/CS-1');
  linea(doc, 'PROCEDIMIENTO', 'Licitación pública abreviada');
  linea(doc, 'OBJETO DE LA CONVOCATORIA', OBRA);
  linea(doc, 'VALOR REFERENCIAL', `S/ ${soles(VALOR_REFERENCIAL)} (incluye IGV), según el expediente técnico aprobado`);
  linea(doc, 'SISTEMA DE CONTRATACIÓN', 'Precios unitarios');
  linea(doc, 'PLAZO DE EJECUCIÓN', '75 días calendario');
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(10.5).text('CRONOGRAMA DEL PROCEDIMIENTO').moveDown(0.4);
  linea(doc, 'Convocatoria', '8 de setiembre de 2026');
  linea(doc, 'Presentación de ofertas', '22 de setiembre de 2026');
  linea(doc, 'Otorgamiento de la buena pro', '30 de setiembre de 2026');
  doc.moveDown(0.6);
  parrafo(doc, 'Las ofertas válidas deben estar entre el 95 % y el 110 % del valor referencial. El puntaje se asigna por precio y el empate se resuelve según el artículo 81 del Reglamento de la Ley N° 32069.');
  doc.end();
}

// Documentos del ganador para la firma del contrato. A propósito: un monto que no coincide con
// su constancia, una obra sin constancia y otra anterior a la constitución del integrante.
{
  const EXPERIENCIA = [
    { n: 1, cliente: 'MUNICIPALIDAD DISTRITAL DE EJEMPLO ALTO', contrato: '015-2023-MDEA', fecha: '12/03/2023', conformidad: '20/09/2023', de: 'CONSTRUCTORA ANDINA NORTE S.A.C.', monto: 2450000 },
    { n: 2, cliente: 'GOBIERNO REGIONAL DE EJEMPLO', contrato: '088-2024-GRE', fecha: '03/04/2024', conformidad: '15/11/2024', de: 'CONSTRUCTORA ANDINA NORTE S.A.C.', monto: 2150000 },
    { n: 3, cliente: 'MUNICIPALIDAD DISTRITAL DE PACASMAYO', contrato: 'AS-SM-1-2025-MDP/CS-1', fecha: '14/02/2025', conformidad: '30/07/2025', de: 'CONSTRUCTORA ANDINA NORTE S.A.C.', monto: 1452034.82 },
    { n: 4, cliente: 'MUNICIPALIDAD DISTRITAL DE EJEMPLO BAJO', contrato: '041-2025-MDEB', fecha: '05/08/2025', conformidad: '20/12/2025', de: 'INVERSIONES KALLPA S.A.C.', monto: 400000 },
  ];
  const CONSTANCIAS = [
    { contrato: '015-2023-MDEA', entidad: 'MUNICIPALIDAD DISTRITAL DE EJEMPLO ALTO', contratista: 'CONSTRUCTORA ANDINA NORTE S.A.C.', monto: 2450000, recepcion: '20 de setiembre de 2023' },
    { contrato: '088-2024-GRE', entidad: 'GOBIERNO REGIONAL DE EJEMPLO', contratista: 'CONSTRUCTORA ANDINA NORTE S.A.C.', monto: 1650000, recepcion: '15 de noviembre de 2024' },
    { contrato: '041-2025-MDEB', entidad: 'MUNICIPALIDAD DISTRITAL DE EJEMPLO BAJO', contratista: 'INVERSIONES KALLPA S.A.C.', monto: 400000, recepcion: '20 de diciembre de 2025' },
  ];
  const doc = nuevo('2_seleccion/documentos-del-ganador', 'GANADOR_experiencia-y-constancias.pdf');
  paginaOferta(doc, 'ANEXO Nº 11', 'EXPERIENCIA DEL POSTOR EN LA ESPECIALIDAD', 'landscape');
  parrafo(doc, 'Mediante el presente, el suscrito detalla lo siguiente como EXPERIENCIA EN OBRAS DE LA ESPECIALIDAD (CONSORCIO VÍAS DEL NORTE):');
  tabla(doc, ['Nº', 'CLIENTE', 'N° CONTRATO', 'FECHA', 'CONFORMIDAD', 'PROVENIENTE DE', 'MONTO S/'],
    EXPERIENCIA.map((e) => [e.n, e.cliente, e.contrato, e.fecha, e.conformidad, e.de, soles(e.monto)]), [22, 210, 118, 62, 74, 160, 70]);
  linea(doc, 'MONTO FACTURADO ACUMULADO', `S/ ${soles(6800000)}`);
  firma(doc, 'Rosa Mendoza Lara', 'Trujillo, 5 de octubre de 2026');
  for (const c of CONSTANCIAS) {
    paginaOferta(doc, null, 'CONSTANCIA DE PRESTACIÓN');
    parrafo(doc, `${c.entidad} hace constar que ${c.contratista} ejecutó la obra objeto del Contrato N° ${c.contrato}, de la especialidad de obras urbanas (pistas y veredas), con recepción de obra el ${c.recepcion}.`);
    linea(doc, 'Contrato', c.contrato);
    linea(doc, 'Contratista', c.contratista);
    linea(doc, 'Monto total de la obra', `S/ ${soles(c.monto)}`);
    linea(doc, 'Fecha de recepción', c.recepcion);
    firma(doc, 'Subgerente de Obras', 'Se expide a solicitud del interesado.');
  }
  doc.end();
}

// ── 3. Ejecución ─────────────────────────────────────────────────────
const GANADOR = POSTORES[0];
const MONTO_CONTRATO = redondeo(VALOR_REFERENCIAL * GANADOR.pct);
const AVISO_OBRA = 'DOCUMENTO SINTÉTICO DE PRUEBA · No es un documento oficial · Personas y empresas ficticias';

function documentoObra(carpeta, archivo, { oficina, titulo, fecha, secciones, firmante }) {
  const doc = nuevo(carpeta, archivo);
  doc.addPage();
  marca(doc, AVISO_OBRA);
  doc.font('Helvetica-Bold').fontSize(11).text(oficina, { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(12).text(titulo, { align: 'center' }).moveDown(0.3);
  doc.font('Helvetica').fontSize(10).text(fecha, { align: 'center' }).moveDown(1.2);
  for (const [encabezado, contenido] of secciones) {
    if (encabezado) doc.font('Helvetica-Bold').fontSize(10.5).text(encabezado).moveDown(0.3);
    for (const c of contenido) {
      if (Array.isArray(c)) linea(doc, c[0], c[1]);
      else parrafo(doc, c);
    }
    doc.moveDown(0.4);
  }
  if (firmante) firma(doc, firmante, '');
  doc.end();
}

documentoObra('3_ejecucion/1_registrar-la-obra', 'CONTRATO-Y-ACTA-DE-INICIO_obra-morelos.pdf', {
  oficina: ENTIDAD,
  titulo: `CONTRATO N° ${CONTRATO} Y ACTA DE ENTREGA DE TERRENO E INICIO DE OBRA`,
  fecha: 'La Esperanza, 13 de octubre de 2026',
  secciones: [
    ['DATOS DEL CONTRATO', [
      ['OBRA', OBRA],
      ['PROCEDIMIENTO DE SELECCIÓN', PROCESO],
      ['CONTRATISTA', `${GANADOR.consorcio}`],
      ['RUC DE LOS INTEGRANTES', GANADOR.integrantes.map((m) => `${m.nombre} (${m.ruc}) ${m.pct} %`).join(' · ')],
      ['MONTO DEL CONTRATO', `S/ ${soles(MONTO_CONTRATO)} (incluye IGV)`],
      ['SISTEMA DE CONTRATACIÓN', 'Precios unitarios'],
      ['PLAZO DE EJECUCIÓN', '75 (setenta y cinco) días calendario'],
      ['FECHA DE SUSCRIPCIÓN DEL CONTRATO', '9 de octubre de 2026'],
    ]],
    ['ACTA DE ENTREGA DE TERRENO E INICIO DE OBRA', [
      'En la Calle José María Morelos, cuadras 1 a 4, distrito de La Esperanza, siendo las 9:00 horas, se reunieron el representante de la entidad, el supervisor de obra y el residente del contratista para la entrega del terreno, que se recibe libre de ocupaciones.',
      ['SUPERVISOR DE OBRA', SUPERVISOR],
      ['RESIDENTE DE OBRA', 'Ing. Mario Linares Díaz'],
      ['INICIO DEL PLAZO DE EJECUCIÓN', '13 de octubre de 2026'],
      ['FECHA DE TÉRMINO PROGRAMADA', '26 de diciembre de 2026'],
      'Las partes dejan constancia de que el expediente técnico aprobado es la base para el control de la obra y de toda solicitud de modificación.',
    ]],
  ],
  firmante: 'Representante de la entidad · Supervisor de obra · Residente de obra',
});

const SOLICITUDES = [
  {
    archivo: '1_ASIENTO-21_consulta_napa-freatica.pdf',
    titulo: 'CUADERNO DE OBRA DIGITAL – ASIENTO N° 21 DEL RESIDENTE',
    fecha: 'La Esperanza, 17 de noviembre de 2026',
    secciones: [['CONSULTA SOBRE OCURRENCIAS EN LA OBRA', [
      'ASIENTO N° 21 – 17/11/2026 – DEL RESIDENTE DE OBRA:',
      'Se comunica a la supervisión que al excavar la caja del pavimento en las cuadras 2 y 3, a 1.20 m de profundidad, aflora agua en el fondo de la excavación (napa freática). El suelo se encuentra saturado y no es posible compactar la subrasante.',
      'El estudio de mecánica de suelos del expediente técnico exploró hasta 1.50 m y declara que no se encontró nivel freático. El expediente no contiene partidas de bombeo, abatimiento de napa ni subdrenaje.',
      'Se formula CONSULTA a la supervisión para que, de ser el caso, la eleve al proyectista: ¿cómo se debe proceder en el tramo afectado y con qué partidas? Se suspenden los trabajos de movimiento de tierras en las cuadras 2 y 3 hasta su absolución.',
    ]]],
    firmante: 'Ing. Mario Linares Díaz · Residente de obra',
  },
  {
    archivo: '2_ASIENTO-24_solicitud-ampliacion-de-plazo.pdf',
    titulo: 'CUADERNO DE OBRA DIGITAL – ASIENTO N° 24 DEL RESIDENTE',
    fecha: 'La Esperanza, 24 de noviembre de 2026',
    secciones: [['SOLICITUD DE AMPLIACIÓN DE PLAZO N° 01', [
      'ASIENTO N° 24 – 24/11/2026 – DEL RESIDENTE DE OBRA:',
      'Al amparo del artículo 198 del Reglamento de la Ley N° 32069, el contratista solicita la AMPLIACIÓN DE PLAZO N° 01 por 21 días calendario.',
      'Causal: atraso en la ejecución de la ruta crítica por la falta de absolución de la consulta del Asiento N° 21 sobre la napa freática en las cuadras 2 y 3. La causal se inició el 17 de noviembre de 2026 y continúa a la fecha, por lo que se trata de una ampliación parcial.',
      'Partidas afectadas de la ruta crítica: 02.01 Corte de material hasta nivel de subrasante, 02.03 Conformación y compactación de subrasante, 03.01 Base granular e = 0.20 m.',
    ]]],
    firmante: 'Ing. Mario Linares Díaz · Residente de obra',
  },
  {
    archivo: '3_INFORME-ADICIONAL-01_bombeo-y-subdrenaje.pdf',
    titulo: 'INFORME N° 007-2026-CVN/RO – SOLICITUD DE PRESTACIÓN ADICIONAL DE OBRA N° 01',
    fecha: 'La Esperanza, 25 de noviembre de 2026',
    secciones: [
      ['ASUNTO:', ['Solicitud de prestación adicional de obra N° 01 por la aparición de napa freática no prevista en el expediente técnico.']],
      ['ANÁLISIS:', [
        'Según el Asiento N° 21, a 1.20 m de profundidad aflora napa freática en 140 m del tramo de las cuadras 2 y 3. El expediente técnico no la consideró: su estudio de suelos exploró solo hasta 1.50 m y declaró que no hay nivel freático.',
        'Para continuar se requieren partidas no previstas: bombeo y abatimiento de la napa freática, subdrenaje longitudinal con tubería perforada de 6", geotextil y material filtrante, y mejoramiento de la subrasante con over de 6".',
      ]],
      ['MONTO DE LA PRESTACIÓN ADICIONAL:', [
        ['Bombeo y abatimiento de napa freática', 'S/ 12,480.00'],
        ['Subdrenaje longitudinal (140 m)', 'S/ 24,150.30'],
        ['Mejoramiento de subrasante con over', 'S/ 12,300.20'],
        ['MONTO TOTAL DEL ADICIONAL N° 01', 'S/ 48,930.50 (incluye IGV)'],
        'Causal: deficiencia del expediente técnico (estudio de mecánica de suelos sin exploración a la profundidad de excavación).',
      ]],
    ],
    firmante: 'Ing. Mario Linares Díaz · Residente de obra · CONSORCIO VÍAS DEL NORTE',
  },
];
for (const s of SOLICITUDES) {
  documentoObra('3_ejecucion/2_solicitudes-del-contratista', s.archivo, { oficina: `${GANADOR.consorcio} – OBRA: ${OBRA}`, ...s });
}

// ── 4. Aprendizaje: la obra se paraliza ─────────────────────────────
documentoObra('4_aprendizaje', 'INFORME-PARALIZACION_obra-morelos.pdf', {
  oficina: `${ENTIDAD} – SUBGERENCIA DE OBRAS`,
  titulo: 'INFORME TÉCNICO N° 041-2026-SGO – ESTADO SITUACIONAL DE OBRA PARALIZADA',
  fecha: 'La Esperanza, 26 de noviembre de 2026',
  secciones: [
    ['ASUNTO:', [`Informe de paralización y estado situacional de la obra: "${OBRA}", con 38 % de avance físico.`]],
    ['ANTECEDENTES:', [`La obra se inició el 13 de octubre de 2026 con un plazo de 75 días calendario, a cargo del ${GANADOR.consorcio} (Contrato N° ${CONTRATO}). El 17 de noviembre de 2026 el contratista suspendió los trabajos de movimiento de tierras en las cuadras 2 y 3.`]],
    ['ANÁLISIS:', [
      'Al excavar la caja del pavimento a 1.20 m de profundidad apareció napa freática: el suelo quedó saturado y el agua aflora en el fondo de la excavación, lo que impide compactar la subrasante. La inspección verificó filtraciones de agua en 140 m del tramo.',
      'El estudio de mecánica de suelos del expediente técnico exploró solo hasta 1.50 m y declaró que no se encontró nivel freático; el expediente no incluyó partidas de bombeo, abatimiento de napa ni subdrenaje.',
      'El contratista solicitó la ampliación de plazo N° 01 (21 días) y la prestación adicional N° 01 por S/ 48,930.50 (13.7 % del monto contratado). Sin esas partidas no es posible continuar, por lo que la obra se encuentra paralizada desde el 17 de noviembre de 2026.',
    ]],
    ['CONCLUSIONES Y RECOMENDACIONES:', [
      'Elaborar el expediente técnico del saldo de obra incorporando un estudio de suelos complementario con exploración a mayor profundidad, el abatimiento de la napa freática y el subdrenaje longitudinal.',
      'Para los expedientes de pistas y veredas del sector, exigir que el estudio de suelos sustente el nivel freático a la profundidad de excavación.',
    ]],
  ],
  firmante: 'Subgerente de Obras',
});

console.log(`Paquete generado en ${SALIDA}`);
