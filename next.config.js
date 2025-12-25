/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output estático para Electron
  output: 'export',
  
  // Desactivar optimización de imágenes (no funciona en export estático)
  images: {
    unoptimized: true,
  },
  
  // Base path vacío para Electron
  basePath: '',
  
  // Asset prefix relativo para file:// protocol
  assetPrefix: './',
  
  // Trailing slash para compatibilidad con file://
  trailingSlash: true,
  
  // Desactivar source maps en producción
  productionBrowserSourceMaps: false,
  
  // Configuración de TypeScript
  typescript: {
    // En desarrollo permitir errores para iterar rápido
    ignoreBuildErrors: process.env.NODE_ENV === 'development',
  },
  
  // ESLint
  eslint: {
    ignoreDuringBuilds: process.env.NODE_ENV === 'development',
  },
};

module.exports = nextConfig;
