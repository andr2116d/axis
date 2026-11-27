// Genera las OFERTAS de ejemplo de la fase de selección y los documentos que el ganador
// presenta para firmar el contrato. Siguen los anexos de las bases estándar de licitación
// pública abreviada de obras (Ley 32069), pero las empresas, RUC y personas son FICTICIAS.
// Uso: node scripts/demo/generar-ofertas.mjs
import fs from 'node:fs';
import PDFDocument from 'pdfkit';

const OUT = new URL('../../public/demo/seleccion/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

const PROCESO = 'LICITACIÓN PÚBLICA ABREVIADA N° 7-2026-EJEMPLO/CS-1';
const soles = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const POSTORES = [
  {
    archivo: 'OFERTA-1_consorcio-vias-del-norte.pdf', consorcio: 'CONSORCIO VÍAS DEL NORTE', oferta: 1220275.0,
    comun: { representante: 'Rosa Mendoza Lara', domicilio: 'Jr. Pizarro 410, Trujillo', correo: 'viasdelnorte@ejemplo.pe', telefono: '044-201010' },
    integrantes: [
      { nombre: 'INVERSIONES KALLPA S.A.C.', ruc: '20612345671', pct: 90, mype: 'SI', domicilio: 'Jr. Pizarro 410, Trujillo', telefono: '044-201010', correo: 'kallpa@ejemplo.pe', apoderado: 'Rosa Mendoza Lara', constitucion: '10 de febrero de 2026', partida: '11458822' },
      { nombre: 'CONSTRUCTORA ANDINA NORTE S.A.C.', ruc: '20481234567', pct: 10, mype: 'NO', domicilio: 'Av. América Norte 1820, Trujillo', telefono: '044-233400', correo: 'licitaciones@andinanorte.pe', apoderado: 'Jorge Salas Ibáñez', constitucion: '4 de mayo de 2009', partida: '11032291' },
    ],
  },
  {
    archivo: 'OFERTA-2_constructora-moche.pdf', oferta: 1284500.0,
    integrantes: [{ nombre: 'CONSTRUCTORA MOCHE S.A.C.', ruc: '20530987651', pct: 100, mype: 'SI', domicilio: 'Av. España 1250, Of. 302, Trujillo', telefono: '044-245566', correo: 'licitaciones@moche-ejemplo.pe', apoderado: 'Julio Vega Castro', constitucion: '20 de agosto de 2015', partida: '11205541' }],
  },
  {
    archivo: 'OFERTA-3_ingenieria-chimu.pdf', oferta: 1412950.0,
    integrantes: [{ nombre: 'INGENIERÍA CHIMÚ E.I.R.L.', ruc: '20600111221', pct: 100, mype: 'SI', domicilio: 'Av. España 1250 Of. 302 Trujillo', telefono: '044-245566', correo: 'chimu.obras@ejemplo.pe', apoderado: 'Ana Torres Gil', constitucion: '15 de enero de 2018', partida: '11299870' }],
  },
  {
    archivo: 'OFERTA-4_obras-generales-trujillo.pdf', oferta: 1411665.5,
    integrantes: [{ nombre: 'OBRAS GENERALES TRUJILLO S.A.C.', ruc: '20477889901', pct: 100, mype: 'NO', domicilio: 'Calle Bolívar 233, Trujillo', telefono: '044-290011', correo: 'ogt@ejemplo.pe', apoderado: 'Luis Rojas Peña', constitucion: '2 de marzo de 2011', partida: '11088765' }],
  },
];

function nuevo(archivo) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 64, right: 64 }, autoFirstPage: false });
  doc.pipe(fs.createWriteStream(new URL(archivo, OUT)));
  return doc;
}
function pagina(doc, anexo, titulo, layout = 'portrait') {
  doc.addPage({ size: 'A4', layout, margins: { top: 56, bottom: 56, left: 64, right: 64 } });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#a02b25').text('OFERTA DE EJEMPLO · Empresas, RUC y personas ficticias · Demostración de Axis', { align: 'center' }).moveDown(1).fillColor('#111');
  if (anexo) doc.font('Helvetica-Bold').fontSize(11).text(anexo, { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).text(titulo, { align: 'center' }).moveDown(0.8);
  doc.font('Helvetica').fontSize(9.5).text('Señores\nCOMITÉ\n' + PROCESO + '\nPresente.-').moveDown(0.8);
}
const linea = (doc, etiqueta, valor) => doc.font('Helvetica-Bold').fontSize(10).text(`${etiqueta}: `, { continued: true }).font('Helvetica').text(valor);
const parrafo = (doc, t) => doc.font('Helvetica').fontSize(10).text(t, { align: 'justify', lineGap: 1.5 }).moveDown(0.6);
const firma = (doc, quien, ciudad = 'Trujillo, 8 de setiembre de 2026') => { doc.moveDown(1.2).font('Helvetica').fontSize(10).text(ciudad).moveDown(1.5).text('………………………………………').text(quien); };
function tabla(doc, cabecera, filas, anchos) {
  let y = doc.y + 4;
  const x0 = doc.page.margins.left;
  const fila = (celdas, bold) => {
    let x = x0;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.6);
    celdas.forEach((c, i) => { doc.text(String(c), x, y, { width: anchos[i] - 6, lineBreak: false }); x += anchos[i]; });
    y += 15;
  };
  fila(cabecera, true);
  filas.forEach((f) => fila(f, false));
  doc.x = x0;
  doc.y = y + 6;
}

