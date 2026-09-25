# HIVE — Contexto de diseño

Sistema visual de HIVE Pilates Studio (Coyoacán, CDMX). Fuente de verdad en
código: `src/design/tokens.ts`. Diseño completo y razones:
`docs/superpowers/specs/2026-09-24-hive-sistema-visual-design.md` (tokens por
función, tipografía, botones, guardias, logo) y
`docs/superpowers/specs/2026-09-25-hive-app-oscura-design.md` (paleta v2 y app
oscura: valores de color por tema y sus reglas). Referencia viva en
desarrollo, con los dos temas lado a lado: `/sistema`.

## Dirección

Base oscura y cálida (carbón `#141210`) con acento terracota en degradado
(`#CF8A6B` → `#A9603F`) para la app de clienta, el acceso y la 404. El panel,
la landing y las legales siguen en la base clara (Ivory Silk `#F2EFEA`), con
la misma terracota como color de atención, plana y sin resplandor. El coral
`#FA936A` del sistema original desaparece del código. Premium y cálida, sin
perder el carácter urbano/industrial de los grises de concreto; la terracota
es la única calidez del sistema y nunca es la única señal (regla 3).

## Color y temas

Mismos nombres por función en los dos temas (canvas, surface, sunken, line,
line-strong, ink, ink-muted, ink-faint, accent, accent-deep, on-accent,
accent-soft, accent-strong, success, danger, inverse, inverse-raised,
on-inverse, on-inverse-muted); cada uno tiene un valor claro y uno oscuro.
Fuente de verdad: `src/design/tokens.ts` → `LIGHT`, `DARK`, `THEMES`.
Valores y contrastes medidos: la tabla del spec 2026-09-25 §3.1–3.2 y la
prueba de contraste, ampliada a los dos temas.

| Zona | Tema |
|---|---|
| App de clienta (`/app`), acceso (`/auth`), 404 | Oscuro |
| Panel (`/admin`), landing y legales (hasta el sub-proyecto A) | Claro |

El tema lo decide la **ruta**: `themeForPath` (`src/design/theme.ts`) fija
`<html data-theme="dark|light">`, no un contenedor, para que los diálogos,
menús y toasts —que se abren en portales fuera de la pantalla— hereden el
tema. `AppShell`, `AuthShell` y `NotFound` quedan en oscuro; `AdminLayout` en
claro. Un script en `index.html` replica `themeForPath` antes de que cargue
React, para que no parpadee al entrar.

### Por qué el color va en clases, no en variables en línea

jsdom (el entorno de las pruebas) descarta `var(--x)` de los estilos en línea
(`color`, `background`, `border`…), algo comprobado al construir la app
oscura. Si el color de la app viajara en variables dentro de `style={{}}`,
las pruebas perderían de vista los colores. Por eso, en la **zona de la app**
(`src/components/app`, `src/components/auth`, `src/pages/client`,
`src/pages/auth`, `NotFound`) el color va sólo en **clases de Tailwind** que
leen las variables CSS del tema (`bg-surface`, `text-ink-muted`,
`bg-accent-gradient`…); sus pruebas afirman clases, no colores calculados. El
panel (claro) sigue usando `COLOR` (= `LIGHT`, en hex) en sus estilos en
línea: sus pruebas no cambian, sólo sus valores.

Para los pocos casos de la app que sí necesitan un color en línea (anillos
SVG, degradados cónicos) existe `cssColor(token, alfa?)`
(`src/design/tokens.ts`), que devuelve `rgb(var(--c-x) / alfa)` y sigue al
tema igual que las clases — es la única vía de color en línea permitida ahí.

Texto sobre un fondo lleva la clase Tailwind con sufijo `-foreground` (token
`onAccent`/`onInverse`/`onInverseMuted` en `tokens.ts`): sobre `accent` es la
clase `accent-foreground` (`text-accent-foreground`); sobre `inverse`,
`inverse-foreground` (o `inverse-muted` para texto secundario, más tenue).

### Reglas (spec 2026-09-25 §3.3)

