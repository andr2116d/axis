// Convierte los fragmentos de texto que entrega pdf.js en líneas legibles.
// Las celdas de una tabla (separadas horizontalmente) se unen con " | ".

export interface FragmentoPdf {
  str: string;
  x: number;
  y: number;
  ancho: number;
}

export function fragmentosALineas(fragmentos: FragmentoPdf[]): string[] {
  const utiles = fragmentos.filter((f) => f.str.trim() !== '');
  // Agrupar por altura (y). pdf.js usa y creciente hacia arriba.
  utiles.sort((a, b) => b.y - a.y || a.x - b.x);
  const filas: FragmentoPdf[][] = [];
  for (const f of utiles) {
    const fila = filas.find((r) => Math.abs(r[0].y - f.y) < 2.5);
    if (fila) fila.push(f);
    else filas.push([f]);
  }
  filas.sort((a, b) => b[0].y - a[0].y);
  return filas.map((fila) => {
    fila.sort((a, b) => a.x - b.x);
    let linea = '';
    let finAnterior: number | null = null;
    for (const f of fila) {
      if (finAnterior !== null) {
        const hueco = f.x - finAnterior;
        linea += hueco > 9 ? ' | ' : hueco > 1.2 ? ' ' : '';
      }
      linea += f.str;
      finAnterior = f.x + f.ancho;
    }
    return linea.replace(/\s+/g, ' ').trim();
  });
}
