import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Habilitar transpilación de paquetes del workspace (@faro/*)
  transpilePackages: [
    '@faro/config',
    '@faro/observability',
    '@faro/domain',
    '@faro/application',
    '@faro/infra-ai',
    '@faro/infra-db',
    '@faro/infra-export',
  ],
  // pptxgenjs es CJS con dependencias de Node (jszip, fs): se carga desde node_modules en el
  // server, no se empaqueta (evita problemas de interop al bundlear).
  // pg es un driver nativo de Node: se externaliza para que webpack no intente bundlearlo.
  serverExternalPackages: ['pptxgenjs', 'pg'],
  // Los paquetes @faro/* son NodeNext y usan specifiers con extensión .js en sus imports
  // internos; al transpilarlos desde fuente, webpack debe mapear .js → .ts/.tsx.
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
