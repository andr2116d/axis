// Iconos de trazo (24×24) del prototipo de Axis.

const TRAZOS = {
  user: "<circle cx=\"12\" cy=\"8\" r=\"3\"/><path d=\"M5 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2\"/>",
  arrow: "<path d=\"M4 12h15m-6-6 6 6-6 6\"/>",
  back: "<path d=\"M20 12H5m6 6-6-6 6-6\"/>",
  chevron: "<path d=\"m9 6 6 6-6 6\"/>",
  down: "<path d=\"m6 9 6 6 6-6\"/>",
  upload: "<path d=\"M12 16V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4\"/>",
  file: "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6M8 12h8m-8 4h8\"/>",
  files: "<rect x=\"8\" y=\"7\" width=\"12\" height=\"14\" rx=\"2\"/><path d=\"M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12m7-5h6m-6 4h6\"/>",
  map: "<path d=\"m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zm6-3v15m6-12v15\"/>",
  pin: "<path d=\"M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z\"/><circle cx=\"12\" cy=\"10\" r=\"2.5\"/>",
  coins: "<ellipse cx=\"12\" cy=\"6\" rx=\"7\" ry=\"3\"/><path d=\"M5 6v6c0 1.7 3 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3 3 7 3s7-1.3 7-3v-6\"/>",
  layers: "<path d=\"m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 16l9 5 9-5\"/>",
  check: "<path d=\"m5 12 4 4 10-10\"/>",
  alert: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v6m0 4h.01\"/>",
  filter: "<path d=\"M4 6h16M7 12h10m-7 6h4\"/>",
  list: "<path d=\"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01\"/>",
  clock: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
  lock: "<rect x=\"5\" y=\"10\" width=\"14\" height=\"11\" rx=\"2\"/><path d=\"M8 10V7a4 4 0 0 1 8 0v3m-4 5v2\"/>",
  minus: "<path d=\"M5 12h14\"/>",
  target: "<circle cx=\"12\" cy=\"12\" r=\"6\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M12 2v4m0 12v4M2 12h4m12 0h4\"/>",
  plus: "<path d=\"M12 5v14M5 12h14\"/>",
  close: "<path d=\"m6 6 12 12M18 6 6 18\"/>",
  cube: "<path d=\"m12 3 9 5v8l-9 5-9-5V8zm0 9 9-4m-9 4-9-4m9 4v9\"/>",
  rotate: "<path d=\"M3 12a9 9 0 1 1 3 6.7M3 12V6m0 6h6\"/>",
  water: "<path d=\"M3 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 3 2M3 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 3 2M3 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 3 2\"/>",
  building: "<path d=\"M3 21h18M6 21V5l6-2 6 2v16M9 8h.01M15 8h.01M9 12h.01M15 12h.01M10 21v-4h4v4\"/>",
  print: "<path d=\"M6 9V3h12v6M6 18H3V9h18v9h-3m-12-4h12v7H6zM6 12h.01\"/>",
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tamano = 20 }: { nombre: NombreIcono; tamano?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tamano} height={tamano} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TRAZOS[nombre] }} />
  );
}
