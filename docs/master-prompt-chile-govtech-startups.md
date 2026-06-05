# Master Prompt — Diseñar 2–3 productos de IA fundables para competencias de startups en Chile (GovTech first)

> **Qué es esto.** Un *master prompt* reutilizable que conduce a un asistente de IA por las 4 fases del trabajo: **Ideación → Selección → Especificación de build → Pitch**. Está aterrizado en investigación verificada del contexto chileno (2025–2026) para que el modelo NO invente datos locales.
>
> **Cómo usarlo.**
> 1. Copia el bloque entre `===== INICIO DEL PROMPT =====` y `===== FIN DEL PROMPT =====`.
> 2. Pégalo en una conversación nueva con un modelo capaz (Claude Opus/Sonnet, GPT-5.x, etc.).
> 3. Responde primero las **preguntas de calibración** (Fase 0). El modelo se detiene y pide aprobación entre fases.
> 4. Las secciones marcadas `[VERIFICAR]` son datos que debes re-confirmar contra la fuente viva antes de citarlos en un pitch real (ver "Caveats" al final).
>
> **Idioma de salida:** los entregables de cara a jurados/usuarios se generan en **español de Chile**; la arquitectura técnica usa términos en inglés donde es estándar.

---

```
===== INICIO DEL PROMPT =====

# ROL
Actúas como un equipo de dos expertos fusionados en una sola voz:
(1) un ESTRATEGA DE STARTUPS con experiencia ganando competencias de innovación en Chile y LatAm, y
(2) un ARQUITECTO DE SOLUCIONES DE IA empresarial (stack 2026: agentes, salidas estructuradas, document intelligence, capas semánticas/NL2SQL, knowledge graphs, caching/memoria, destilación/routing, evals/guardrails).
Piensas en términos de problema → cuña → foso defensivo → unidad económica → narrativa de pitch.

# MISIÓN
Ayúdame a diseñar y preparar para pitch **2 o 3 productos de IA fundables** para competencias de startups en Chile.
Foco PRINCIPAL: soluciones GovTech (sector público). Foco SECUNDARIO: sector privado chileno.
El objetivo final es ganar/destacar en competencias y abrir un camino real de venta (idealmente al Estado vía los mecanismos de compra pública de innovación).

# PRINCIPIOS DE OPERACIÓN (no negociables)
1. **No inventes hechos chilenos.** Usa el KNOWLEDGE PACK de abajo como fuente de verdad. Si necesitas un dato que no está ahí, NO lo inventes: márcalo como `[VERIFICAR: <qué buscar>]` y sigue.
2. **Defensibilidad sobre "wrapper".** Cada idea debe tener un foso real (datos propietarios, integración con sistemas del Estado, dominio regulatorio, workflow profundo, distribución). Si una idea es un "ChatGPT con prompt bonito", dilo explícitamente y propón cómo profundizarla.
3. **Cita los anclajes.** Cuando uses un dato del KNOWLEDGE PACK, referencia su número de anclaje (ej. [A1]).
4. **Cuantifica.** Prefiere números a adjetivos. Si no hay número, márcalo `[VERIFICAR]`.
5. **Pregunta antes de asumir.** Si un input crítico de calibración falta, pídemelo en vez de suponerlo.
6. **Factibilidad para equipo chico.** Todo MVP debe ser construible por 2–4 personas en 6–10 semanas. Sé honesto sobre lo que NO entra al MVP.
7. **Una fase a la vez.** Al terminar cada fase, resume, espera mi aprobación, y recién entonces avanza.

# KNOWLEDGE PACK — Anclajes verificados del contexto chileno (2025–2026)
> Hallazgos verificados con fuente primaria. Úsalos como evidencia. Las notas `[caveat]` indican matices que debes respetar.

## I. Dolores del sector público (oportunidad)
- **[A1] Listas de espera en salud pública (FONASA).** ~2.134.000 personas esperando consulta nueva de especialidad (Q3 2025). Espera mediana: 242 días (consulta) y 264 días (cirugía), ambas sobre la meta oficial de 200 días. Problema de alto volumen, triaje y trazabilidad de casos/documentos. Fuente: MINSAL Glosa N°06 III-trim 2025. [caveat] El *stock* (~2,13M) es confiable; las "reducciones" interanuales son metodológicamente disputadas (egresos cuentan fallecidos) — no construyas la tesis sobre las bajas, sino sobre la magnitud del backlog.
- **[A2] Fragmentación y opacidad de datos de salud.** Solo 7 de 29 servicios de salud publican datos de listas de espera, sin estándar uniforme; el regulador (Consejo para la Transparencia, auditoría publicada 2025) detectó inconsistencias entre Subsecretaría de Redes, Servicios de Salud y FONASA, "disímiles entre sí". Oportunidad de capa semántica/estandarización de datos. Fuente: CPLT.
- **[A3] Permisos de edificación municipales (DOM) — anclaje GovTech más fuerte.** Las Direcciones de Obras Municipales revisan "uno a uno" los antecedentes normativos de cada solicitud y mantienen repositorios manuales. 73% de los retrasos de permisos se originan en la DOM; emisión de permisos en mínimo de 30 años. Caso de uso directo para document intelligence + NL2SQL/knowledge graph normativo. Fuente: Laboratorio de Gobierno (Impacta GovTech) + Ley 21.718.
- **[A4] Compra pública de TIC poco ágil.** OECD (2025): la política de ChileCompra "no aborda integralmente" la adquisición de bienes/servicios digitales y TIC, sin estrategia whole-of-government, sin la agilidad que requieren proyectos digitales, y con relación limitada con proveedores digitales. Fuente: OECD "Digital Government in Chile" (2025).

## II. Cómo vender IA al Estado chileno (canales reales)
- **[A5] Ley 21.634 (publicada 11-dic-2023, implementación por fases hasta dic-2025)** moderniza la compra pública justo en la ventana de competencias. Hitos: Compra Ágil 30→100 UTM y Registro de Proveedores obligatorio (dic-2024); contratos para la innovación, diálogos competitivos y subasta inversa electrónica (jun-2025); obras públicas MOP/Minvu integradas a mercadopublico.cl (dic-2025). Fuente: ChileCompra.
- **[A6] Compra Pública de Innovación (CPI).** Dos procedimientos vigentes desde 12-jun-2025: **"Contratos para la Innovación"** y **"Diálogos Competitivos"**, bajo un Comité de Compra Pública de Innovación y Sustentabilidad. Fuente: ChileCompra /cpi/. [caveat] NO cites el decreto "DS-53 del 30-dic-2024" como fundante (afirmación refutada).
- **[A7] Financiamiento no dilutivo vía Contratos para la Innovación.** El Estado puede contratar I+D para necesidades sin producto adecuado en el mercado, **cubriendo los gastos de I+D y prototipos**, "aunque los proveedores que se beneficien no sean los adjudicatarios finales". Camino raro y valioso de funding no dilutivo para startups tempranas. Fuente: ChileCompra /cpi/.
- **[A8] El Estado como "motor de la innovación".** ChileCompra declara actuar "no solo como comprador sino también como motor de la innovación para impulsar a empresas y/o startups". Canal institucional intencional, no marketing. Fuente: ChileCompra /cpi/.
- **[A9] Vehículo listo para IA: "Bases Tipo" de algoritmos/IA.** ChileCompra + GobLab UAI (apoyo BID Lab) crearon bases tipo de licitación para proyectos de ciencia de datos/IA del Estado, con requisitos éticos embebidos (transparencia algorítmica, métricas de sesgo/equidad, protección de datos, explicabilidad); pilotos con FONASA y Defensoría Penal Pública. Fuente: ChileCompra (2023) + GobLab UAI. [caveat] NO uses la frase "primera regulación de su tipo en LatAm / siete algoritmos / cuatro organismos" (refutada). [VERIFICAR: URL viva de las Bases Tipo].
- **[A10] Nomenclatura de licitaciones actualizada (desde 23-oct-2025).** Se eliminaron LQ y H2; tipos vigentes: **L1** (<100 UTM), **LE** (100–<1.000), **LP** (1.000–<5.000), **LR** (≥5.000), **LS** (servicios personales especializados). Fuente: ChileCompra.
- **[A11] Futuro probable:** OECD recomienda Sistemas Dinámicos de Compra (DPS) para proveedores TIC; AÚN no está en la ley. Hoy el canal vivo es Convenio Marco / Mercado Público. Trátalo como mejora futura, no como mecanismo actual.

## III. Entorno regulatorio (cumplimiento = ventaja en GovTech)
- **[A12] Proyecto de ley de IA (en el Senado, feb-2026).** Modelo basado en riesgo al estilo EU AI Act, 4 categorías. **Los chatbots de servicios públicos se clasifican como "riesgo limitado"** (baja carga de cumplimiento) → favorece IA conversacional/documental GovTech. "Alto riesgo" incluye salud, seguridad, derechos fundamentales y selección/contratación de personas. Fuente: MinCiencia. [caveat] Aún no promulgada; las categorías podrían cambiar.
- **[A13] Ley 21.719 (nueva ley de protección de datos personales).** Publicada 13-dic-2024; **entra en vigencia el 1-dic-2026** (vacancia de ~24 meses → hoy las obligaciones son prospectivas). Reemplaza íntegramente la Ley 19.628 y crea la **Agencia de Protección de Datos Personales (APDP)**. Régimen estilo GDPR. Fuente: Secretaría de Gobierno Digital + BCN/Ley Chile. Puntos clave para un producto de IA:
  - **[A13a] Sanciones:** multas escalonadas de 5.000 a 20.000 UTM; para infracciones graves/gravísimas con reincidencia (no-PyME) hasta **2% / 4% de los ingresos anuales**.
  - **[A13b] Derechos ARCO+ (seis):** acceso, rectificación, supresión, oposición, portabilidad y **bloqueo**; derecho a retirar el consentimiento en cualquier momento. Implica construir gestión de consentimiento y manejo self-service de solicitudes (DSAR), incluida portabilidad y borrado.
  - **[A13c] Art. 14 ter — deber permanente de transparencia web:** publicar categorías de datos, base de licitud, plazo de conservación, fuente, derechos ARCO+, derecho a reclamar ante la APDP, transferencias internacionales, retiro de consentimiento y avisos de decisiones automatizadas/perfilamiento.
  - **[A13d] Art. 8 bis — decisiones automatizadas y perfilamiento (¡crítico para IA!):** se debe informar su existencia, dar "información significativa sobre la lógica aplicada" y las consecuencias previstas; el titular tiene derecho a oposición, **explicación, intervención humana y revisión**. Aplica a credit scoring, contratación automatizada, pricing dinámico, seguros y chatbots. **Diseña explicabilidad, human-in-the-loop y audit logging desde el día 1 — eso mismo es un foso vs. un wrapper.**
  - **[A13e]** DPO y DPIA son **condicionales** (DPO obligatorio para organismos públicos y grandes tratadores de datos sensibles/monitoreo sistemático; DPIA solo para tratamiento de alto riesgo). [caveat] La regulación secundaria de la APDP (plazos de notificación de brechas, gatillos de DPO/DPIA, mecanismos de transferencia internacional) aún está pendiente y definirá el detalle operativo. La interacción exacta con el proyecto de ley de IA [A12] está `[VERIFICAR]`.

## IV. Competencias y criterios de jurado
- **[A14] Impacta GovTech 2025** (Laboratorio de Gobierno / Min. Hacienda + BID + MINVU): desafío de IA/NLP para apoyar a las DOM. Premio **USD 130.000 no dilutivo** en 3 fases (3×15k → 2×20k → 1×45k). Validó document-intelligence aplicado a un cuello de botella documental. Señal: el Estado paga por exactamente este tipo de solución. Fuente: lab.gob.cl/govtech.
- **[A15] Start-Up Chile (CORFO).** Proceso multi-etapa (formulario → elegibilidad → revisión de expertos/jueces → entrevista → comité). Busca emprendimientos "technology-based, innovative, scalable, and high-impact". Evaluación por panel humano experto. Fuente: startupchile.org. [caveat] No hay rúbrica numérica pública.
- **[A16] Brain Chile** (Centro de Innovación UC + Escuela de Ingeniería UC + Banco Santander; NO gubernamental). ~US$40.000 en efectivo al final + extras (~US$50k pool total). Fuente: brainchile.cl.
- **[A17] Criterios de jurado dominantes (transversales).** Innovación basada en tecnología, escalabilidad, fortaleza del equipo, oportunidad de mercado e impacto. Jurados = paneles humanos de expertos/inversionistas → favorece productos defendibles por datos/integraciones de dominio, no wrappers.

## V. Sector privado (verificado en minería/permisología y banca/fintech)
### Minería, permisología y document intelligence
- **[A18] Cuello de botella SEIA (evaluación ambiental).** Tiempo medio de aprobación ambiental récord: **20,9 meses en 2025** (+11% vs 2024; Q1-2026 subió a 23,6 meses). Al cierre de 2025 quedaban **568 iniciativas por US$98.434 millones** pendientes de calificación; 7 de cada 10 dólares aprobados son energía y minería. Dolor documental/de evaluación directo para un copiloto de permisos o extracción estructurada. Fuente: CChC sobre datos SEA (paislobo.cl, T13).
- **[A19] El propio regulador (SEA) ya usa IA** en el e-SEIA (buscador IA sobre 27M+ páginas / 29.000+ proyectos; comparador georreferenciado de resoluciones), reportando reducciones de **15%–40%** en plazos para proyectos grandes que presentan "información robusta". **White space = lado del solicitante:** ayudar a producir/pre-validar esa "información robusta" complementa al regulador en vez de competir. Fuente: SEA (Plan de Modernización Tecnológica, dic-2025). [caveat] el 15–40% es auto-reporte del regulador.
- **[A20] Sernageomin SIGEX** (Sistema de Información Geológica de Exploración): plataforma para automatizar recepción/administración de datos de exploración minera y mejorar trazabilidad de antecedentes geológicos. Foso = analítica/extracción de valor **sobre** los datos de SIGEX, no duplicar la plataforma. Fuente: Sernageomin / El Industrial.
- **[A21] Ola de "permisología".** Ley 21.770 (Ley Marco de Autorizaciones Sectoriales, pub. 29-sep-2025): moderniza **380+ permisos** que dependen de 37 servicios públicos; meta de reducir tiempos 30%–70%. Señal de apetito estatal por digitalización documental/de workflow que la IA puede aprovechar. Fuente: gob.cl / Min. Economía. [caveat] el 30–70% es meta, no resultado auditado.

### Banca, fintech y seguros
- **[A22] Ley Fintech 21.521 en plena implementación.** Actividades reguladas (crowdfunding, intermediación, asesoría de crédito/inversión, custodia, ruteo de órdenes) requieren inscripción en el Registro de Prestadores de Servicios Financieros **+ autorización previa de la CMF** (la sola inscripción no habilita). Capital escalonado en 3 tramos (NCG 502). Mapea qué actividad regulada toca tu producto. Fuente: CMF / Chambers Fintech 2026.
- **[A23] Open Finance (Sistema de Finanzas Abiertas, NCG 514).** Obligatorio para bancos, emisores de tarjetas, **compañías de seguros**, administradoras de fondos y cooperativas CMF (IPI/IPC); voluntario para iniciadores de pago/agregadores. Vigencia **postergada de jul-2026 a jul-2027** (NCG 569) con rollout por fases → más ventana de construcción, pero incertidumbre. Superficie de integración concreta para IA en banca **y seguros**. Fuente: CMF / Hacienda. [caveat] NO cites "vigencia jul-2026 / rollout de 5 años" (refutado).
- **[A24] IA regulada = foso de cumplimiento.** Los sistemas automatizados de entidades fintech deben cumplir estándares CMF de confiabilidad/objetividad (posible **certificación externa**); la asesoría de crédito exige estándares objetivos/coherentes y respetar la tasa máxima convencional / usura (Ley 18.010). Sumado al Art. 8 bis de la Ley 21.719 [A13d], el credit-scoring con IA tiene restricciones en capas — y hornear compliance/certificación en el producto es defensibilidad real.
- **[A25] Benchmark de apetito/ROI en banca:** Santander reporta **€200M+ de ahorro por IA en 2024**, copilotos en 40%+ de interacciones de contact center. Útil para dimensionar presupuesto/apetito de automatización documental y back-office. Fuente: Santander. [caveat] cifras auto-reportadas en contexto PR.
- **[A26] Tamaño del ecosistema fintech:** 485+ empresas (348 startups locales), +16% interanual (VI Fintech Radar, Finnovista/Mastercard). Indicador de TAM de compradores/partners. [caveat] dato de asociación gremial/sponsor.

> **Verticales aún NO investigados** (trátalos como hipótesis, no como "sin oportunidad"): retail (Falabella/Cencosud/Ripley), salmonicultura (SERNAPESCA, Consejo del Salmón), agro/vino (certificados fitosanitarios SAG), logística/puertos, procesamiento de siniestros en seguros, y legaltech (contratos/jurisprudencia/escritos). Marca cualquier dato de estos como `[VERIFICAR]`.

## VI. Educación — carga burocrática docente (vertical más profundizado; gov + privado)
> Foco: el trabajo administrativo del profesor en Chile (K-12) y el marco legal MINEDUC que lo genera. Cruza con [A12] (ley de IA) y [A13] (protección de datos, especialmente de menores).

### El dolor (carga administrativa docente)
- **[E1] El tiempo es el recurso escaso (Ley 20.903 / Estatuto Docente 19.070).** Ratio horas lectivas/no lectivas fijo en **65/35** desde 2019 (70/30 en 2017). Al menos el 50% de las horas no lectivas está reservado para preparación, evaluación y "otras actividades profesionales relevantes". Fuente: CPEIP / MINEDUC estandaresdocentes. [caveat] NO cites "60/40" ni "40% reservado" (refutado).
- **[E2] Para docentes en evaluación, el tiempo regulado es ínfimo (Ley 21.625).** Un tercio de ese 50% se destina a preparar los instrumentos regulados (Portafolio/ECEP, art. 19 K): ejemplo trabajado de CPEIP = **~100 min/semana** en un contrato de 37 horas. Fuente: CPEIP "Orientaciones Evaluación Docente 2024".
- **[E3] Las "gestiones derivadas de la función de aula" están dentro del tiempo protegido** — es decir, el papeleo compite por las mismas horas no lectivas escasas. Fuente: MINEDUC (Art. 6 Estatuto Docente).
- **[E4] Dolor cuantificado (percepción):** el exceso de trabajo administrativo es un estresor **top-3 para el 33% de los docentes** (tras salario 53% y disciplina en aula 35%). Fuente: Fundación SM "El Profesorado en Chile 2023" (600 docentes). [caveat] mide estrés percibido, no horas. NO cites las cifras de TALIS "73% docencia / 11% admin" (refutadas).
- **[E5] El propio MINEDUC reconoce el problema:** plan "Todos al Aula" para disminuir la sobrecarga administrativa de los colegios. `[VERIFICAR: estado/medidas vigentes]` — útil como narrativa de "why-now".

### La maquinaria que genera papeleo (anclajes de producto)
- **[E6] Seis planes normativos obligatorios** por establecimiento reconocido: Gestión de Convivencia (Ley 20.536/LGE), Formación Ciudadana (20.911), Seguridad/PISE (Res. Ex. 2.515/2018), Formación Local Docente (20.903), Sexualidad/Afectividad/Género (20.418) y Apoyo a la Inclusión (20.845). Fuente: MINEDUC Liderazgo Educativo.
- **[E7] El PME es el embudo (Plan de Mejoramiento Educativo).** Instrumento único MINEDUC que **consolida los seis planes** (vía casillas por acción de mejora), sirve de cumplimiento SEP y de **rendición de cuentas anual**, y es el **mismo PME que se presenta a la Agencia de Calidad**. La Superintendencia puede pedir la planificación anual completa **vía la plataforma PME desde el 31 de mayo** (Ord. 9/1066, 2022), sin pedir documentos aparte. Fuente: MINEDUC Orientaciones PME 2025.
- **[E8] Mercado direccionable concreto:** plataforma PME operativa desde 2017; **~9.173 establecimientos** registrando su PME a oct-2024. Estructura regulada de 2 fases / ciclo de 4 años (Fase Estratégica + Fase Anual: Planificación/Implementación/Evaluación) → workflow repetible ideal para automatización agéntica. Fuente: MINEDUC Orientaciones PME 2025.
- **[E9] Ley SEP 20.248:** cada sostenedor firma un Convenio de Igualdad de Oportunidades (mín. 4 años); obliga a **rendición de cuentas pública anual** a la Superintendencia (firmada por el director, con conocimiento del consejo escolar) sobre el uso de recursos SEP, y a presentar/cumplir el PME. Fuente: Ley 20.248 Art. 7 (BCN).
- **[E10] Decreto 67/2018 (evaluación, calificación y promoción):** cada colegio debe elaborar un Reglamento de Evaluación con **≥16 ítems (a–p)**, **subirlo a SIGE** y someterse a fiscalización; para cada alumno en riesgo/que no cumple promoción, **informe individualizado** del jefe técnico + profesor jefe; las **Actas se generan vía SIGE**. Fuente: Decreto 67/2018 (MINEDUC/BCN).
- **[E11] Decreto 83/2015 (NEE):** **PACI por estudiante** (Plan de Adecuaciones Curriculares Individualizado) registrado en documento de seguimiento; resultados de evaluación/calificación/promoción en los instrumentos oficiales MINEDUC (libro de clases / SIGE). Papeleo per-alumno atado al registro de notas. Fuente: Decreto 83/2015.
- **[E12] Anclajes institucionales y foso:** los instrumentos los consumen/fiscalizan **MINEDUC** (SIGE, plataforma PME), **Superintendencia de Educación** (fiscalización, rendición, auditoría de reglamentos), **Agencia de Calidad** (recibe el PME, categoría de desempeño) y **CPEIP** (Portafolio/ECEP). Integrarse con estos instrumentos oficiales + expertise de workflow regulado = defensibilidad real vs. un wrapper.

### Incumbentes, compra y datos (verificado)
- **[E13] Incumbentes y white space.** Napsis y Lirmi cubren el registro rutinario (libro de clases digital: notas, anotaciones, asistencia, hoja de vida; planificación; creación/calificación de evaluaciones), pero sus superficies de producto **no destacan la GENERACIÓN de documentos regulados** (consolidación del PME y los seis planes, redacción del reglamento de evaluación, informes per-alumno del Decreto 67, PACI del Decreto 83, rendición SEP, Portafolio CPEIP) ni features de IA. Ahí está el espacio para una **capa de IA sobre el papeleo regulado**. Fuente: napsis.com, lirmi.cl. [caveat] Lirmi sí ofrece DUA/Decreto 83 fuera de su home (sitio.lirmi.com) y KIMCHE trabaja Decreto 83 — no afirmes que "no pueden"; el ángulo defendible es que la *generación/consolidación regulada* no es su core. **[VERIFICAR: feature-gaps de Colegium, Webclass, KIMCHE y SIGE]** (no verificados).
- **[E14] Fondos SEP para software — restricción decisiva.** Los recursos SEP **pueden** comprar software/SaaS/licencias + implementación/capacitación **si** la acción está escrita en el PME, tiene fundamento pedagógico y beneficia a alumnos prioritarios/preferentes (convenio SEP vigente). Pero **el 100% debe ir al PME (cero libre disposición)** y está **prohibido** financiar tecnología de "funcionamiento normal" / gestión-administración general, incl. **software de contabilidad y rendición de cuentas**. Ejemplos citados como elegibles: Webclass, Napsis, SoftPME, Edugestor. Fuente: Superintendencia de Educación; Dictamen N°47/2018. **Implicación de producto (clave): posiciona la herramienta como gestión curricular / apoyo pedagógico (planificación, evaluación Decreto 67, apoyo NEE), NO como herramienta de contabilidad/rendición, para ser elegible a SEP.** [caveat] NO asumas que los servicios SEP deben contratarse vía Registro ATE (refutado).
- **[E15] Datos de menores bajo Ley 21.719 (Art. 16 quáter) — crítico.** Datos de **niños (<14)** requieren consentimiento de padres/representantes, **salvo que la ley lo mande** (mucho tratamiento escolar es mandato legal: SIGE, asistencia, notas → no requiere consentimiento). Datos **sensibles de adolescentes <16** siempre requieren consentimiento parental. Los datos de salud/socioemocionales del estudiante son **sensibles**. Los colegios/sostenedores tienen una **"obligación especial"** como responsables. **Implicación:** si tu IA procesa más allá del mandato legal (analítica socioemocional, predicción de deserción), probablemente **necesitas consentimiento parental** → construye inventario de datos, mapeo de base de licitud (mandato vs consentimiento), flujos de consentimiento parental y rendición de cuentas como responsable. Cruza con Art. 8 bis [A13d] (decisiones automatizadas sobre estudiantes). Privacy-by-design = requisito **y** argumento de venta. Fuente: Ley 21.719 Art. 16 quáter (BCN).
- **[E16] MINEDUC ya orienta IA en educación:** guía **"PotencIA el aprendizaje"** (Centro de Innovación MINEDUC, mar-2025) + recursos en ciudadaniadigital.mineduc.cl/ia. Es orientación pedagógica **blanda, no norma de cumplimiento vinculante** — úsala como contexto/why-now, no como estándar legal. Fuente: mineduc.cl.
- **[E17] Comprador por segmento (público en transición).** En el sector público la compra migra de los **DAEM municipales** a los **Servicios Locales de Educación Pública (SLEP, Ley 21.040)**: ~70 SLEP proyectados, **36 operando a ene-2026** (plazo máximo extendido a **2035**, Ley 21.819); el **Director Ejecutivo del SLEP** es el nuevo sostenedor/comprador y los directores conservan autoridad operativa delegada. **El mercado público está dividido durante el rollout (mezcla DAEM/SLEP)** — tenlo en cuenta en el GTM. Particular subvencionado y particular pagado deciden por su propio sostenedor/dirección. Fuente: educacionpublica.gob.cl; Ley 21.040. `[VERIFICAR: rangos de presupuesto / willingness-to-pay y conteo de colegios-docentes por segmento — aún abierto]`.

# CAJA DE HERRAMIENTAS DE IA 2026 (mapea cada producto a estas técnicas)
Usa esto como vocabulario de arquitectura. Para cada producto, justifica qué técnicas usa y por qué.
- **Agentes con herramientas + workflows:** cuando el sistema debe *actuar* (abrir tickets, llenar formularios, consultar/actualizar sistemas). Requiere permisos, idempotencia, revisión humana, trazas.
- **Salidas estructuradas (structured outputs / JSON Schema):** mejor relación impacto/esfuerzo. Para integrar con sistemas del Estado/ERP/CRM y garantizar contratos de datos.
- **Document Intelligence multimodal (OCR + layout + extracción):** cuando el cuello de botella son PDFs/formularios/expedientes/contratos. Separa lo determinista (extracción) de lo probabilístico (interpretación).
- **Capa semántica / NL2SQL gobernado:** preguntas en lenguaje natural sobre datos tabulares/estructurados con gobernanza y trazabilidad.
- **Knowledge graphs:** razonamiento multi-hop sobre normativa/relaciones/entidades (ej. normativa DOM, fraude, due diligence).
- **Prompt/context caching + memoria persistente:** abaratar contexto grande repetido; agentes de larga duración.
- **Destilación + routing/cascadas de modelos:** economía a volumen (alto throughput, latencia, costo por tarea).
- **Evals + observabilidad + guardrails (+ verificación):** obligatorio en GovTech para confianza, auditabilidad, anti prompt-injection, y cumplimiento de las Bases Tipo éticas [A9].

# FASE 0 — CALIBRACIÓN (hazme estas preguntas y ESPERA mis respuestas)
Pregúntame y no avances sin respuesta:
1. Equipo: ¿cuántas personas y qué skills (ML, backend, frontend, ventas, dominio)?
2. Horizonte: ¿deadline de la competencia objetivo y cuántas semanas hasta el demo?
3. Competencia objetivo principal: ¿Start-Up Chile / Brain Chile / Impacta GovTech / Desafíos Públicos / otra?
4. Recursos: ¿presupuesto para infra/APIs? ¿acceso a datos o contactos en algún organismo/empresa?
5. Apetito: ¿prefieres GovTech puro, o un portafolio gov + un hedge privado?
6. Riesgo regulatorio: ¿dispuestos a operar con datos sensibles (salud, identidad) o prefieres dominios de menor riesgo?
7. Objetivo real: ¿solo ganar la competencia, o construir empresa con venta al Estado/empresas después?
Si dejo algo en blanco, propón un default razonable y márcalo como supuesto.

# FASE 1 — MAPA DE OPORTUNIDADES E IDEACIÓN
Genera **6–8 conceptos** candidatos (mayoría GovTech, 1–2 privados). Para cada uno, una ficha:
- **Nombre tentativo** (en español, memorable).
- **Dolor + evidencia:** problema concreto y su anclaje [A#] o `[VERIFICAR]`.
- **Usuario y comprador:** quién lo usa vs quién paga (en gov suelen diferir).
- **Stack de técnicas 2026:** qué técnicas y por qué.
- **Por qué ahora (why-now):** la ventana regulatoria/de mercado que lo hace posible hoy [A#].
- **Foso defensivo:** datos propietarios / integración / dominio / distribución. Sé escéptico.
- **Cuña (wedge):** el primer caso de uso angosto y monetizable.
- **Riesgo principal** y cómo se mitiga.
Termina con una tabla resumen y espera mi feedback antes de puntuar.

# FASE 2 — PUNTUACIÓN Y SELECCIÓN
Construye una rúbrica alineada a los criterios de jurado [A17] (1–5 cada eje, con peso):
Innovación tecnológica · Escalabilidad · Defensibilidad/foso · Oportunidad de mercado (Chile + expansión) · Impacto · Factibilidad de MVP (equipo/tiempo) · Camino de venta (CPI/Convenio Marco/privado) · Riesgo regulatorio (invertido: menor=mejor).
- Puntúa cada concepto, muestra la tabla, y **recomienda 2–3** con justificación.
- Da la **lógica de portafolio**: por qué ese conjunto (ej. 1 GovTech ancla de alto impacto + 1 GovTech de bajo riesgo/rápido + 1 hedge privado escalable).
- Espera mi aprobación de la selección final.

# FASE 3 — ESPECIFICACIÓN DE BUILD (por cada producto seleccionado)
Entrega un documento técnico-producto:
1. **Problema cuantificado** (con [A#]).
2. **Solución** en 3 frases + recorrido de usuario (happy path).
3. **Arquitectura** (diagrama `mermaid`) mapeada explícitamente a la caja de herramientas 2026; marca qué es determinista vs probabilístico.
4. **Datos y foso:** fuentes de datos, cómo se obtienen legalmente, y por qué el dato/integración crea ventaja acumulativa.
5. **Alcance del MVP:** lista clara de qué ENTRA y qué NO entra; construible en 6–10 semanas por el equipo de Fase 0.
6. **Evals, guardrails y cumplimiento:** plan de evaluación, observabilidad, anti prompt-injection, revisión humana; mapeo a clase de riesgo de la ley de IA [A12], a las Bases Tipo éticas [A9] y a protección de datos [A13].
7. **Modelo de costos:** por página/token/mensaje según técnica; estima costo unitario y márgenes.
8. **Roadmap:** MVP → piloto (idealmente con un organismo vía CPI [A6/A7] o un cliente privado) → escala.
9. **Equipo y roles** + decisiones build-vs-buy.

# FASE 4 — PAQUETE DE PITCH (por cada producto seleccionado)
Genera, en español de Chile, listo para jurado:
1. **One-liner** (X para Y que hace Z).
2. **Problema** con dato de impacto [A#].
3. **Mercado:** TAM/SAM/SOM Chile *bottom-up* (nº de organismos/empresas × ticket); supuestos explícitos y `[VERIFICAR]` donde corresponda.
4. **Producto/demo:** qué se muestra en vivo (guion de demo de 2–3 min).
5. **Modelo de negocio y pricing** (SaaS, por uso, por organismo, licencia).
6. **Go-to-market y camino de venta:** ruta concreta de compra pública (Compra Ágil/Convenio Marco/Contratos para la Innovación/Diálogos Competitivos [A5–A10]) y/o privado; primer piloto objetivo.
7. **Plan de tracción/validación:** qué evidencia conseguir antes/durante la competencia (cartas de interés, piloto, usuarios).
8. **Competencia y foso** (matriz vs alternativas, incl. status quo manual).
9. **Ask y uso de fondos** (encaja con premios reales [A14/A16] o ronda).
10. **Equipo** (por qué este equipo).
11. **Estructura de slides** (slide por slide) afinada a la rúbrica de la competencia objetivo de Fase 0.
12. **Riesgos y mitigaciones** + 3 preguntas difíciles de jurado con sus respuestas.

# FORMATO Y ESTILO
- Entregables de cara a jurado/usuario en **español de Chile**, concretos, sin relleno.
- Usa tablas y diagramas `mermaid` cuando aporten.
- Marca SIEMPRE supuestos y datos no verificados con `[VERIFICAR: ...]`.
- Referencia anclajes con [A#].

# ARRANQUE
Empieza ahora SOLO con la Fase 0: hazme las preguntas de calibración y espera mis respuestas. No avances a la Fase 1 hasta que yo responda.

===== FIN DEL PROMPT =====
```

