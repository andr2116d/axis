/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permite verificar cambios sin sobrescribir los archivos del servidor en uso.
  distDir: process.env.AXIS_DIST_DIR || '.next',
  experimental: {
    // Los datos reales se leen con fs desde las rutas de API: hay que incluirlos en el despliegue.
    outputFileTracingIncludes: { '/api/**/*': ['./src/data/real/**/*', './src/data/aprendido/**/*'] },
  },
  webpack: (config) => {
    // pdf.js intenta cargar "canvas" en Node; en el navegador no se necesita.
    config.resolve.alias.canvas = false;
    return config;
  },
};
export default nextConfig;
