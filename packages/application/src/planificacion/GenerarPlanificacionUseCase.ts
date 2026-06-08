// packages/application/src/planificacion/GenerarPlanificacionUseCase.ts
// H-2.3 · Generación HÍBRIDA de la Planificación de Unidad (spec 02-planificacion §1.2, RF-2.5–2.8).
// Separa datos fijos de IA y ensambla según la plantilla activa del colegio:
//   - DATOS FIJOS: los OA (código+texto) vienen del corpus (OaRepository.porAsignaturaNivel) y la IA
//     NUNCA los toca; los catálogos de checkboxes son sets cerrados de referencia.
//   - IA (borrador): redacta `proposito`, `experiencias`, `indicadores` (sellados `ia_borrador`) y
//     SUGIERE qué checkboxes marcar eligiendo SOLO etiquetas del catálogo.
// El documento nace `borrador` (lo persiste el worker — INV-3); aquí solo se genera y valida el schema.
//
// OJO: este use case es NUEVO y vive al lado de la cascada (GenerarPlanificacionUnidadUseCase, demo
// full-context). NO lo reemplaza: aquel produce TODO el documento con la IA; este separa fijo de IA.

import type {
  BorradorPlanificacionIa,
  CampoPlantillaType,
  CatalogosPlanificacion,
  LlmPort,
  OaReferenciadoType,
  ObjetivoAprendizaje,
  OaRepository,
  PayloadPlanificacion,
  PlanificacionUnidad,
  PlantillaPlanificacion,
  PlantillaRepository,
  UsoTokens,
} from '@faro/domain';
import {
  GeneracionError,
  SchemaBorradorPlanificacionIa,
  SchemaPlanificacionUnidad,
} from '@faro/domain';

/** Error de generación de planificación. `permanente` distingue input inválido (no reintentar)
 *  de fallos transitorios (la IA, la red). El worker decide reintento/fallo según esta marca. */
export class GeneracionPlanificacionError extends Error {
  constructor(
    message: string,
    readonly permanente: boolean,
  ) {
    super(message);
    this.name = 'GeneracionPlanificacionError';
  }
}

/** La plantilla activa pedida (establecimiento, formato) no está configurada (input inválido). */
export class PlantillaNoConfiguradaError extends GeneracionPlanificacionError {
  constructor(establecimiento: string, formato: string) {
    super(
      `No hay una plantilla de Formato ${formato} configurada para '${establecimiento}'. ` +
        `Configura un preset (A/B) antes de generar.`,
      true,
    );
    this.name = 'PlantillaNoConfiguradaError';
  }
}

/** Uno o más OA pedidos no existen en el corpus para (asignatura, nivel) — CA-2.4 (bloqueo claro). */
export class OaInexistenteError extends GeneracionPlanificacionError {
  constructor(
    readonly codigos: readonly string[],
    asignatura: string,
    nivel: string,
  ) {
    super(
      `Los OA [${codigos.join(', ')}] no existen en el corpus para ${asignatura} · ${nivel}.`,
      true,
    );
    this.name = 'OaInexistenteError';
  }
}

export interface DependenciasGenerarPlanificacion {
  readonly oas: OaRepository;
  readonly plantillas: PlantillaRepository;
  readonly llm: LlmPort;
  /** Catálogos de referencia (datos fijos): la IA elige de ellos; el `fijo` se llena con todos. */
  readonly catalogos: CatalogosPlanificacion;
}

/** Metadatos de la llamada al LLM + qué campos generó (para la traza_ia — INV-4, RF-2.13). */
export interface MetaPlanificacion {
  readonly modelo: string;
  readonly usage: UsoTokens;
  readonly stopReason: string;
  readonly camposGenerados: readonly string[];
}

export interface ResultadoGenerarPlanificacion {
  readonly plan: PlanificacionUnidad;
  readonly plantilla: PlantillaPlanificacion;
  readonly meta: MetaPlanificacion;
  /** Versión del corpus de la que salieron los OA (sella la traza/documento — INV-4). */
  readonly corpusVersionId: string;
  /** Todos los códigos de OA disponibles en (asignatura, nivel): el gate v2 valida contra ellos. */
  readonly corpusOaCodigos: readonly string[];
}

export class GenerarPlanificacionUseCase {
  private readonly oas: OaRepository;
  private readonly plantillas: PlantillaRepository;
  private readonly llm: LlmPort;
  private readonly catalogos: CatalogosPlanificacion;

  constructor(deps: DependenciasGenerarPlanificacion) {
    this.oas = deps.oas;
    this.plantillas = deps.plantillas;
    this.llm = deps.llm;
    this.catalogos = deps.catalogos;
  }

