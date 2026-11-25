// Genera el documento de obra SINTÉTICO de la demo: la resolución que aprueba un
// adicional en la obra de Calle Los Incas (expediente sintético LL-01). Sigue la
// estructura de las resoluciones reales de adicionales de La Libertad (OCDS), pero
// la entidad, los números y los hechos son de demostración.
// Uso: node scripts/demo/generar-documento-obra.mjs
import fs from 'node:fs';
import PDFDocument from 'pdfkit';

const salida = 'public/demo/OBRA-LL-01_resolucion-adicional-01_sintetica.pdf';
const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 70, right: 70 } });
doc.pipe(fs.createWriteStream(salida));

const p = (texto, opciones = {}) => doc.font('Helvetica').fontSize(10.5).text(texto, { align: 'justify', lineGap: 2, ...opciones }).moveDown(0.6);
doc.font('Helvetica-Bold').fontSize(8).fillColor('#a02b25')
  .text('DOCUMENTO SINTÉTICO DE DEMOSTRACIÓN · No es un documento oficial', { align: 'center' }).moveDown(1.2).fillColor('black');
doc.font('Helvetica-Bold').fontSize(11).text('ENTIDAD DE DEMOSTRACIÓN – GERENCIA DE DESARROLLO URBANO', { align: 'center' });
doc.font('Helvetica-Bold').fontSize(12).text('RESOLUCIÓN GERENCIAL N° 041-2026-GDU', { align: 'center' }).moveDown(0.3);
doc.font('Helvetica').fontSize(10).text('El Porvenir, 14 de agosto de 2026', { align: 'center' }).moveDown(1.2);

doc.font('Helvetica-Bold').fontSize(10.5).text('VISTO:').moveDown(0.3);
p('El Informe N° 112-2026-SO/RO del supervisor de obra y el Informe N° 087-2026-GDU/SGO de la Subgerencia de Obras, que solicitan la aprobación de la Prestación Adicional de Obra N° 01 con deductivo vinculante de la obra: "MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE LOS INCAS CUADRAS 4 A 6 - EL PORVENIR", y;');
doc.font('Helvetica-Bold').fontSize(10.5).text('CONSIDERANDO:').moveDown(0.3);
p('Que, mediante Asiento N° 23 del cuaderno de obra, el residente comunicó que al realizar la excavación de la caja para la base granular en la cuadra 5 se encontró una tubería de desagüe existente de 8" y dos buzones que no figuraban en los planos del expediente técnico, a 0.60 m de profundidad, que interfieren con la nueva rasante de la calzada.');
p('Que, el supervisor verificó en campo la interferencia y señaló que el expediente técnico no consideró el catastro de redes de la empresa prestadora ni partidas para la protección o reubicación de las redes existentes, por lo que se requiere reubicar 42 m de tubería, nivelar dos buzones y rehacer seis conexiones domiciliarias de desagüe.');
p('Que, la empresa prestadora de servicios de saneamiento emitió la conformidad técnica de la reubicación propuesta, y la Subgerencia de Obras cuantificó el adicional en S/ 38,412.60, con un deductivo vinculante de S/ 6,180.00, resultando una incidencia neta de 9.04 % del monto contratado.');
p('Que, la obra se encuentra terminada a la fecha de emisión del presente acto, quedando pendiente la liquidación del contrato.');
doc.font('Helvetica-Bold').fontSize(10.5).text('SE RESUELVE:').moveDown(0.3);
p('ARTÍCULO PRIMERO.- APROBAR la Prestación Adicional de Obra N° 01 por S/ 38,412.60 y el Deductivo Vinculante N° 01 por S/ 6,180.00 de la obra "Mejoramiento de pistas y veredas en la Calle Los Incas cuadras 4 a 6 - El Porvenir", para las partidas: reubicación de tubería de desagüe existente, nivelación de buzones y reconstrucción de conexiones domiciliarias.');
p('ARTÍCULO SEGUNDO.- DISPONER que la Subgerencia de Estudios incorpore el catastro de redes de la empresa prestadora como requisito en los expedientes técnicos de pistas y veredas del sector.');
doc.moveDown(2).font('Helvetica').fontSize(9).fillColor('#555')
  .text('Documento generado por Axis para demostrar el aprendizaje a partir de obras terminadas. Su redacción sigue la estructura de resoluciones reales de adicionales publicadas en el SEACE (La Libertad, 2025-2026).', { align: 'center' });
doc.end();
console.log('Generado', salida);
