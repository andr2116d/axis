import type { Config } from 'tailwindcss';

// Colores compartidos con los modos claro y oscuro de Axis.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta: { DEFAULT: 'var(--ink)', 2: 'var(--ink-secondary)' },
        gris: 'var(--muted)', borde: 'var(--line)', control: 'var(--control-line)',
        fondo: 'var(--surface)', panel: 'var(--panel)',
        primario: { DEFAULT: 'var(--accent)', claro: 'var(--accent-soft)', medio: 'var(--accent-border)', oscuro: 'var(--accent)' },
        accion: { DEFAULT: 'var(--action)', hover: 'var(--action-hover)' },
        'sobre-accion': 'var(--on-action)', 'sobre-enfasis': 'var(--on-emphasis)',
        falla: { DEFAULT: 'var(--failure)', tenue: 'var(--failure-surface)', borde: 'var(--failure-line)' },
        aviso: { DEFAULT: 'var(--warning)', tenue: 'var(--warning-surface)', borde: 'var(--warning-line)' },
        pasa: { DEFAULT: 'var(--success)', tenue: 'var(--success-surface)', borde: 'var(--success-line)' },
        revisar: { DEFAULT: 'var(--review)', tenue: 'var(--review-surface)', borde: 'var(--review-line)' },
        concreto: { DEFAULT: 'var(--surface)', claro: 'var(--panel)', oscuro: 'var(--wash)' },
        asfalto: { DEFAULT: 'var(--ink)', suave: 'var(--ink-secondary)' },
        grafito: 'var(--muted)', junta: 'var(--line)',
        vial: { DEFAULT: 'var(--accent)', tenue: 'var(--accent-soft)' },
      },
      fontFamily: {
        sans: ['var(--font-principal)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      maxWidth: { texto: '68ch' },
      boxShadow: { tarjeta: '0 8px 30px -16px rgba(36,44,40,0.12)' },
    },
  },
  plugins: [],
};
export default config;