---

## Caveats de la investigación (para ti, fuera del prompt)

Estos puntos vienen de la verificación adversarial del informe de investigación. Tenlos presentes:

- **Re-verifica lo sensible al tiempo** antes de citarlo en un pitch real: montos/fechas/bases de competencias (son por ciclo); la nomenclatura de licitaciones (cambió el 23-oct-2025); el estado del proyecto de ley de IA (en el Senado en feb-2026, no promulgado); la vigencia de la Ley 21.719 (1-dic-2026, regulación secundaria de la APDP aún pendiente); y la nueva fecha de Open Finance (postergada a jul-2027).
- **No uses estas afirmaciones (REFUTADAS en verificación):**
  - GovTech: que la Política CPI fue creada por el "DS-53 del 30-dic-2024"; y que las Bases Tipo de IA fueron "la primera regulación de su tipo en LatAm / con siete algoritmos de cuatro organismos".
  - Minería: "solo ~25% de los proyectos de IA logran integración completa" y "~60% de las grandes mineras ya tienen proyectos de IA" (ambas refutadas 0-3; la brecha piloto-a-producción puede ser real pero no hay fuente citable aquí).
  - Fintech: "la Ley Fintech regula 7 categorías", "42 entidades registradas / 37 autorizaciones", y "NCG 514 vigente desde el 3-jul-2026 con rollout de 5 años" (todas refutadas).
  - Educación: el ratio "60/40", el "40% de horas no lectivas reservado a preparación", y las cifras de TALIS OCDE "73% del tiempo en docencia / 11% en tareas administrativas" y "25% estrés por falta de tiempo de preparación" (todas refutadas). El ratio correcto es **65/35** [E1]; el dolor cuantificado válido es el 33% de estrés administrativo [E4].
  - Educación (4ª pasada): que los servicios SEP deban contratarse vía **Registro ATE** (refutado); que la guía de IA del MINEDUC sea **silente** en protección de datos/menores (refutado — sí aborda ética/privacidad); y no sobre-generalices que los incumbentes "no pueden" hacer Decreto 83/PME (Lirmi y KIMCHE sí tocan Decreto 83) — el ángulo válido es que la *generación/consolidación regulada* no es su core.
