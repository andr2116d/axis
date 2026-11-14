// Recorta el modelo digital de elevación Copernicus GLO-30 (ESA, 1 segundo de arco ≈ 30 m) al área urbana de Trujillo
// y lo guarda como rejilla Int16 en decímetros: src/data/real/territorio/dem_trujillo.{bin,json}.
// Fuente: https://copernicus-dem-30m.s3.amazonaws.com (© DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018,
// provisto bajo COPERNICUS por la Unión Europea y la ESA). Es un modelo de superficie: incluye edificaciones y árboles.
// Uso: npx tsx scripts/datos/dem.ts <carpeta_con_tifs>
import { fromFile } from 'geotiff';
import fs from 'node:fs';
import path from 'node:path';

const CAJA = { latN: -7.98, latS: -8.2, lonO: -79.12, lonE: -78.92 }; // Trujillo metropolitano
const PASO = 1 / 3600;

async function main() {
  const dir = process.argv[2];
  const teselas = await Promise.all(fs.readdirSync(dir).filter((f) => f.endsWith('.tif')).map(async (f) => {
    const img = await (await fromFile(path.join(dir, f))).getImage();
    const [oX, oY] = img.getOrigin(); const [rX, rY] = img.getResolution();
    return { img, oX, oY, rX, rY, w: img.getWidth(), h: img.getHeight() };
  }));
  const filas = Math.round((CAJA.latN - CAJA.latS) / PASO), cols = Math.round((CAJA.lonE - CAJA.lonO) / PASO);
  const out = new Int16Array(filas * cols).fill(-32768);
  for (const t of teselas) {
    // ventana de la tesela que cae dentro de la caja
    const x0 = Math.max(0, Math.floor((CAJA.lonO - t.oX) / t.rX)), x1 = Math.min(t.w, Math.ceil((CAJA.lonE - t.oX) / t.rX) + 1);
    const y0 = Math.max(0, Math.floor((CAJA.latN - t.oY) / t.rY)), y1 = Math.min(t.h, Math.ceil((CAJA.latS - t.oY) / t.rY) + 1);
    if (x1 <= x0 || y1 <= y0) continue;
    const [r] = (await t.img.readRasters({ window: [x0, y0, x1, y1] })) as unknown as Float32Array[];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const lon = t.oX + (x + 0.5) * t.rX, lat = t.oY + (y + 0.5) * t.rY;
      const i = Math.floor((CAJA.latN - lat) / PASO), j = Math.floor((lon - CAJA.lonO) / PASO); // celda que contiene el centro del píxel
      if (i < 0 || j < 0 || i >= filas || j >= cols) continue;
      const v = r[(y - y0) * (x1 - x0) + (x - x0)];
      if (Number.isFinite(v) && v > -100) out[i * cols + j] = Math.round(v * 10);
    }
  }
  const vacios = out.filter((v) => v === -32768).length;
  const destino = 'src/data/real/territorio/';
  fs.writeFileSync(destino + 'dem_trujillo.bin', Buffer.from(out.buffer));
  fs.writeFileSync(destino + 'dem_trujillo.json', JSON.stringify({
    fuente: 'Copernicus DEM GLO-30 (ESA). © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, provisto bajo COPERNICUS por la UE y la ESA',
    tipo: 'Modelo digital de superficie (incluye edificaciones)', latN: CAJA.latN, lonO: CAJA.lonO, paso: PASO, celda: 'la celda (i,j) cubre lat latN-(i+1)·paso..latN-i·paso y lon lonO+j·paso..lonO+(j+1)·paso', filas, cols, unidad: 'decímetros', sinDato: -32768, vacios,
  }));
  console.log({ filas, cols, vacios, kb: Math.round(out.byteLength / 1024) });
}
main();
