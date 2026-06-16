# Handoff de diseño · Faro

Sistema de diseño visual para **Faro**, el copiloto de planificación y cumplimiento docente (K-12 Chile). Este paquete contiene todo lo necesario para replicar el diseño **exactamente** en tu frontend.

---

## 1. Qué es este paquete

- **`styles.css`** — La hoja de estilos completa, **CSS puro, sin dependencias externas** (sin frameworks, sin CDN, sin Google Fonts; usa la pila de fuentes del sistema). Es la **fuente de verdad** del diseño y está fuertemente comentada en español.
- **`index.html`** — Índice navegable de las 7 pantallas.
- **`screens/*.html`** — Las 7 pantallas de referencia, HTML estático con **clases semánticas** (sin estilos inline). Enlazan a `../styles.css`.

### Cómo usar este handoff

Las pantallas HTML son **referencias de diseño de alta fidelidad** (hi-fi): reflejan colores, tipografía, espaciado e interacciones finales. No son necesariamente el código a enviar a producción tal cual.

Tienes **dos caminos**, según tu stack:

1. **Stack con HTML/CSS clásico o web components** → puedes usar `styles.css` directamente. Las clases son estables y semánticas (BEM-ish). Solo replica el marcado con las mismas clases.
2. **React / Vue / Svelte / Tailwind / CSS-in-JS / etc.** → recrea el diseño en tu entorno existente usando estos valores como especificación exacta. Los **design tokens** (sección 4) y las **specs de componentes** (sección 6) te dan todo: hex, tamaños, radios, sombras, estados.

> Todo el texto visible está en **español de Chile** y no debe traducirse.

---

## 2. Concepto de marca

**"Un faro que guía al docente en la noche."** La interfaz de gestión es sobria y profesional (lo infantil vive *dentro* de los documentos que Faro genera, no aquí). La paleta nace de esa metáfora:

| Color | Metáfora | Rol semántico |
|---|---|---|
| **Índigo** | El cielo nocturno | Marca, títulos, acción principal |
| **Oro** | El haz de luz del faro | Borrador / aviso / "marca", la baliza del logo |
| **Turquesa** | El mar en calma | En revisión / información / progreso |
| **Coral** | La tierra cálida chilena | Peligro / rechazo / acento humano |
| **Verde** | (funcional) | Éxito / aprobado / descargar |

Sobre todo ello, un fondo de **papel cálido** (neutros tono arena) que da calidez sin restar seriedad.

---

## 3. Principios

- **Accesibilidad WCAG AA**: contraste ≥ 4.5:1 en texto normal, ≥ 3:1 en texto grande. Todos los tokens de texto sobre fondo están verificados.
- **Foco siempre visible** (`:focus-visible`) con anillo índigo + halo.
- **Área de toque ≥ 44px** en todos los botones y controles.
- **Responsive**: pensado primero para laptop escolar (~13"–15"), adaptado a tablet (768px) y móvil (480px).
- **Color con significado, no decoración vacía**: cada color de estado tiene un rol fijo; los badges llevan además un punto indicador para no depender solo del color.

---

## 4. Design tokens

Todos definidos en `:root` dentro de `styles.css`. Valores hex finales resueltos:

### Paleta de marca

```
/* Índigo — marca */
--brand-indigo        #1A237E   /* principal */
--brand-indigo-deep   #11164F   /* hover / texto activo */
--brand-indigo-soft   #E7E9F6   /* tinte: resaltados, foco, chips */
--brand-indigo-tint   #F1F2FB   /* tinte casi blanco: filas activas */

/* Oro — haz del faro */
--brand-gold          #E6A02E   /* acento / baliza */
--brand-gold-deep     #875312   /* texto AA sobre fondo claro */
--brand-gold-soft     #FBEED1   /* fondo suave */
--brand-gold-border   #EBCD83

/* Turquesa — mar */
--brand-teal          #138A8F   /* acento / secundario */
--brand-teal-deep     #0A5E62   /* texto AA */
--brand-teal-soft     #D7EFEF
--brand-teal-border   #A3DADC

/* Coral — tierra */
--brand-coral         #E0584A   /* acento + peligro */
--brand-coral-deep    #B3392C   /* texto AA */
--brand-coral-soft    #FCE6E2
--brand-coral-border  #F3BCB2

/* Verde — éxito (único color funcional fuera de la paleta de 4) */
--brand-green         #1F8A4C
--brand-green-deep    #15693A
--brand-green-soft    #E3F6EA
--brand-green-border  #A6E0BB
```