1. Nunca texto claro sobre terracota, en ningún tema. Los botones terracota llevan `onAccent`.
2. Terracota como texto: en oscuro sirve `accent` (titulares, cifras clave, lugares disponibles) y `accentStrong` (texto chico sobre tarjetas); en claro sólo `accentStrong`.
3. En el panel, terracota = atención (sección activa, lo pendiente, lo lleno), siempre con texto o número.
4. Degradado y resplandor sólo en la app: botón principal y estados activos usan `linear-gradient(135deg, accent, accentDeep)` con un resplandor suave (`0 0 22px` de `accent` al 30 %); el panel usa terracota plana, sin resplandor.
5. Resplandores del fondo de la app: decoración estática sobre `canvas`, nunca detrás de un bloque de texto con una intensidad que baje el contraste por debajo de lo medido.
6. El coral `#FA936A` desaparece del código; una guardia lo impide.
7. Siguen vigentes: `success`/`danger` sólo para su función, ningún color escrito a mano fuera de `src/design/`, mínimo de 12 px, controles de 44 px.

### Guardias de la zona de la app (`src/design/zoneGuard.ts`)

- Ningún color escrito a mano fuera de `src/design/`: nada de `COLOR`, `resolveTone(`, `TONE_STYLE`.
- Sin color en `style={{}}` (`color`, `background`, `border`, `boxShadow`, `fill`, `stroke`…), salvo `cssColor(`.
- Sin colores fijos que ignoren el tema (`FIJOS`):
  - blanco y negro (`white`, `black`) y la paleta por defecto de Tailwind —`slate`, `gray`, `zinc`, `neutral`, `stone`, `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`, de `-50` a `-950`—;
  - con cualquiera de los prefijos `bg`, `text`, `border`, `ring`, `from`, `to`, `via`, `fill`, `stroke`, `shadow`, `divide`, `outline`, `decoration`, `placeholder` y `caret` (p. ej. `bg-white`, `text-gray-500`, `fill-black`, `shadow-black/10`);
  - y `#fff`/`#000` escritos a mano.
- Sobre terracota sólo va `text-accent-foreground` (regla 1, invertida): toda línea con un relleno terracota (`bg-accent` sin sufijo, `bg-accent-gradient`, `from-accent`; no `bg-accent-soft`) lleva `text-accent-foreground`, o es **decorativa**. Decorativa es la línea que tiene `aria-hidden` o el comentario `/* decorativo */`, que se añade a mano en los puntos y adornos sin texto (p. ej. la rama de una ternaria que pinta un punto, en su propia línea). Caso particular que nunca pasa, ni marcado como decorativo: `text-ink` en la misma línea que el relleno (en oscuro `ink` es claro), así que una ternaria que mezcle la rama terracota con una rama `text-ink` va en líneas separadas.
- **Sólo opacidades que Tailwind genera**: pasos de 5 (`/5`, `/10`, `/15`…) más `/8` — otra cifra no produce CSS y la clase queda sin efecto silenciosamente.
- **Texto de al menos 12 px** (`text-[0.75rem]` es el mínimo; nada por debajo en `text-[…]`).

## Tipografía

Unbounded (600/800) para titulares —los grandes en mayúsculas— y cifras
sueltas; Manrope para todo lo que se lee. Cifras tabulares (`.nums`) en listas
de horas y montos. Mínimo 12 px.

## Piezas

`src/components/app/` (app de clienta) y `src/components/ui/` (shadcn, panel).
Extender estas piezas; no crear paralelas. Botones ≥44 px. `PageHeader` es el
bloque firma de la app: uno por pantalla, sobre el resplandor de fondo, con
`titleAccent` como segunda línea en terracota. Botón principal en degradado
terracota sólo en la app, para la acción que genera ingreso (Reservar,
Comprar, Pagar); en el panel el principal sigue en tinta, sin botón terracota.
`HexPedestal` es el momento de marca de los estados vacío/error, el acceso y
la 404: pedestal y resplandor sólo en oscuro.

## Logo

`BrandLogo` (`src/components/brand/`) — **provisional**. Un solo color
(`currentColor`). Para reemplazarlo por el oficial: cambiar
`src/assets/brand/hive-mark.svg` y los trazos de `BrandLogo.tsx`, y correr
`npm run brand:assets`.

## Movimiento y estados

Sólo `transform` y `opacity`, salida suave, sin rebotes; respetar
`prefers-reduced-motion`. Atributos (`src/index.css`): `data-press`,
`data-reveal`, `data-stagger`, `data-lift`, `data-scale-in`, `data-slide-up`,
`data-fade-in` — el sistema se conserva con nombres neutros (spec §4.7).
Toda pantalla maneja cargando, vacío y error; un fallo de red nunca se
disfraza de vacío.

## Entorno

`npm run brand:assets` y `npm run test:scripts` importan `src/design/tokens.ts`
directamente y necesitan Node ≥ 22.18 (type stripping nativo); el build de
producción (`vite build`) no pasa por ahí y no tiene ese requisito.