for (const p of POSTORES) {
  const doc = nuevo(p.archivo);
  const nombrePostor = p.consorcio ?? p.integrantes[0].nombre;
  for (const m of p.integrantes) {
    pagina(doc, 'ANEXO Nº 1', 'DECLARACIÓN JURADA DE DATOS DEL POSTOR');
    parrafo(doc, `El que se suscribe, ${m.apoderado}, representante legal de ${m.nombre}${p.consorcio ? `, integrante del ${p.consorcio}` : ''}, DECLARO BAJO JURAMENTO que la siguiente información se sujeta a la verdad:`);
    linea(doc, 'Nombre, Denominación o Razón Social', m.nombre);
    linea(doc, 'Domicilio Legal', m.domicilio);
    linea(doc, 'RUC', m.ruc);
    linea(doc, 'Teléfono(s)', m.telefono);
    linea(doc, 'MYPE', m.mype === 'SI' ? 'SI ( X )   NO (   )' : 'SI (   )   NO ( X )');
    linea(doc, 'Correo electrónico', m.correo);
    firma(doc, m.apoderado);

    pagina(doc, null, 'CERTIFICADO DE VIGENCIA DE PODER');
    parrafo(doc, `SUNARP · Zona Registral N° V – Sede Trujillo. Certifica que en la Partida Electrónica N° ${m.partida} del Registro de Personas Jurídicas consta inscrita la sociedad ${m.nombre}, con RUC ${m.ruc}.`);
    linea(doc, 'Fecha de constitución', m.constitucion);
    linea(doc, 'Apoderado', m.apoderado);
    linea(doc, 'Cargo', 'Gerente General');
    parrafo(doc, 'Facultades: representar a la sociedad en procedimientos de selección y suscribir contratos con el Estado.');
  }

  pagina(doc, 'ANEXO Nº 3', 'DECLARACIÓN JURADA');
  parrafo(doc, `Mediante el presente, el que suscribe, en representación de ${nombrePostor}, declara bajo juramento: (i) ser responsable de la veracidad de los documentos e información de la oferta, y (ii) no encontrarse impedido para contratar con el Estado, de acuerdo con el artículo 30 de la Ley N° 32069.`);
  firma(doc, p.comun?.representante ?? p.integrantes[0].apoderado);

  if (p.consorcio) {
    pagina(doc, 'ANEXO Nº 4', 'PROMESA DE CONSORCIO');
    parrafo(doc, `Los suscritos declaramos expresamente que hemos convenido en forma irrevocable, durante el lapso que dure el procedimiento de selección, para presentar una oferta conjunta como ${p.consorcio}. Designamos como representante común a ${p.comun.representante}, fijamos domicilio común en ${p.comun.domicilio} y correo electrónico común ${p.comun.correo}.`);
    parrafo(doc, 'OBLIGACIONES DE CADA INTEGRANTE:');
    tabla(doc, ['INTEGRANTE', 'RUC', '% DE OBLIGACIONES'], p.integrantes.map((m) => [m.nombre, m.ruc, `${m.pct}%`]), [250, 120, 100]);
    linea(doc, 'TOTAL OBLIGACIONES', '100%');
    firma(doc, p.integrantes.map((m) => m.apoderado).join(' / '));
  }

  pagina(doc, 'ANEXO Nº 6', 'OFERTA ECONÓMICA');
  parrafo(doc, `Es grato dirigirme a usted, para hacer de su conocimiento que, de acuerdo con las bases, mi oferta para la ejecución de la obra «Mejoramiento de pistas y veredas» es la siguiente:`);
  tabla(doc, ['CONCEPTO', 'OFERTA S/'], [['Costo total de la obra (incluye IGV)', soles(p.oferta)]], [320, 150]);
  linea(doc, 'MONTO TOTAL DE LA OFERTA', `S/ ${soles(p.oferta)}`);
  firma(doc, p.comun?.representante ?? p.integrantes[0].apoderado);

  pagina(doc, 'ANEXO Nº 18', 'DECLARACIÓN JURADA DE CUMPLIMIENTO DE LOS REQUISITOS DE CALIFICACIÓN');
  parrafo(doc, `${nombrePostor} declara bajo juramento que cumple con los requisitos de calificación del numeral 3.6 del Capítulo III de las bases y que los acreditará para la suscripción del contrato.`);
  firma(doc, p.comun?.representante ?? p.integrantes[0].apoderado);
  doc.end();
  console.log('Generado', p.archivo);
}

