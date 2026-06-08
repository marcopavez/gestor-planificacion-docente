// PUT /api/aula/documentos/[id] — edita el contenido (la PlanificacionUnidad) de un documento borrador
// durante la revisión HIL (H-2.7, CA-2.5): el docente corrige cualquier campo, incluidos los
// `ia_borrador`. Revalida con el gate v2 (sin red) y persiste el nuevo payload + gates. Re-exportar
// (.docx/.pdf) refleja el cambio. INV-5: usa puertos; INV-2/3: no cambia el estado de revisión.

import { NextResponse } from 'next/server';
import { SchemaPlanificacionUnidad, planificacionGateV2 } from '@faro/domain';
import type { OaReferenciadoType } from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/documentos/editar');

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo.' }, { status: 400 });
  }

  const parsed = SchemaPlanificacionUnidad.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: `Planificación inválida: ${parsed.error.message}` }, { status: 400 });
  }
  const plan = parsed.data;

  try {
    const { documentos, plantillas, catalogoRepo } = produccion();
    const doc = await documentos.porId(id);
    if (doc === null) {
      return NextResponse.json({ error: `Documento '${id}' no encontrado.` }, { status: 404 });
    }
    if (doc.tipo !== 'planificacion_unidad') {
      return NextResponse.json({ error: `El documento '${id}' no es una planificación de unidad.` }, { status: 400 });
    }
    // HIL: solo se edita lo que está en revisión; un documento finalizado no se muta (INV-3).
    if (doc.estadoRevision === 'aprobado' || doc.estadoRevision === 'rechazado') {
      return NextResponse.json(
        { error: `No se puede editar un documento en estado '${doc.estadoRevision}'.` },
        { status: 409 },
      );
    }

    // Los OA son datos fijos del corpus (RF-2.5/CA-2.3): no son editables. Rechazamos cualquier
    // alteración de los OA respecto al documento generado (el cliente no puede reescribirlos).
    const guardado = SchemaPlanificacionUnidad.safeParse(doc.contenido);
    if (guardado.success && !mismosOa(guardado.data.oa, plan.oa)) {
      return NextResponse.json(
        { error: 'Los Objetivos de Aprendizaje son datos fijos del corpus y no se pueden modificar.' },
        { status: 422 },
      );
    }

    const plantilla = await plantillas.activaPara(plan.establecimiento, plan.plantilla);
    if (plantilla === null) {
      return NextResponse.json(
        { error: `No hay plantilla de Formato ${plan.plantilla} para '${plan.establecimiento}'.` },
        { status: 422 },
      );
    }
    const catalogos = await catalogoRepo.catalogos();

    // Revalidación: como acabamos de garantizar que los OA no cambiaron respecto a la generación
    // (que los validó contra el corpus), sus propios códigos son la verdad para el gate; se
    // reevalúan requeridos, cobertura y checkboxes fuera de catálogo.
    const reporte = planificacionGateV2({
      plan,
      plantilla,
      oaCodigosCorpus: plan.oa.map((o) => o.codigo),
      catalogos,
    });

    await documentos.marcarGeneracion(id, reporte.ok ? 'validado' : 'fallido', plan, reporte);
    return NextResponse.json({ ok: reporte.ok, resultadoGates: reporte });
  } catch (e) {
    return responderError500(log, e, { id }, 'PUT /documentos/[id] falló');
  }
}

/** ¿Son los mismos OA (código + descripción + categoría, mismo orden)? Los OA son inmutables. */
function mismosOa(a: readonly OaReferenciadoType[], b: readonly OaReferenciadoType[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((oa, i) => {
    const otro = b[i];
    return otro !== undefined && oa.codigo === otro.codigo && oa.descripcion === otro.descripcion && oa.categoria === otro.categoria;
  });
}
