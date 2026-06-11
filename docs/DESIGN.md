# Alma Movement Design Context

Dirección (confirmada por la dueña, 2026-06-09): **lujo cálido terroso estilo Frame Pilates Lab** — editorial, monocromático cálido estricto, serif protagonista, fotografía full-bleed, mucha calma y restraint. El lujo viene de la restricción, el serif y la fotografía, no de un color de acento brillante. **El vino/berry #76214D está descartado definitivamente** (era la dirección Femmé). La paleta canónica es el brand kit greige oficial + espresso.

## Palette (canónica — única fuente de verdad)

Estrategia: **Restrained estricto** con momentos **drenched** espresso como firma (paquetes, footer, pase de wallet). Implementada en `tailwind.config.ts` (`alma.*`), `src/components/app/tokens.ts` (`ALMA`) y las vars shadcn de `src/index.css`. Esos tres puntos DEBEN coincidir; no crear paletas locales por archivo.

| Token | Hex | Rol |
|---|---|---|
| `canvas` / `cream` | `#FAF9F6` | Feather White — fondo principal |
| `mist` | `#F4F1EA` | Porcelain Mist — superficies suaves, cards |
| `oat` / `blush` | `#E6DAC8` | Creamed Oat — bloques tintados, pills activos |
| `sandstone` | `#CBB9A4` | Soft Sandstone — bordes fuertes, detalle |
| `stone` | `#A48D78` | Desert Rock — acento decorativo, SOLO texto grande (≈2.6:1 sobre canvas) |
| `berry` | `#6E5A46` | taupe profundo — acento AA para texto pequeño y fills (≈6.2:1) |
| `ink` | `#43392F` | espresso — texto principal, CTAs sólidos |
| `ink-deep` | `#241B1A` | espresso profundo — secciones drenched |
| `hairline` / `border` | `#E0D5C6` | divisores |
| `olive` | `#5F6B4A` | **SOLO** éxito/confirmación (funcional, nunca decorativo) |
| `destructive` | `#B23A48` | **SOLO** error/destructivo |

Reglas:
- Nunca `#000` ni `#fff` puros (la firma en Responsiva y el QR eran las únicas excepciones; migrar a `canvas`).
- Los CTAs primarios son **ink sólido** con texto canvas (estilo Frame), no stone (falla AA).
- Nada de verdes/amarillos/rojos crudos de Tailwind (`green-500`, `yellow-400`…): éxito = `olive`, error = `destructive`.
- Color-coding decorativo por categoría está prohibido: monocromo + texto.

## Typography

- **Display / titulares**: **Fraunces** variable (optical sizing auto, weight ~500, letter-spacing -0.01em). Es la regla base de `h1-h6`; `.font-display` y `.font-display-italic` para gestos editoriales. Los acentos itálicos de titulares SIEMPRE en Fraunces italic (`.font-display-italic`), nunca itálica sintetizada de una sans.
- **Body / UI**: **Jost** (pesos reales 300–700 + itálica). Alilato ExtraLight quedó como detalle opcional (`.font-alilato`); no usar con `font-bold` ni `italic` (sintetiza).
- Números (precios, cupos, vigencias, rankings) con `tabular-nums` (utilidad `.nums`).
- Contraste de jerarquía ≥1.25 entre pasos; mínimo legible 0.75rem para labels uppercase (nada de 0.55–0.66rem).
- Aliases legacy (`font-bebas`, `font-gulfs` → Fraunces; `font-syne`, `font-dm` → Jost) existen solo por compatibilidad; en código nuevo usar `font-display` / default sans.

## Layout

- Heroes y secciones **image-led full-bleed** con texto serif sobrepuesto (Frame); tratamiento fotográfico unificado `.alma-photo` + `.alma-photo-tint`.
- Asimetría editorial intencional; ritmo de espaciado variable (no padding uniforme).
- Alternar secciones claras (canvas/oat) con secciones **drenched** oscuras (ink-deep).
- Lenguaje de **listas editoriales con hairlines** (ListRow/DataRow) en vez de rejillas de tarjetas; nunca tarjetas anidadas.
- Modal solo para confirmaciones destructivas; flujos y formularios largos son páginas o paneles.

## Components

- CTAs principales: pill ink sólido (texto canvas) o outline hairline; micro-interacción `data-press`.
- Primitivas del app (`AppShell.tsx` / `widgets.tsx`): PageHeader, Section, ListRow, ListGroup, DataRow, Tag, StatusPill, StickyCta, EmptyState, SkeletonRow — extender estas, no inventar paralelas.
- Iconografía: lucide-react, discreta. **Nunca emojis como iconos** (toasts, títulos, botones).
- Fotografía real del estudio como protagonista.
- Targets táctiles ≥44px en la app de clienta.

## Motion (filosofía Emil Kowalski)

- Solo `transform` y `opacity`; ease-out exponencial (`--ease-alma-out`); sin bounce ni elastic.
- Sistema por data-attributes: `data-press`, `data-lift`, `data-stagger`, `data-reveal`, `data-scale-in`, `data-slide-up` — todos cubiertos por `prefers-reduced-motion`.
- Scroll reveals sutiles (fade + translate corto), stagger ligero. Sin glows, sin shimmer, sin animaciones ambientales infinitas.

## Estados (obligatorios en toda pantalla)

- **Loading**: SkeletonRow visible (contraste con la superficie que lo contiene).
- **Empty**: EmptyState con copy de marca y CTA contextual.
- **Error**: toda query maneja `isError` con mensaje honesto + retry. Un fallo de red nunca se disfraza de estado vacío.
- **Confirmación destructiva**: AlertDialog de marca (nunca `window.confirm` / `window.prompt`), proporcional a la consecuencia.
