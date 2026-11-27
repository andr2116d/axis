import type { NextConfig } from 'next';

const config: NextConfig = {
  // unpdf trae su propio build de pdf.js; se carga en el servidor sin empaquetar.
  serverExternalPackages: ['unpdf'],
  // Datos reales que el motor lee del disco (territorio, Contraloría, clasificador).
  outputFileTracingIncludes: {
    '/api/**': ['./src/datos/real/**', './src/datos/aprendido/**'],
  },
  // La API de Axis (Python): modelos entrenados, selección con el OECE y normativa.
  // Pasa por el mismo origen para no depender de CORS; las subidas en vivo llegan por SSE.
  async rewrites() {
    return [{ source: '/motor/:ruta*', destination: `${process.env.AXIS_API_URL ?? 'http://localhost:8000'}/:ruta*` }];
  },
};

export default config;
