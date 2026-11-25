// Genera los documentos de obra SINTÉTICOS de la demo. Siguen la estructura de las
// resoluciones e informes reales de adicionales y paralizaciones de La Libertad (OCDS),
// pero la entidad, los números y los hechos son de demostración.
// Uso: node scripts/demo/generar-documento-obra.mjs [carpeta del segundo set]
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const DOCUMENTOS = [
  {
    archivo: 'public/demo/OBRA-LL-01_resolucion-adicional-01_sintetica.pdf',
    oficina: 'ENTIDAD DE DEMOSTRACIÓN – GERENCIA DE DESARROLLO URBANO',
    titulo: 'RESOLUCIÓN GERENCIAL N° 041-2026-GDU',
    fecha: 'El Porvenir, 14 de agosto de 2026',
    secciones: [
      ['VISTO:', ['El Informe N° 112-2026-SO/RO del supervisor de obra y el Informe N° 087-2026-GDU/SGO de la Subgerencia de Obras, que solicitan la aprobación de la Prestación Adicional de Obra N° 01 con deductivo vinculante de la obra: "MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE LOS INCAS CUADRAS 4 A 6 - EL PORVENIR", y;']],
      ['CONSIDERANDO:', [
        'Que, mediante Asiento N° 23 del cuaderno de obra, el residente comunicó que al realizar la excavación de la caja para la base granular en la cuadra 5 se encontró una tubería de desagüe existente de 8" y dos buzones que no figuraban en los planos del expediente técnico, a 0.60 m de profundidad, que interfieren con la nueva rasante de la calzada.',
        'Que, el supervisor verificó en campo la interferencia y señaló que el expediente técnico no consideró el catastro de redes de la empresa prestadora ni partidas para la protección o reubicación de las redes existentes, por lo que se requiere reubicar 42 m de tubería, nivelar dos buzones y rehacer seis conexiones domiciliarias de desagüe.',
        'Que, la empresa prestadora de servicios de saneamiento emitió la conformidad técnica de la reubicación propuesta, y la Subgerencia de Obras cuantificó el adicional en S/ 38,412.60, con un deductivo vinculante de S/ 6,180.00, resultando una incidencia neta de 9.04 % del monto contratado.',
        'Que, la obra se encuentra terminada a la fecha de emisión del presente acto, quedando pendiente la liquidación del contrato.',
      ]],
      ['SE RESUELVE:', [
        'ARTÍCULO PRIMERO.- APROBAR la Prestación Adicional de Obra N° 01 por S/ 38,412.60 y el Deductivo Vinculante N° 01 por S/ 6,180.00 de la obra "Mejoramiento de pistas y veredas en la Calle Los Incas cuadras 4 a 6 - El Porvenir", para las partidas: reubicación de tubería de desagüe existente, nivelación de buzones y reconstrucción de conexiones domiciliarias.',
        'ARTÍCULO SEGUNDO.- DISPONER que la Subgerencia de Estudios incorpore el catastro de redes de la empresa prestadora como requisito en los expedientes técnicos de pistas y veredas del sector.',
      ]],
    ],
  },
  {
    archivo: 'OBRA-LL-04_informe-paralizacion_sintetico.pdf',
    oficina: 'ENTIDAD DE DEMOSTRACIÓN – SUBGERENCIA DE OBRAS',
    titulo: 'INFORME TÉCNICO N° 019-2026-SGO – ESTADO SITUACIONAL DE OBRA PARALIZADA',
    fecha: 'La Esperanza, 22 de junio de 2026',
    secciones: [
      ['ASUNTO:', ['Informe de paralización y estado situacional de la obra: "MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE JOSE MARIA MORELOS - LA ESPERANZA", con 38 % de avance físico.']],
      ['ANTECEDENTES:', [
        'La obra se inició el 2 de marzo de 2026 con un plazo de 75 días calendario. El 4 de mayo de 2026 el contratista suspendió los trabajos de movimiento de tierras en las cuadras 2 y 3.',
      ]],
      ['ANÁLISIS:', [
        'Al excavar la caja del pavimento a 1.20 m de profundidad apareció napa freática: el suelo quedó saturado y el agua aflora en el fondo de la excavación, lo que impide compactar la subrasante. La inspección verificó filtraciones de agua en 140 m del tramo.',
        'El estudio de mecánica de suelos del expediente técnico exploró solo hasta 1.50 m y declaró que no se encontró nivel freático; el expediente no incluyó partidas de bombeo, abatimiento de napa ni subdrenaje.',
        'Sin esas partidas no es posible continuar, por lo que la obra se encuentra paralizada desde el 4 de mayo de 2026.',
      ]],
      ['CONCLUSIONES Y RECOMENDACIONES:', [
        'Elaborar el expediente técnico del saldo de obra incorporando un estudio de suelos complementario con exploración a mayor profundidad, el abatimiento de la napa freática y el subdrenaje longitudinal.',
        'Para los expedientes de pistas y veredas del sector, exigir que el estudio de suelos sustente el nivel freático a la profundidad de excavación.',
      ]],
    ],
  },
];

const salidaSet2 = process.argv[2];
for (const d of DOCUMENTOS) {
  const destino = d.archivo.startsWith('public/') ? d.archivo : salidaSet2 ? path.join(salidaSet2, d.archivo) : null;
  if (!destino) continue;
  const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 70, right: 70 } });
  doc.pipe(fs.createWriteStream(destino));
  const p = (texto) => doc.font('Helvetica').fontSize(10.5).text(texto, { align: 'justify', lineGap: 2 }).moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#a02b25').text('DOCUMENTO SINTÉTICO DE DEMOSTRACIÓN · No es un documento oficial', { align: 'center' }).moveDown(1.2).fillColor('black');
  doc.font('Helvetica-Bold').fontSize(11).text(d.oficina, { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(12).text(d.titulo, { align: 'center' }).moveDown(0.3);
  doc.font('Helvetica').fontSize(10).text(d.fecha, { align: 'center' }).moveDown(1.2);
  for (const [encabezado, parrafos] of d.secciones) {
    doc.font('Helvetica-Bold').fontSize(10.5).text(encabezado).moveDown(0.3);
    parrafos.forEach(p);
  }
  doc.moveDown(2).font('Helvetica').fontSize(9).fillColor('#555')
    .text('Documento generado por Axis para demostrar el aprendizaje a partir de obras terminadas y paralizadas. Su redacción sigue la estructura de documentos reales publicados en el SEACE (La Libertad, 2025-2026).', { align: 'center' });
  doc.end();
  console.log('Generado', destino);
}
