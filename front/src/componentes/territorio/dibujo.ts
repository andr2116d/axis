import type { MapaTramo, Punto } from '@/dominio/territorio';

// Dibujo en canvas del plano de calles, el relieve 3D y el perfil del tramo.

export interface Vista {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
  contours: boolean;
  roads: boolean;
}

export const VISTA_INICIAL: Vista = { zoom: 1, x: 0, y: 0, rotation: 0, contours: true, roads: true };

const COLORES = { road: '#bab8ac', major: '#a69e8b', route: '#bb4a21', lake: '#80afbf', text: '#53554e' };
const PRINCIPALES = new Set(['trunk', 'primary', 'secondary', 'tertiary']);
type Ctx = CanvasRenderingContext2D;

function preparar(canvas: HTMLCanvasElement) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return { ctx, width, height };
}

function trazo(ctx: Ctx, puntos: Punto[], color: string, ancho: number) {
  if (puntos.length < 2) return;
  ctx.beginPath();
  puntos.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = ancho;
  ctx.stroke();
}

function altura(m: MapaTramo, x: number, y: number) {
  const inv = m.divisions / (2 * m.half);
  const u = Math.max(0, Math.min(m.divisions, (x + m.half) * inv));
  const v = Math.max(0, Math.min(m.divisions, (y + m.half) * inv));
  const col = Math.min(m.divisions - 1, Math.floor(u));
  const fila = Math.min(m.divisions - 1, Math.floor(v));
  const a = u - col;
  const b = v - fila;
  const p = m.mesh[fila][col] * (1 - a) + m.mesh[fila][col + 1] * a;
  const q = m.mesh[fila + 1][col] * (1 - a) + m.mesh[fila + 1][col + 1] * a;
  return p * (1 - b) + q * b;
}

function curvasDeNivel(ctx: Ctx, m: MapaTramo, proyectar: (p: Punto) => Punto) {
  const paso = (2 * m.half) / m.divisions;
  for (let fila = 0; fila < m.divisions; fila += 1) {
    for (let col = 0; col < m.divisions; col += 1) {
      const x = -m.half + col * paso;
      const y = -m.half + fila * paso;
      const v: [number, number, number][] = [
        [x, y, m.mesh[fila][col]], [x + paso, y, m.mesh[fila][col + 1]],
        [x + paso, y + paso, m.mesh[fila + 1][col + 1]], [x, y + paso, m.mesh[fila + 1][col]],
      ];
      const h = v.map((p) => p[2]);
      for (let nivel = Math.ceil(Math.min(...h) / 10) * 10; nivel <= Math.max(...h); nivel += 10) {
        const cruces: Punto[] = [];
        for (let i = 0; i < v.length; i += 1) {
          const [a, b] = [v[i], v[(i + 1) % v.length]];
          if (a[2] < nivel === b[2] < nivel) continue;
          const t = (nivel - a[2]) / (b[2] - a[2]);
          cruces.push(proyectar([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]));
        }
        for (let i = 1; i < cruces.length; i += 2) trazo(ctx, cruces.slice(i - 1, i + 1), '#b2ac9570', 0.8);
      }
    }
  }
}