### Neutros (papel cálido)

```
--color-bg            #FAF7F1   /* fondo de página */
--color-card          #FFFFFF   /* tarjetas (flotan sobre el papel) */
--color-surface       #F4EFE5   /* superficie secundaria (paneles, jobs) */
--color-surface-2     #ECE6D9   /* superficie marcada (botón disabled) */
--color-border        #E7DED0   /* borde estándar */
--color-border-strong #D7CCB7   /* borde de campos / hover */
--color-text          #221D14   /* texto principal (~15:1) */
--color-text-muted    #6B6051   /* texto secundario (~5.7:1, AA) */
```

### Mapeo semántico

Los estados reutilizan la paleta de marca (esto es clave para la cohesión):

```
éxito / aprobado / descargar  → verde
peligro / rechazado / bloquea → coral
aviso / borrador / "marca"    → oro    (texto = --brand-gold-deep)
info / en revisión            → turquesa (texto = --brand-teal-deep)
```

### Tipografía

```
--font-body   "Segoe UI", system-ui, -apple-system, "Helvetica Neue", "Noto Sans", Arial, sans-serif
--font-mono   ui-monospace, "SFMono-Regular", "Cascadia Code", Consolas, "Liberation Mono", monospace

--font-size-base  16px
--font-size-sm    14px
--font-size-xs    12.5px

Cuerpo:    line-height 1.6
Títulos:   font-weight 700 · line-height 1.25 · letter-spacing -0.01em
```

> **Importante**: no se usa ninguna fuente de red. Si tu app ya tiene una fuente humanista (p. ej. una con métricas similares), puedes sustituir `--font-body`, pero mantén `system-ui` como fallback.

### Espaciado · Radios · Sombras

```
/* Espaciado */
--space-xs 4px · --space-sm 8px · --space-md 16px · --space-lg 24px · --space-xl 32px · --space-2xl 48px

/* Radios */
--radius-sm 6px · --radius-md 9px · --radius-lg 14px · --radius-pill 999px

/* Sombras (cálidas) */
--shadow-sm    0 1px 2px rgba(48,38,20,.06)
--shadow-card  0 1px 2px rgba(48,38,20,.05), 0 8px 20px -12px rgba(48,38,20,.16)
--shadow-pop   0 6px 24px -8px rgba(48,38,20,.18)

/* Foco accesible */
--focus-ring   0 0 0 3px var(--color-bg), 0 0 0 5.5px var(--color-brand)
```

---

## 5. Firmas de marca (detalles decorativos)

Cuatro recursos dan identidad sin recargar. Replícalos:

1. **Franja superior** — barra fija de 4px en el borde superior del viewport, con degradado horizontal índigo → turquesa (42%) → oro (74%) → coral. Es `body::before` (`position: fixed; inset: 0 0 auto 0; z-index: 1000`).
2. **Baliza del título** — antes de cada `.faro-title` (H1) hay un **diamante dorado** (cuadrado de `0.66em` rotado 45°, `border-radius: 4px`, relleno radial `#f7cf76`→`--brand-gold`) con **doble resplandor**: `box-shadow: 0 0 0 4px var(--brand-gold-soft), 0 0 0 5.5px rgba(indigo 22%), 0 3px 8px -2px rgba(gold 55%)`. Es el "faro". Aparece en todas las pantallas.
3. **Subrayado de resultados** — `.faro-result-heading` lleva un `::after` de 2px con degradado índigo → turquesa (la "línea de costa").
4. **Índice como carta de color** — en `index.html` cada `.nav-list__item` tiene una banda lateral izquierda de 4px que **rota** por los cuatro colores (`:nth-child(4n+1..4)` → índigo, turquesa, oro, coral).

El fondo del `body` además lleva dos halos radiales muy tenues (oro arriba-izq, turquesa arriba-der) — el resplandor del faro sobre el papel.

---

## 6. Componentes (vocabulario de clases)

Cada pantalla usa estas clases. Las specs clave; el detalle exacto está comentado en `styles.css`.

