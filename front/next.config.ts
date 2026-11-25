import type { NextConfig } from 'next';

const config: NextConfig = {
  // unpdf trae su propio build de pdf.js; se carga en el servidor sin empaquetar.
  serverExternalPackages: ['unpdf'],
  // Datos reales que el motor lee del disco (territorio, Contraloría, clasificador).
  outputFileTracingIncludes: {
    '/api/**': ['./src/datos/real/**', './src/datos/aprendido/**'],
  },
};

export default config;