export function dibujarPlano(canvas: HTMLCanvasElement, m: MapaTramo, vista: Partial<Vista>) {
  const d = preparar(canvas);
  if (!d) return;
  const { ctx, width, height } = d;
  const escala = Math.max(width / 1230, height / 1070) * (vista.zoom ?? 1);
  const proyectar = ([x, y]: Punto): Punto => [width / 2 + (vista.x ?? 0) + x * escala, height / 2 + (vista.y ?? 0) - y * escala];

  ctx.fillStyle = '#eeebdf';
  ctx.fillRect(0, 0, width, height);
  if (vista.contours !== false) curvasDeNivel(ctx, m, proyectar);

  for (const [, tipo, linea] of m.roads) {
    if (PRINCIPALES.has(tipo)) continue;
    const p = linea.map(proyectar);
    if (tipo === 'footway' || tipo === 'steps' || tipo === 'path') trazo(ctx, p, '#c6c1b0', 0.7);
    else {
      trazo(ctx, p, COLORES.road, 2.8);
      trazo(ctx, p, '#faf8ef', 1.65);
    }
  }
  for (const [, tipo, linea] of m.roads) {
    if (!PRINCIPALES.has(tipo)) continue;
    const p = linea.map(proyectar);
    trazo(ctx, p, COLORES.major, 5.2);
    trazo(ctx, p, '#fffdf4', 3.6);
  }
  for (const linea of m.waterways) trazo(ctx, linea.map(proyectar), COLORES.lake, 2);

  ctx.font = '600 11px "Public Sans", system-ui, sans-serif';
  ctx.fillStyle = COLORES.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const rotulados = new Set<string>();
  const posiciones: Punto[] = [];
  for (const [nombre, tipo, linea] of m.roads) {
    if (!nombre || nombre === m.name || !PRINCIPALES.has(tipo) || rotulados.has(nombre)) continue;
    const [x, y] = proyectar(linea[Math.floor(linea.length / 2)]);
    const rotulo = nombre.replace(/^Avenida /, 'Av. ');
    if (x < 65 || x > width - 65 || y < 56 || y > height - 55 || posiciones.some(([a, b]) => Math.abs(a - x) < 122 && Math.abs(b - y) < 23)) continue;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#eeebdf';
    ctx.strokeText(rotulo, x, y - 5);
    ctx.fillText(rotulo, x, y - 5);
    rotulados.add(nombre);
    posiciones.push([x, y]);
  }

  const ruta = m.route.map(([, x, y]) => proyectar([x, y]));
  trazo(ctx, ruta, '#fff6e7', 10);
  trazo(ctx, ruta, COLORES.route, 4.5);
  extremos(ctx, ruta, 5, 2);

  const largo = escala * (escala > 0.9 ? 50 : escala > 0.45 ? 100 : 200);
  trazo(ctx, [[width - largo - 15, height - 15], [width - 15, height - 15]], COLORES.text, 2);
  ctx.font = '600 10px "Public Sans", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORES.text;
  ctx.fillText(`${Math.round(largo / escala)} m`, width - 15, height - 25);
}

function extremos(ctx: Ctx, ruta: Punto[], radio: number, borde: number) {
  for (const [x, y] of [ruta[0], ruta[ruta.length - 1]]) {
    ctx.beginPath();
    ctx.arc(x, y, radio, 0, Math.PI * 2);
    ctx.fillStyle = COLORES.route;
    ctx.fill();
    ctx.strokeStyle = '#fff6e7';
    ctx.lineWidth = borde;
    ctx.stroke();
  }
}

