// Iconos de línea de Axis (trazo 1.75, 24×24). Cada uno nombra una cosa del mundo de la obra.
import type { Documento } from '@/lib/analisis/nombres';

type P = { className?: string; titulo?: string };
const Svg = ({ className = 'h-5 w-5', titulo, children }: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={!titulo} role={titulo ? 'img' : undefined}>
    {titulo && <title>{titulo}</title>}{children}
  </svg>
);

export const IconoPdf = (p: P) => <Svg {...p}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 17h4" /></Svg>;
export const IconoSubir = (p: P) => <Svg {...p}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v4h16v-4" /></Svg>;
export const IconoCandado = (p: P) => <Svg {...p}><rect x="5" y="11" width="14" height="10" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
export const IconoCheck = (p: P) => <Svg {...p}><path d="m5 12 4.5 4.5L19 7" /></Svg>;
export const IconoAlerta = (p: P) => <Svg {...p}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17v.5" /></Svg>;
export const IconoMontana = (p: P) => <Svg {...p}><path d="m3 19 6-9 4 5 3-4 5 8z" /><path d="M3 19h18" /></Svg>;
export const IconoGota = (p: P) => <Svg {...p}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></Svg>;
export const IconoTuberia = (p: P) => <Svg {...p}><path d="M3 9h11a3 3 0 0 1 3 3v9" /><path d="M3 15h8v6" /><path d="M2 7v10M15 21h6" /></Svg>;
export const IconoEdificio = (p: P) => <Svg {...p}><path d="M4 21V7l8-4 8 4v14" /><path d="M9 21v-5h6v5M8 10h.01M12 10h.01M16 10h.01" /></Svg>;
export const IconoBucle = (p: P) => <Svg {...p}><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></Svg>;
export const IconoCasco = (p: P) => <Svg {...p}><path d="M4 16a8 8 0 0 1 16 0" /><path d="M2 16h20v3H2zM12 8V5" /></Svg>;
export const IconoMapa = (p: P) => <Svg {...p}><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></Svg>;
export const IconoLupa = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></Svg>;
export const IconoFlecha = (p: P) => <Svg {...p}><path d="M4 12h16m-6-6 6 6-6 6" /></Svg>;
export const IconoMenu = (p: P) => <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>;
export const IconoCerrar = (p: P) => <Svg {...p}><path d="m6 6 12 12M18 6 6 18" /></Svg>;
export const IconoLibro = (p: P) => <Svg {...p}><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15" /></Svg>;
export const IconoInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></Svg>;
export const IconoUbicacion = (p: P) => <Svg {...p}><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></Svg>;
export const IconoChevron = (p: P) => <Svg {...p}><path d="m9 5 7 7-7 7" /></Svg>;
export const IconoImprimir = (p: P) => <Svg {...p}><path d="M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7zM17 11h.01" /></Svg>;

const DOC: Record<Documento, (p: P) => JSX.Element> = {
  presupuesto: (p) => <Svg {...p}><path d="M6 3h12v18H6z" /><path d="M9 7h6M9 11h6M9 15h3M15 15h0" /><path d="M14 17.5h2" /></Svg>,
  metrados: (p) => <Svg {...p}><path d="M3 15 15 3l6 6L9 21z" /><path d="m7 11 2 2M10 8l2 2M13 5l2 2" /></Svg>,
  apu: (p) => <Svg {...p}><path d="M4 4h16v16H4z" /><path d="M4 9h16M9 9v11" /></Svg>,
  gastos: (p) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5" /></Svg>,
  especificaciones: (p) => <Svg {...p}><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h6" /></Svg>,
  cronograma: (p) => <Svg {...p}><path d="M3 5h18M3 5v15h18" /><path d="M6 9h6M9 13h7M12 17h6" /></Svg>,
  formula: (p) => <Svg {...p}><path d="M5 20c3 0 3-16 6-16M8 10h5" /><path d="m14 13 5 6M19 13l-5 6" /></Svg>,
  cotizaciones: (p) => <Svg {...p}><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6" /></Svg>,
  suelos: (p) => <Svg {...p}><path d="M3 7h18M3 12h18M3 17h18" /><path d="M7 7v10M17 12v5" /></Svg>,
  planos: (p) => <Svg {...p}><path d="M3 4h18v16H3z" /><path d="M3 14h6v6M13 4v6h8" /></Svg>,
  memoria: (p) => <Svg {...p}><path d="M5 4h11l3 3v13H5z" /><path d="M8 9h8M8 13h8M8 17h5" /></Svg>,
  caratula: (p) => <Svg {...p}><path d="M6 3h12v18H6z" /><path d="M9 8h6" /></Svg>,
  otro: (p) => <Svg {...p}><path d="M6 3h12v18H6z" /><path d="M10 10a2 2 0 1 1 2.5 2c-.3.2-.5.5-.5 1v.5M12 16.5v.5" /></Svg>,
};
export const IconoDocumento = ({ d, ...p }: P & { d: Documento }) => DOC[d](p);

/** Color de cada tipo de documento en la tira de páginas (siempre acompañado de su nombre). */
export const COLOR_DOC: Record<Documento, string> = {
  presupuesto: '#22262A', metrados: '#4F6F8F', apu: '#6E5F96', gastos: '#94723F', especificaciones: '#3F7C6C', cronograma: '#B08A1E',
  formula: '#8A4F64', cotizaciones: '#5F7E3D', suelos: '#7C5B3F', planos: '#3E5F9A', memoria: '#5E656B', caratula: '#A9AFAA', otro: '#C9CDC8',
};