// Documentos del ganador para la suscripción del contrato: experiencia (Anexo 11) y constancias.
// Tiene a propósito: un monto que no coincide, una obra sin constancia (y que el SEACE
// registra con otro ganador), una obra anterior a la constitución del integrante y una suma mal hecha.
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
{
  const doc = nuevo('CONTRATO_consorcio-vias-del-norte.pdf');
  pagina(doc, 'ANEXO Nº 11', 'EXPERIENCIA DEL POSTOR EN LA ESPECIALIDAD', 'landscape');
  parrafo(doc, 'Mediante el presente, el suscrito detalla lo siguiente como EXPERIENCIA EN OBRAS DE LA ESPECIALIDAD (CONSORCIO VÍAS DEL NORTE):');
  tabla(doc, ['Nº', 'CLIENTE', 'N° CONTRATO', 'FECHA', 'CONFORMIDAD', 'PROVENIENTE DE', 'MONTO S/'],
    EXPERIENCIA.map((e) => [e.n, e.cliente, e.contrato, e.fecha, e.conformidad, e.de, soles(e.monto)]), [22, 210, 118, 62, 74, 160, 70]);
  linea(doc, 'MONTO FACTURADO ACUMULADO', `S/ ${soles(6800000)}`);
  firma(doc, 'Rosa Mendoza Lara');
  for (const c of CONSTANCIAS) {
    pagina(doc, null, 'CONSTANCIA DE PRESTACIÓN');
    parrafo(doc, `${c.entidad} hace constar que ${c.contratista} ejecutó la obra objeto del Contrato N° ${c.contrato}, de la especialidad de obras urbanas (pistas y veredas), con recepción de obra el ${c.recepcion}.`);
    linea(doc, 'Contrato', c.contrato);
    linea(doc, 'Contratista', c.contratista);
    linea(doc, 'Monto total de la obra', `S/ ${soles(c.monto)}`);
    linea(doc, 'Fecha de recepción', c.recepcion);
    firma(doc, 'Subgerente de Obras', 'Se expide a solicitud del interesado.');
  }
  doc.end();
  console.log('Generado CONTRATO_consorcio-vias-del-norte.pdf');
}