### Layout
- **`.faro-page`** — wrapper: `max-width: 940px`, centrado, `padding: 48px 24px`.
- **`.faro-header`** — cabecera; `position: relative`, con el `::after` degradado (firma #1).
- **`.faro-title`** (H1) — `display:flex; gap:.62em`, color índigo, `clamp(1.7rem, 1.3rem + 1.8vw, 2.3rem)`, con la baliza dorada (firma #2).
- **`.faro-subtitle`** — texto muted, `max-width: 65ch`.
- **`.faro-result-heading`** (H2) — color índigo, con subrayado degradado (firma #3).

### Tarjetas
- **`.faro-card`** — `background: #fff`, `border: 1px var(--color-border)`, `border-radius: 14px`, `padding: 24px`, `box-shadow: var(--shadow-card)`. Ritmo vertical interno con `> * + * { margin-top: 16px }`.
- **`.faro-card--surface`** — fondo arena `--color-surface`, sin sombra.
- **`.faro-card--ok`** / **`.faro-card--error`** — barra lateral izquierda de 5px (verde / coral) vía `::before`, `padding-left` extra.

### Badges (`.badge` + modificador)
Píldora: `display:inline-flex; gap:6px; padding:3px 10px; border-radius:999px; border:1px; font-size:12.5px; font-weight:600`. Lleva un **punto** de `6px` (`::before`) del color actual.

| Clase | Fondo | Texto | Borde |
|---|---|---|---|
| `--draft` (Borrador) | gold-soft | gold-deep | gold-border |
| `--review` (En revisión) | teal-soft | teal-deep | teal-border |
| `--approved` / `--ok` | green-soft | green-deep | green-border |
| `--rejected` | coral-soft | coral-deep | coral-border |
| `--mode` (demo/live) | indigo-soft | indigo | indigo 22% |
| `--inline` | — (compacto, sin punto, baseline) | | |

### Botones (`.btn` + modificador)
Base: `display:inline-flex; min-height:44px; padding:10px 20px; border-radius:9px; font-weight:600; font-size:14px`. Transición 0.15s; `:active` baja 1px. `:disabled`/`.btn--disabled` → fondo `--color-surface-2`, texto muted, `cursor:not-allowed`.

| Clase | Relleno | Texto | Hover |
|---|---|---|---|
| `--primary` | índigo | #fff | índigo-deep |
| `--secondary` | #fff, borde `--color-border-strong` | índigo | borde índigo + fondo `--brand-indigo-tint` |
| `--success` | verde | #fff | verde-deep |
| `--danger` | #fff, borde coral-border | coral-deep | fondo coral + texto #fff |
| `--mt` | `margin-top: 16px` | | |

### Formularios
- **`.field`** — `display:flex; flex-direction:column; gap:6px`. Variantes `--mt`, `--narrow` (max 340px), `--wide` (max 420px).
- **`.field__label`** — `font-weight:600; font-size:14px`.
- **`.field__control`** — input/select/textarea: `min-height:44px; padding:10px 12px; border:1px var(--color-border-strong); border-radius:9px; box-shadow: inset 0 1px 2px rgba(...)`. Hover → borde índigo. **Foco** → `border-color: índigo; box-shadow: 0 0 0 3px var(--brand-indigo-soft)`. `textarea` `min-height:96px; resize:vertical`. `select` con caret dibujado por gradientes (sin imagen).
- **`.field__hint`** — texto xs muted.

### Selector de OA
- **`.oa-section-label`** — encabezado del bloque.
- **`.oa-list`** — `max-height:240px; overflow-y:auto; background:--color-surface; border:1px; border-radius:9px; padding:4px`.
- **`.oa-item`** — fila clicable (`<label>`): `display:flex; gap:8px; padding:10px 12px; border-radius:6px`. Hover → fondo blanco; `:focus-within` → halo. **Seleccionado** (`:has(input:checked)`) → fondo `--brand-indigo-tint` y código en índigo. Checkbox `18px`, `accent-color: índigo`.

### Validación (Gates)
- **`.gate`** — `background:--color-surface; border:1px; border-radius:9px; padding:8px 16px`. `--ok` → borde-izq 3px verde; `--block` → borde-izq 3px coral + fondo coral-soft.
- **`.gate__title`** — `font-weight:600; font-size:14px`. **`.gate__title-note`** — "sin observaciones" en verde-deep.
- **`.gate__finding`** — `display:flex; align-items:baseline; gap:4px; font-size:14px`.
- **`.sev`** — píldora de severidad: `font-size:11px; font-weight:700; text-transform:uppercase`. `--block` (coral) / `--warn` (oro).
- **`.gates-desc`** — descripción muted.

### Paneles de generación (`<fieldset class="gen-panel">`)
- **`.gen-panel`** — `border:1px var(--color-border-strong); border-radius:14px; padding:24px; background:#fff; box-shadow:var(--shadow-sm)`.
- **`.gen-panel legend`** — `display:flex; gap:.5em; font-weight:700; color:índigo`, con un **diamante índigo** de 8px (`::before`).
- **`.gen-panel__controls`** — `display:flex; gap:16px; flex-wrap:wrap; align-items:flex-end`. Los `.field` hijos: `flex:1; min-width:180px`.
- **`.gen-panel--mt`** — margen superior.

> **Estados de los paneles** (idle · generando · segundo_plano · listo · error): ver sección 7.

### Notas / alertas (`.note` + modificador)
`padding:12px 16px; border-radius:9px; border:1px; border-left-width:4px; font-size:14px`.
- **`--info`** → fondo teal-soft, barra teal, texto teal-deep.
- **`--success`** → fondo green-soft, barra verde, texto green-deep, `font-weight:600`.
- **`--error`** → fondo gold-soft, barra oro, texto gold-deep, `font-weight:600` (es un aviso, no un error rojo).

### Lista de documentos (HIL)
- **`.doc-list`** — `<ul>` sin viñetas, `border:1px; border-radius:9px; overflow:hidden`.
- **`.doc-row`** — `display:flex; align-items:center; gap:16px; padding:8px 16px; border-top:1px`. Hover → fondo surface.
- **`.doc-row__label`** — `flex:1; font-weight:600`.
- **`.doc-row__date`** — xs muted, `font-variant-numeric: tabular-nums`.
- El `.btn` dentro de la fila es compacto (`min-height:38px`).

### Job status (Producción)
- **`.job-card`** — `display:flex; gap:8px; border:1px; border-left:4px índigo; border-radius:9px; padding:16px; background:--color-surface; font-weight:600`.
- **`.job-card__id`** — chip monoespaciado: `background:#fff; border:1px; color:índigo-deep; padding:2px 8px; border-radius:6px`.

### Indicadores editables
- **`.indicadores-list`** — `flex column; gap:8px`.
- **`.indicador-row`** — `flex; gap:16px; align-items:center`.
- **`.indicador-row__oa`** — chip del código OA: `min-width:104px; font-weight:600; color:índigo; background:--brand-indigo-soft; border-radius:6px; padding:8px 10px; text-align:center; tabular-nums`.

### Acciones HIL
- **`.hil-actions`** — `flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:16px`.
- **`.hil-actions__email`** — input `flex:1; min-width:220px; max-width:280px`.

### Contenido de resultados
- **`.clase-item`** — bloque de clase: `border-top:1px; padding-top:16px` (el primero sin borde). **`.clase-item__title`** índigo `font-weight:700`; **`__duration`** muted normal; **`__moment`** (Inicio/Desarrollo/Cierre) `font-weight:700`.
- **`.prueba-item`** — ítem de prueba; **`__meta`** (OA·pts) como chip pequeño muted. Alternativas en `<ul>` sin viñetas como filas; **`.prueba-alternativa--correcta`** → fondo green-soft, borde green-border, texto green-deep.
- **`.deck-slides`** — `<ul>` con **numeración propia** (`counter`): cada `li` es una fila tarjeta con un círculo índigo numerado (`::before`); el `<em>` del momento va en mayúsculas muted.

### Utilidades
`.text-muted` · `.text-sm` (14px) · `.text-xs` (12.5px) · `.section-title` (H3, `margin-top:0`, 1.18rem) · `.divider` (línea + margen) · `.download-row` (flex gap wrap) · `.form-hint` · `.establecimiento-note` (chip surface inline) · `.hil-warning-list` (bloque oro con barra) / `.hil-warning-item` · `.result-intro` (la palabra "borrador" va en oro).

---

## 7. Interacciones y estados

### Estados de los paneles de generación
El mismo `.gen-panel` cambia su contenido interno según el estado (el markup de cada uno está en los comentarios HTML de `screens/05-planificacion-revision.html`):

| Estado | Contenido | Prioridad visual |
|---|---|---|
| `idle` | `<button class="btn btn--primary">Generar X (borrador)</button>` | Invitación a actuar |
| `generando` | `<p class="text-muted">Generando… (corre en el worker)</p>` | Progreso (puede durar minutos) |
| `segundo_plano` | aviso + `<button class="btn btn--secondary">Comprobar de nuevo</button>` | No es error; sigue en curso |
| `listo` | `<div class="note note--success">…</div>` + `.download-row` con enlaces | Completitud |
| `error` | `<div class="note note--error">…</div>` + botón reintentar | Error accionable |

### Estados del job (Producción)
`pendiente` → "En cola… ⏳" · `en_proceso` → "Generando… ⏳" · `hecho` → "Listo ✅" · `fallido` → "Falló ⛔" (+ `.note--error`).

### Flujo HIL (revisión)
- Estado `borrador`: solo botón **"Enviar a revisión"** (primary).
- Estado `en_revision`: campo email del revisor + **Aprobar** (success) + **Rechazar** (danger). Si el email está vacío → **Aprobar** queda `.btn--disabled` (ningún documento se aprueba sin revisor identificado).
- Estado `aprobado`/`rechazado`: solo lectura, con nota del revisor.

### Estados interactivos genéricos
- **Hover**: botones oscurecen/rellenan; enlaces pasan a turquesa-deep; filas (oa-item, doc-row, nav-item) resaltan.
- **Focus** (`:focus-visible`): anillo índigo + halo en todo control. Los `.field__control` usan borde índigo + halo `--brand-indigo-soft`.
- **Disabled**: fondo apagado `--color-surface-2`, sin puntero.

### Responsive
- **`@media (max-width: 768px)`** (tablet): menos padding exterior; tarjetas y paneles a `padding:16px`.
- **`@media (max-width: 480px)`** (móvil): `--font-size-base: 15.5px`; `.doc-row` envuelve a 2 niveles; `.indicador-row` apila (código OA arriba); `.hil-actions` y `.download-row` apilan; botones a ancho completo (excepto "Abrir" en filas); controles de panel a 100%.

### Preferencias del usuario
- **`@media (prefers-reduced-motion: reduce)`**: anula transiciones/animaciones.
- **`@media print`**: quita fondos/sombras y oculta `.btn` (las planificaciones se imprimen a menudo).

---

## 8. Accesibilidad — checklist a conservar

- [ ] Contraste de texto ≥ 4.5:1 (los tokens `-deep` y `--color-text-muted` ya cumplen; no uses los tonos base de marca como texto sobre blanco).
- [ ] `:focus-visible` visible en **todos** los controles (botones, enlaces, inputs, selects, checkboxes, filas-label).
- [ ] Botones/controles con altura ≥ 44px.
- [ ] El color **nunca** es el único indicador de estado: badges con punto, gates con icono+barra, severidades con etiqueta de texto.
- [ ] Textos secundarios nunca por debajo de 12.5px.
- [ ] Respeta `prefers-reduced-motion`.

---

## 9. Assets

**Ninguno externo.** No hay imágenes, iconos de red ni fuentes descargadas. Los "iconos" son:
- Emojis Unicode dentro del contenido HTML (✅ ⛔ ⏳ ↓ ▶ ✔) — pertenecen al texto, no al CSS.
- Figuras geométricas dibujadas con CSS (la baliza-diamante, los puntos de badge, el caret del `select`, los círculos numerados del deck) — todas con formas simples (cuadrados rotados, círculos, gradientes). Sin SVG complejos.

Si tu stack usa una librería de iconos, puedes sustituir los emojis por iconos equivalentes manteniendo el color semántico correspondiente.

---

## 10. Archivos de este paquete

```
design_handoff_faro/
├── README.md          ← este documento (especificación auto-suficiente)
├── styles.css         ← hoja de estilos completa y comentada (fuente de verdad)
├── index.html         ← índice de las 7 pantallas
└── screens/
    ├── 01-home.html               Home / landing
    ├── 02-cascada-aula.html       Cascada de Aula (demo completa: gates, unidad, clases, prueba, deck)
    ├── 03-planificacion-form.html Formulario de planificación (paso 1)
    ├── 04-planificacion-generando.html  Estado "generando"
    ├── 05-planificacion-revision.html   Revisión HIL + 3 paneles de generación (todos los estados comentados)
    ├── 06-revision-hil.html       Superficie global de revisión (lista + detalle + gates + acciones)
    └── 07-produccion.html         Producción asíncrona (job-status + borradores)
```

Abre `index.html` en un navegador (sin build) para ver el diseño en vivo.