export function dibujarRelieve(canvas: HTMLCanvasElement, m: MapaTramo, vista: Vista) {
  const d = preparar(canvas);
  if (!d) return;
  const { ctx, width, height } = d;
  const angulo = ((vista.rotation - 33) * Math.PI) / 180;
  const sen = Math.sin(angulo);
  const cos = Math.cos(angulo);
  const escala = Math.min(width / (m.half * 3.15), height / (m.half * 2.18)) * vista.zoom;
  const profundidad = (x: number, y: number) => x * sen + y * cos;
  const proyectar = (x: number, y: number, z: number): Punto => [
    width / 2 + (x * cos - y * sen) * escala,
    height * 0.53 - profundidad(x, y) * escala * 0.58 - (z - (m.min + m.max) / 2) * escala * 2,
  ];
  const { half, divisions, mesh } = m;
  const paso = (2 * half) / divisions;
  const vertice = (i: number, j: number): [number, number, number] => [-half + paso * j, -half + paso * i, mesh[i][j]];

  const cara = (vs: [number, number, number][], relleno: string, tinta: string) => {
    ctx.beginPath();
    vs.forEach((v, i) => {
      const [x, y] = proyectar(...v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = relleno;
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = tinta;
    ctx.stroke();
  };

  const bordes = [
    Array.from({ length: divisions + 1 }, (_, j) => vertice(0, j)),
    Array.from({ length: divisions + 1 }, (_, i) => vertice(i, divisions)),
    Array.from({ length: divisions + 1 }, (_, j) => vertice(divisions, divisions - j)),
    Array.from({ length: divisions + 1 }, (_, i) => vertice(divisions - i, 0)),
  ];
  for (const borde of bordes) {
    const a = borde[0];
    const b = borde[borde.length - 1];
    if (profundidad((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) >= 0) continue;
    cara([...borde, [b[0], b[1], m.min - 14], [a[0], a[1], m.min - 14]], '#a09a85', '#817a65');
  }

  const caras: { vs: [number, number, number][]; z: number; luz: number }[] = [];
  for (let i = 0; i < divisions; i += 1) {
    for (let j = 0; j < divisions; j += 1) {
      const a = vertice(i, j);
      const vs = [a, vertice(i, j + 1), vertice(i + 1, j + 1), vertice(i + 1, j)];
      const sombra = (vs[1][2] - vs[3][2]) * 0.65;
      const relativa = (a[2] - m.min) / Math.max(m.max - m.min, 1);
      caras.push({ vs, z: profundidad(a[0] + paso / 2, a[1] + paso / 2), luz: Math.min(84, Math.max(48, 66 + relativa * 11 + sombra)) });
    }
  }
  // Las celdas lejanas se pintan primero.
  caras.sort((a, b) => b.z - a.z);
  for (const c of caras) cara(c.vs, `hsl(54 18% ${c.luz}%)`, `hsl(54 16% ${c.luz - 1.5}%)`);

  if (vista.roads) {
    for (const [, tipo, linea] of m.roads) {
      if (['steps', 'footway', 'path'].includes(tipo)) continue;
      for (let i = 1; i < linea.length; i += 1) {
        const [a, b] = [linea[i - 1], linea[i]];
        const puntos: Punto[] = [];
        const tramos = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 15));
        for (let k = 0; k <= tramos; k += 1) {
          const t = k / tramos;
          const [x, y] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          if (Math.abs(x) > half || Math.abs(y) > half) {
            trazo(ctx, puntos, '#f2edda', 0.85);
            puntos.length = 0;
          } else puntos.push(proyectar(x, y, altura(m, x, y) + 0.75));
        }
        trazo(ctx, puntos, '#f2edda', 0.85);
      }
    }
  }

  const ruta = m.route.map(([, x, y, z]) => proyectar(x, y, z + 1.8));
  trazo(ctx, ruta, '#fff5df', 7);
  trazo(ctx, ruta, COLORES.route, 3.5);
  extremos(ctx, ruta, 4.5, 1.5);
}

export function dibujarPerfil(canvas: HTMLCanvasElement, m: MapaTramo) {
  const d = preparar(canvas);
  if (!d) return;
  const { ctx, width, height } = d;
  const cotas = m.route.map((r) => r[3]);
  const bajo = Math.floor(Math.min(...cotas) / 10) * 10;
  const alto = Math.max(bajo + 10, Math.ceil(Math.max(...cotas) / 10) * 10);
  const izq = 38;
  const der = width - 14;
  const base = height - 28;
  const tope = 12;
  const total = m.route[m.route.length - 1][0];
  const proyectar = (dist: number, z: number): Punto => [izq + ((der - izq) * dist) / total, base - ((base - tope) * (z - bajo)) / (alto - bajo)];

  ctx.font = '600 10px "Public Sans", system-ui, sans-serif';
  ctx.fillStyle = COLORES.text;
  for (const valor of [bajo, alto]) {
    const [, y] = proyectar(0, valor);
    trazo(ctx, [[izq, y], [der, y]], '#d6d0c2', 1);
    ctx.textAlign = 'right';
    ctx.fillText(`${valor} m`, izq - 6, y + 3);
  }
  const puntos = m.route.map(([dist, , , z]) => proyectar(dist, z));
  ctx.beginPath();
  ctx.moveTo(izq, base);
  puntos.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(der, base);
  ctx.closePath();
  ctx.fillStyle = '#f7e7d9';
  ctx.fill();
  trazo(ctx, puntos, COLORES.route, 2);
  ctx.fillStyle = COLORES.text;
  ctx.textAlign = 'left';
  ctx.fillText('0 m', izq, height - 8);
  ctx.textAlign = 'right';
  ctx.fillText(`${m.length} m`, der, height - 8);
}