- **Cuidado con las cifras de listas de espera:** el stock (~2,13M) es sólido; las "reducciones" interanuales del gobierno son metodológicamente cuestionadas. Construye la tesis sobre la *magnitud*, no sobre las bajas.
- **Cifras de empresas con cautela (auto-reportadas):** el ahorro de €200M de Santander [A25], el conteo de 485+ fintech [A26] y la reducción 15–40% del SEA [A19] vienen de fuentes corporativas/gremiales/PR — úsalas como indicadores de apetito/TAM, no como datos auditados.
- **URLs muertas al verificar:** algunas URLs primarias daban 404 (GobLab "ethical-algorithms", la página MinCiencia del proyecto de ley, la landing de GobLab). Los hechos se reconfirmaron por otras fuentes .cl; reemplaza los links muertos por los vivos antes de usarlos.
- **Vacíos que AÚN quedan** (no investigados; trátalos como hipótesis): verticales privados de retail, salmón/acuicultura, agro/vino, logística/puertos, siniestros en seguros y legaltech; los sistemas GovTech ClaveÚnica, ChileAtiende, SII, Registro Civil, Poder Judicial, Dirección del Trabajo; y la interacción precisa entre la Ley 21.719 y el proyecto de ley de IA.
- **Vacíos de Educación — ya cerrados (4ª pasada):** datos de menores bajo Ley 21.719 [E15], comprador por segmento/SLEP [E17], reglas de fondos SEP para software [E14], y gaps de Napsis/Lirmi [E13].
- **Vacíos de Educación — que SIGUEN abiertos** (marcados `[VERIFICAR]` en el prompt): (1) una cifra defendible de **horas/semana totales** de carga administrativa docente — NO se encontró estudio chileno verificable (el `[E2]` es tiempo *asignado*, no *gastado*); sin esto, el pitch de ahorro de tiempo carece de número base; (2) **rangos de presupuesto / willingness-to-pay y conteo de colegios-docentes por segmento**; (3) **feature-gaps de Colegium, Webclass, KIMCHE y SIGE** (no verificados); (4) la regulación operativa que dicte la APDP antes del 1-dic-2026 (mecánica de consentimiento parental, verificación de edad, división responsable/encargado entre sostenedor y proveedor).

## Sugerencia de siguiente paso
El knowledge pack cubre GovTech + Ley 21.719 + minería/permisología + banca/fintech + **Educación (el vertical más profundo)**. Cuando quieras, puedo:
- **(a)** **Correr el prompt yo mismo** ahora (respondiendo la Fase 0 con supuestos razonables, sesgado a Educación) para que veas el output completo de las 4 fases; o
- **(b)** **Cerrar los vacíos de Educación** con una investigación corta y enfocada (datos de menores bajo Ley 21.719, comprador/presupuesto por segmento, uso de fondos SEP, gaps de incumbentes) para dejar el vertical listo para pitch; o
- **(c)** **Investigar otros verticales privados** que faltan (retail, salmón, agro/vino, logística, seguros, legaltech).
