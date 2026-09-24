# HIVE — Contexto de diseño

Sistema visual de HIVE Pilates Studio (Coyoacán, CDMX). Fuente de verdad en
código: `src/design/tokens.ts`. Diseño completo y razones:
`docs/superpowers/specs/2026-09-24-hive-sistema-visual-design.md`.
Referencia viva en desarrollo: `/sistema`.

## Dirección

Coral Bold: base neutra de concreto, coral `#FA936A` en bloques, negro. Premium
y energética, urbana/industrial; se aparta a propósito de los colores cálidos
asociados a calma. El coral es la única calidez del sistema.

## Color

Tokens por función (canvas, surface, sunken, line, line-strong, ink, ink-muted,
accent, accent-soft, accent-strong, on-accent, success, danger, inverse,
inverse-raised). Valores y contrastes: `src/design/tokens.ts` y su prueba.

Reglas:
1. Nunca texto claro sobre coral: sobre `accent` el texto es `on-accent`.
2. El coral no es texto: número, ícono o enlace coral → `accent-strong`.
3. En el panel, coral = atención (activo, pendiente, lleno), siempre con texto.
4. Nunca coral sobre coral.
5. `success` y `danger` son funcionales, nunca decorativos.
6. Ningún color escrito a mano fuera de `src/design/`.

## Tipografía

Unbounded (600/800) para titulares —los grandes en mayúsculas— y cifras
sueltas; Manrope para todo lo que se lee. Cifras tabulares (`.nums`) en listas
de horas y montos. Mínimo 12 px.

## Piezas

`src/components/app/` (app de clienta) y `src/components/ui/` (shadcn, panel).
Extender estas piezas; no crear paralelas. Botones ≥44 px. `PageHeader` es el
bloque coral firma: uno por pantalla. Botón coral sólo en la app, para la
acción que genera ingreso.

## Logo

`BrandLogo` (`src/components/brand/`) — **provisional**. Un solo color
(`currentColor`). Para reemplazarlo por el oficial: cambiar
`src/assets/brand/hive-mark.svg` y los trazos de `BrandLogo.tsx`, y correr
`npm run brand:assets`.

## Movimiento y estados

Sólo `transform` y `opacity`, salida suave, sin rebotes; respetar
`prefers-reduced-motion`. Toda pantalla maneja cargando, vacío y error; un
fallo de red nunca se disfraza de vacío.
