import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Habilitar transpilación de paquetes del workspace (@faro/*)
  transpilePackages: ['@faro/config', '@faro/observability'],
};

export default nextConfig;
