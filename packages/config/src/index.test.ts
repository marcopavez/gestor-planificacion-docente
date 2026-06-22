import { describe, expect, it } from 'vitest';
import { EnvSchema } from './index.js';

describe('EnvSchema (GEMINI_API_KEY)', () => {
  const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', ANTHROPIC_API_KEY: 'k' };
  it('parsea sin GEMINI_API_KEY (opcional)', () => {
    expect(EnvSchema.safeParse(base).success).toBe(true);
  });
  it('acepta GEMINI_API_KEY', () => {
    expect(EnvSchema.safeParse({ ...base, GEMINI_API_KEY: 'g' }).success).toBe(true);
  });
});
