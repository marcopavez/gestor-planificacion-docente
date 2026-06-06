// eslint.config.js — Faro monorepo (ESLint v9 flat config)
// INV-5: la regla de dependencia exige que los imports apunten siempre hacia el dominio.
// infra/apps dependen de application/domain; nunca al revés. Se hace cumplir aquí + fronteras físicas.

import tsEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    // Ignorar artefactos de build y dependencias
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts', // generado por Next.js (triple-slash); no se lint-ea
      '**/coverage/**',
      '*.tsbuildinfo',
      'pnpm-lock.yaml',
    ],
  },

  // --- Configuración base TypeScript para todos los paquetes ---
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tsEslint,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: {
          // Permite typechecking de archivos de config raíz (vitest.config.ts, eslint.config.js)
          // que no forman parte de ningún tsconfig de paquete (solo existen en raíz).
          allowDefaultProject: ['*.ts', '*.js'],
          defaultProject: 'tsconfig.base.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...tsEslint.configs['recommended'].rules,
      // Prohibir any sin justificación (convención global del proyecto)
      '@typescript-eslint/no-explicit-any': 'error',
      // Prohibir console.log en producción (usar el logger estructurado de observability)
      'no-console': 'error',
    },
  },

  // --- packages/domain: el foso del dominio regulado ---
  // INV-5 + RF-0.2: domain NO puede importar frameworks, infra ni apps.
  // El dominio es TS puro; solo zod está permitido como dependencia de valor.
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // Proveedor de IA (nunca en el dominio)
            { group: ['@anthropic-ai/*'], message: 'domain no puede importar el SDK de Anthropic (INV-5).' },
            // ORM / DB (nunca en el dominio)
            { group: ['drizzle-orm', 'drizzle-orm/*', 'drizzle*'], message: 'domain no puede importar drizzle (INV-5).' },
            // Framework web (nunca en el dominio)
            { group: ['next', 'next/*'], message: 'domain no puede importar Next.js (INV-5).' },
            // Driver de Postgres (nunca en el dominio)
            { group: ['pg', 'pg/*'], message: 'domain no puede importar pg directamente (INV-5).' },
            // Paquetes de infraestructura del monorepo (nunca en el dominio)
            { group: ['@faro/infra-*'], message: 'domain no puede importar infra-* (INV-5).' },
            // Apps del monorepo (nunca en el dominio)
            { group: ['@faro/application', '@faro/web', '@faro/worker'], message: 'domain no puede importar application ni apps (INV-5).' },
          ],
        },
      ],
    },
  },

  // --- packages/application: solo puede importar domain ---
  // INV-5 + RF-0.2: application orquesta puertos del dominio; no conoce infra ni apps.
  {
    files: ['packages/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@faro/infra-*'], message: 'application no puede importar infra-* directamente (INV-5).' },
            { group: ['@faro/web', '@faro/worker'], message: 'application no puede importar apps (INV-5).' },
            { group: ['@anthropic-ai/*'], message: 'application no puede importar el SDK de Anthropic (INV-5).' },
            { group: ['drizzle-orm', 'drizzle-orm/*', 'drizzle*'], message: 'application no puede importar drizzle (INV-5).' },
            { group: ['next', 'next/*'], message: 'application no puede importar Next.js (INV-5).' },
          ],
        },
      ],
    },
  },

  // --- packages/infra-*: puede importar domain (y application si expone use cases); nunca apps ---
  // INV-5: los adapters implementan puertos del dominio; la composition root vive solo en apps.
  {
    files: ['packages/infra-db/**/*.ts', 'packages/infra-ai/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@faro/web', '@faro/worker'], message: 'infra-* no puede importar apps (INV-5).' },
          ],
        },
      ],
    },
  },
];

export default config;