  async ejecutar(payload: PayloadPlanificacion): Promise<ResultadoGenerarPlanificacion> {
    // 1) Plantilla activa del colegio (gobierna el ensamblaje y el export — RF-2.3/2.8).
    const plantilla = await this.plantillas.activaPara(payload.establecimiento, payload.plantilla);
    if (plantilla === null) {
      throw new PlantillaNoConfiguradaError(payload.establecimiento, payload.plantilla);
    }

    // 2) DATOS FIJOS: OA del corpus por (asignatura, nivel). La IA no los toca (RF-2.5).
    const oaCorpus = await this.oas.porAsignaturaNivel(payload.asignatura, payload.nivel);
    const porCodigo = new Map(oaCorpus.map((oa) => [oa.codigo, oa] as const));

    // CA-2.4: un OA pedido que no existe en el corpus bloquea con error claro (sin gastar la IA).
    const faltantes = payload.oaCodigos.filter((c) => !porCodigo.has(c));
    if (faltantes.length > 0) {
      throw new OaInexistenteError(faltantes, payload.asignatura, payload.nivel);
    }

    const corpusVersionId = oaCorpus[0]?.corpusVersionId ?? '';
    const oaRef: OaReferenciadoType[] = payload.oaCodigos.map((codigo) => {
      const oa = porCodigo.get(codigo) as ObjetivoAprendizaje;
      // Categoría POR OA: B (DUA) → 'priorizado'. A (denso) → un OAT (código 'OAT n') es 'transversal';
      // el resto queda 'basal'. La distinción basal/complementario NO se deriva del corpus, así que
      // 'basal' es el default y el docente la ajusta en HIL.
      const categoria =
        payload.plantilla === 'B'
          ? 'priorizado'
          : /OAT/i.test(oa.codigo)
            ? 'transversal'
            : 'basal';
      return {
        codigo: oa.codigo, // verbatim del corpus
        categoria,
        descripcion: oa.descripcion, // verbatim del corpus (la IA no lo redacta — RF-2.5)
        detalle: [...(oa.detalle ?? [])], // sub-viñetas oficiales del OA (texto fijo); copia mutable (el oaRef las exige así)
        habilidades: [], // el corpus no expone habilidades por OA; el docente las completa en HIL
      };
    });

    // 3) IA (borrador): redacta proposito/experiencias/indicadores y sugiere checkboxes (RF-2.7).
    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaBorradorPlanificacionIa,
      system: [this.bloqueContexto(payload, plantilla, oaRef)],
      entradaUsuario: this.entradaUsuario(payload, oaRef),
    });
    if (salida.parsed === null) {
      // Refusal / max_tokens: transitorio (RF-0.9) — el worker puede reintentar.
      throw new GeneracionError(salida.stopReason);
    }
    const borrador = salida.parsed;

    // 4) Ensamblaje según la plantilla activa (RF-2.8). El plan se valida contra el schema.
    const { plan, camposGenerados } = this.ensamblar(payload, plantilla, oaRef, borrador);

    return {
      plan: SchemaPlanificacionUnidad.parse(plan),
      plantilla,
      meta: {
        modelo: salida.modelo,
        usage: salida.usage,
        stopReason: salida.stopReason,
        camposGenerados,
      },
      corpusVersionId,
      corpusOaCodigos: oaCorpus.map((oa) => oa.codigo),
    };
  }

  // --- internos: ensamblaje híbrido ---

  private ensamblar(
    payload: PayloadPlanificacion,
    plantilla: PlantillaPlanificacion,
    oaRef: OaReferenciadoType[],
    borrador: BorradorPlanificacionIa,
  ): { plan: PlanificacionUnidad; camposGenerados: string[] } {
    const extras: Record<string, unknown> = {};
    const camposGenerados = new Set<string>(['proposito', 'experiencias', 'indicadores_evaluacion']);

    // Recorre los checkbox_set de la plantilla y los llena por origen (RF-2.6/2.8):
    //  - 'fijo'  → todas las opciones del catálogo (p. ej. los 3 Principios DUA del Formato B).
    //  - 'ia'    → la selección sugerida por la IA, VERBATIM (el gate v2 marca lo fuera de catálogo).
    for (const campo of this.campos(plantilla)) {
      if (campo.tipo !== 'checkbox_set' || campo.catalogo === undefined) continue;
      const opciones = this.catalogos[campo.catalogo].map((o) => o.etiqueta);
      if (campo.origen === 'fijo') {
        extras[campo.clave] = opciones;
      } else if (campo.origen === 'ia') {
        extras[campo.clave] = borrador.seleccion_checkboxes[campo.clave] ?? [];
        camposGenerados.add(campo.clave);
      }
    }

    // 'evaluacion' tipado del schema = vista derivada de las selecciones (cuando la plantilla las trae).
    const tipoEval = this.normalizarTipoEvaluacion(asArray(extras['tipo_evaluacion']));
    const instrumentos = asArray(extras['instrumentos_evaluacion']);

    const plan: PlanificacionUnidad = {
      plantilla: payload.plantilla,
      establecimiento: payload.establecimiento,
      ...(payload.docente !== undefined ? { docente: payload.docente } : {}),
      asignatura: payload.asignatura,
      nivel: payload.nivel,
      unidad: payload.unidad,
      proposito: borrador.proposito,
      ...(payload.duracion_semanas !== undefined ? { duracion_semanas: payload.duracion_semanas } : {}),
      ...(payload.horas_pedagogicas !== undefined ? { horas_pedagogicas: payload.horas_pedagogicas } : {}),
      ...(payload.periodo !== undefined ? { periodo: payload.periodo } : {}),
      oa: oaRef,
      experiencias: borrador.experiencias,
      indicadores_evaluacion: borrador.indicadores.map((i) => ({
        oa: i.oa,
        texto: i.texto,
        fuente: 'ia_borrador' as const, // en v2 los indicadores son borrador de IA (RF-2.7)
      })),
      evaluacion: { tipo: tipoEval, instrumentos },
      extras,
    };
    return { plan, camposGenerados: [...camposGenerados] };
  }

  private campos(plantilla: PlantillaPlanificacion): CampoPlantillaType[] {
    return plantilla.secciones.flatMap((s) => s.campos);
  }

  // Mapea las etiquetas del catálogo 'tipo_evaluacion' (Diagnóstica/Formativa/Sumativa) al enum del
  // schema (diagnostica/formativa/sumativa), sin acentos ni mayúsculas. Lo fuera del enum se descarta.
  private normalizarTipoEvaluacion(etiquetas: string[]): ('diagnostica' | 'formativa' | 'sumativa')[] {
    const validos = ['diagnostica', 'formativa', 'sumativa'] as const;
    const norm = (s: string): string =>
      s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
    const out: ('diagnostica' | 'formativa' | 'sumativa')[] = [];
    for (const e of etiquetas) {
      const v = validos.find((x) => x === norm(e));
      if (v !== undefined && !out.includes(v)) out.push(v);
    }
    return out;
  }

  // --- internos: prompts (en modo demo el LlmPort sirve samples y los ignora; en live, dirigen) ---

  private bloqueContexto(
    payload: PayloadPlanificacion,
    plantilla: PlantillaPlanificacion,
    oaRef: OaReferenciadoType[],
  ): { texto: string; cacheable: boolean } {
    const oaLista = oaRef.map((oa) => `- ${oa.codigo}: ${oa.descripcion}`).join('\n');
    const catalogosIa = this.campos(plantilla)
      .filter((c) => c.tipo === 'checkbox_set' && c.origen === 'ia' && c.catalogo !== undefined)
      .map((c) => {
        const ops = this.catalogos[c.catalogo as keyof CatalogosPlanificacion]
          .map((o) => o.etiqueta)
          .join(' · ');
        return `  · ${c.clave} (${c.etiqueta}): ${ops}`;
      })
      .join('\n');

    const texto = [
      'Eres un asistente de planificación curricular para básica chilena (Bases Curriculares MINEDUC).',
      '',
      'Reglas inviolables:',
      '1. NO inventes ni reescribas OA: los OA (código + texto) son datos fijos del corpus, dados abajo.',
      '2. Para los checkboxes, elige EXCLUSIVAMENTE etiquetas de los catálogos provistos (no agregues opciones nuevas).',
      '3. Todo lo que produces es BORRADOR para revisión docente obligatoria (human-in-the-loop).',
      '4. Respeta el enfoque del nivel.',
      '',
      `Contexto: ${payload.asignatura} · ${payload.nivel} · ${payload.establecimiento} · Formato ${payload.plantilla}.`,
      'OBJETIVOS DE APRENDIZAJE (corpus — única fuente válida, no los modifiques):',
      oaLista,
      '',
      'CATÁLOGOS DE CHECKBOXES (elige solo de estas etiquetas, por clave de campo):',
      catalogosIa.length > 0 ? catalogosIa : '  (esta plantilla no tiene checkboxes redactados por IA)',
    ].join('\n');
    return { texto, cacheable: true };
  }

  private entradaUsuario(payload: PayloadPlanificacion, oaRef: OaReferenciadoType[]): string {
    return [
      `Unidad: ${payload.unidad}`,
      `Asignatura: ${payload.asignatura} · Nivel: ${payload.nivel}`,
      'Genera el borrador: un propósito de la unidad; al menos una experiencia de aprendizaje por cada',
      'OA; 1–3 indicadores de evaluación por OA (cada uno con su código en "oa"); y la selección de',
      'checkboxes apropiada para estos OA. Tributa los indicadores a estos códigos de OA:',
      oaRef.map((o) => o.codigo).join(', '),
    ].join('\n');
  }
}

/** Lee un campo de `extras` como string[] (defensivo: si no es array, []). */
function asArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
