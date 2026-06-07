// apps/web/src/lib/respuestaError.ts
// IMP-3: centraliza la respuesta 500 de los route handlers. Loguea el error COMPLETO (con stack)
// del lado servidor y devuelve al cliente un mensaje GENÉRICO — nunca e.message crudo (evita
// filtrar cadena de conexión / nombres de tabla).

import { NextResponse } from 'next/server';
import type { Logger } from '@faro/observability';

export function responderError500(
  log: Logger,
  e: unknown,
  contexto: Record<string, unknown>,
  evento: string,
  mensajeCliente = 'Error interno del servidor.',
): NextResponse {
  // Pasar el Error como objeto (no e.message) deja que el serializer `err` de pino capture stack+type.
  log.error({ err: e instanceof Error ? e : String(e), ...contexto }, evento);
  return NextResponse.json({ error: mensajeCliente }, { status: 500 });
}
