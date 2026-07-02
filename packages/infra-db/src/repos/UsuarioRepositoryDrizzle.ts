// packages/infra-db/src/repos/UsuarioRepositoryDrizzle.ts
// Task 6: adapter Drizzle de UsuarioRepository — espejo local del usuario de Supabase Auth
// + estado de suscripción (gate de generación, webhook de la pasarela).
import { eq, sql } from 'drizzle-orm';
import type { PlanUsuario, Usuario, UsuarioRepository } from '@faro/domain';
import type { DbOTx } from '../db.js';
import { usuario } from '../schema/index.js';

export class UsuarioRepositoryDrizzle implements UsuarioRepository {
  constructor(private readonly db: DbOTx) {}

  async asegurar(id: string, email: string): Promise<void> {
    // ON CONFLICT DO NOTHING: crear en el primer login, no pisar estado de suscripción existente.
    await this.db.insert(usuario).values({ id, email }).onConflictDoNothing({ target: usuario.id });
  }

  async porId(id: string): Promise<Usuario | null> {
    const [row] = await this.db.select().from(usuario).where(eq(usuario.id, id));
    if (!row) return null;
    return {
      id: row.id, email: row.email, plan: row.plan as PlanUsuario,
      generacionesUsadas: row.generacionesUsadas, periodoFin: row.periodoFin, mpPreapprovalId: row.mpPreapprovalId,
    };
  }

  async incrementarGeneraciones(id: string): Promise<void> {
    await this.db.update(usuario).set({ generacionesUsadas: sql`${usuario.generacionesUsadas} + 1` }).where(eq(usuario.id, id));
  }

  async actualizarSuscripcion(id: string, campos: { plan: PlanUsuario; mpPreapprovalId?: string | null; suscripcionEstado?: string | null; periodoFin?: Date | null }): Promise<void> {
    await this.db.update(usuario).set({
      plan: campos.plan,
      mpPreapprovalId: campos.mpPreapprovalId,
      suscripcionEstado: campos.suscripcionEstado,
      periodoFin: campos.periodoFin,
    }).where(eq(usuario.id, id));
  }
}
