# HIVE · Paleta v2 y app oscura

**Fecha:** 25 sep 2026 · **Estado:** diseño aprobado por secciones, pendiente de revisión escrita
**Rama:** `hive-app` (sale de `hive` @ 1b8f95f)
**Relación con otros documentos:** reemplaza los **valores** de color de `2026-09-24-hive-sistema-visual-design.md` §3.1–3.2 y ajusta sus reglas de color. Todo lo demás de ese documento sigue vigente: tokens por función, tipografía (Unbounded + Manrope), mínimo de 12 px, botones de 44 px, guardias, logo provisional. El panel sigue su propio documento, `2026-09-25-hive-panel-design.md` (rama `hive-panel`); aquí sólo le cambian los valores.

---

## 1. Contexto

El sistema visual de HIVE (sub-proyecto 1) está en producción desde el 24 sep 2026, con una base clara de grises de concreto y un coral brillante (#FA936A). Después llegaron tres insumos del estudio:

- **Su paleta:** Smoked Taupe **#8A7F73** e Ivory Silk **#F2EFEA** (`assets/hive-app/paleta-marca.png`).
- **Referencias de estilo:** tres apps oscuras con un solo acento cálido (`assets/hive-app/ref-*.png`). De ellas se toman: la palabra resaltada en el color de acento, el botón redondo con flecha, la navegación en píldora con la pestaña activa resaltada, cifras grandes, tarjetas translúcidas y resplandores cálidos sobre el negro.
- **La elección del estudio:** la base oscura, con el naranja "más difuminado… creo que se llama terracota".

### Decisiones tomadas

| Tema | Decisión |
|---|---|
| Base de la app de clienta | **Oscura** (carbón cálido) |
| Acento | **Terracota** #CF8A6B → #A9603F, en degradado; desaparece el coral #FA936A |
| Panel | **Claro**, con la paleta nueva (Ivory Silk, taupe, terracota). Conserva la estructura de su propio diseño |
| Cómo cambian los colores | **Por tema**: cada color conserva su nombre por función y tiene un valor claro y uno oscuro |
| Orden | Primero **B** (este documento: paleta v2 + app oscura), después **A** (quitar "Alma" y las fotos) |
| Mockup de referencia | `assets/hive-app/mockup-app-oscura.png` (y su `.html`): las cuatro pantallas reales con el menú real. El mockup está a escala reducida (teléfono de 272 px); en la app los tamaños respetan el mínimo de 12 px y los 44 px |

## 2. Alcance

**Entra:**
- Paleta v2 en los dos temas y la maquinaria para cambiar de tema.
- Todas las pantallas de la app de clienta, el acceso (entrar, registro, recuperar y restablecer contraseña) y la 404, en oscuro.
- Piezas compartidas de la app en oscuro.
- Valores nuevos para el panel (sin rediseñarlo).
- Imágenes generadas (ícono, favicon, logo de correo) con la terracota.
- El texto "Alma" dentro de las pantallas de la app que se rehacen aquí pasa a "HIVE".
- La página `/sistema` con los dos temas.

**No entra (queda para A):**
- La landing y las páginas legales: siguen claras y como están.
- Correos y plantillas de WhatsApp: siguen claros.
- El pase de wallet del servidor.
- Metadatos (título de la página, descripción).
- Fotos.
- Archivos con "alma" en el nombre.
- El texto "Alma" fuera de las pantallas de la app.

**No entra (queda para la sesión del panel):** el rediseño de las pantallas del panel.

## 3. Colores por tema

### 3.1 Tokens

Mismos nombres por función en los dos temas; se agrega `accentDeep` (el final del degradado terracota).

| Token | Oscuro (app, acceso, 404) | Claro (panel; landing y legales hasta A) |
|---|---|---|
| `canvas` | #141210 | #F2EFEA (Ivory Silk) |
| `surface` | #1E1B18 | #FFFFFF |
| `sunken` | #171412 | #E8E3DC |
| `line` | #2E2A26 | #DDD6CD |
| `lineStrong` | #6F665D | #8A7F73 (Smoked Taupe) |
| `ink` | #F2EFEA (Ivory Silk) | #1A1714 |
| `inkMuted` | #A69C91 | #6B6259 |
| `accent` | #CF8A6B | #CF8A6B |
| `accentDeep` | #A9603F | #A9603F |
| `onAccent` | #141210 | #1A1714 |
| `accentSoft` | #3A2A22 | #F3DED3 |
| `accentStrong` | #DDA084 | #9A5236 |
| `success` | #8FCBA8 | #2E6B50 |
| `danger` | #F0A39B | #A3243B |
| `inverse` | #F2EFEA | #1A1714 |
| `inverseRaised` | #FFFFFF | #26221E |
| `onInverse` | #141210 | #F2EFEA |
| `onInverseMuted` | #6B6259 | #A69C91 |

El Smoked Taupe #8A7F73 se usa tal cual como `lineStrong` en claro, y en oscuro para íconos inactivos, líneas decorativas y la barra inferior sin seleccionar (4.77:1 sobre canvas). No alcanza 4.5:1 para texto chico en ningún tema, así que el texto secundario usa `inkMuted`.

### 3.2 Contraste medido

**Oscuro — permitidas:**

| Par | Contraste |
|---|---|
| ink / canvas | 16.29 |
| ink / surface | 14.95 |
| inkMuted / canvas | 6.93 |
| inkMuted / surface | 6.35 |
| accent / canvas (terracota como texto) | 6.67 |
| accentStrong / surface | 7.70 |
| accentStrong / canvas | 8.40 |
| onAccent / accent | 6.67 |
| onAccent / accentDeep | 3.94 (sólo 3:1 para controles) |
| onAccent / mitad del degradado #BC7555 | 5.10 |
| ink / accentSoft | 11.93 |
| accentStrong / accentSoft | 6.15 |
| success / surface | 9.20 |
| danger / surface | 8.50 |
| lineStrong / canvas | 3.32 |
| lineStrong / surface | 3.05 |
| onInverse / inverse | 16.29 |
| taupe #8A7F73 / canvas (íconos) | 4.77 |

**Oscuro — prohibida:**
- ink (claro) sobre accent: 2.44.

**Claro — permitidas:**

| Par | Contraste |
|---|---|
| ink / canvas | 15.56 |
| ink / surface | 17.85 |
| inkMuted / canvas | 5.21 |
| inkMuted / surface | 5.97 |
| inkMuted / sunken | 4.68 |
| accentStrong / canvas | 5.04 |
| accentStrong / surface | 5.78 |
| onAccent / accent | 6.38 |
| ink / accentSoft | 13.77 |
| success / surface | 6.30 |
| danger / surface | 7.31 |
| lineStrong / canvas | 3.41 |
| lineStrong / surface | 3.92 |
| onInverse / inverse | 15.56 |

**Claro — prohibidas:**
- accent como texto sobre canvas: 2.44.
- Texto claro sobre accent: 2.44.
- accentStrong sobre accentSoft: 4.46.

Los pares se verifican con la prueba de contraste existente, ampliada a los dos temas.

### 3.3 Reglas

1. **Nunca texto claro sobre terracota**, en ningún tema. Los botones terracota llevan `onAccent`.
2. **Terracota como texto:**
   - En oscuro, sí: la segunda línea de los titulares, cifras clave y lugares disponibles (`accent` en tamaños grandes, `accentStrong` en texto chico sobre tarjetas).
   - En claro, sólo con `accentStrong`.
3. **En el panel, terracota = atención** (sección activa, lo pendiente, lo lleno), siempre con texto o número, como dice su diseño.
4. **Degradado y resplandor sólo en la app.** Botón principal y estados activos: `linear-gradient(135deg, accent, accentDeep)` con un resplandor suave (`0 0 22px` de `accent` al 30 %). El panel usa terracota plana, sin resplandor.
5. **Resplandores del fondo de la app:**
   - Decoración estática sobre `canvas`: `radial-gradient(110% 55% at 0% 0%, accentDeep 24%, transparent 62%)` y `radial-gradient(80% 40% at 100% 70%, accentDeep 10%, transparent 70%)`.
   - Nunca detrás de un bloque de texto con una intensidad que baje el contraste por debajo del medido.
6. **El coral #FA936A desaparece del código.** Una guardia lo impide.
7. Siguen vigentes, del sistema:
   - `success` y `danger` sólo para su función.
   - Ningún color escrito a mano fuera de `src/design/`.
   - Mínimo de 12 px.
   - Controles de 44 px.

## 4. Temas: qué va oscuro y cómo se cambia

**Oscuro:**
- La app de clienta (`/app/*`).
- El acceso: `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` y `/auth/onboarding` si se enciende.
- La 404.

**Claro:**
- El panel (`/admin/*`).
- La landing y las legales, hasta que A decida.
- Los correos.

- El tema vive en `<html data-theme="dark|light">`, no en un contenedor. Así los diálogos, menús, selects y toasts, que se abren en portales fuera de la pantalla, heredan el tema.
- Cada marco de pantalla fija su tema al montarse: `AppShell`, `AuthShell` y `NotFound` → oscuro; `AdminLayout` → claro. Sin marco, el tema es claro.
- Al cambiar de tema se actualiza también `<meta name="theme-color">`: #141210 en oscuro, #FFFFFF en claro. Así la barra de estado del celular acompaña.
- El `manifest` de la PWA pasa a `theme_color` #141210 y `background_color` #141210: la PWA instalada es la app de clienta.

## 5. Piezas de la app en oscuro

Mismos nombres y props de hoy (sólo se agregan props opcionales). Medidas finales en tamaño real, no las del mockup.

- **Barra superior (`AppShell`):**
  - Símbolo HIVE en `accent`.
  - Campana con contador en degradado y número `onAccent`.
  - Avatar en `inverse` con iniciales `onInverse`.
  - Saludo en rol "label" (12 px, mayúsculas) en `inkMuted`.
- **Barra inferior (`AppShell`, celular):**
  - Las cinco pestañas reales con sus íconos lucide y etiquetas de 12 px: Inicio, Reservar, Mis clases, Wallet, Perfil.
  - La activa: píldora de 44 × 32 px en degradado con el ícono `onAccent` y la etiqueta en `ink` negrita.
  - Las demás en taupe #8A7F73.
  - Fondo `canvas` al 92 % con línea superior `line`.
- **Barra lateral (`AppShell`, escritorio):** fondo `canvas`; ítem activo en `accentSoft` con ícono y texto en `accentStrong`.
- **`PageHeader`:**
  - Sin bloque coral.
  - Etiqueta superior en rol "label" `inkMuted`.
  - Título display-l en mayúsculas `ink`.
  - `titleAccent` como segunda línea en Unbounded 600, sin mayúsculas, en `accent`.
  - Subtítulo en `inkMuted`.
  - Todo sobre el resplandor del fondo.
  - Las acciones y selectores (semana, pestañas) viven dentro del encabezado.
- **Tarjetas** (`ListGroup`, `ActionRow`, tarjetas de pantalla):
  - `surface` al 70 % para que se vea el resplandor, borde 1 px `line`, radio de 18 a 20 px.
  - Sin sombra, salvo lo que flota.
- **`ActionRow`** (tu próxima clase): etiqueta en `accentStrong`, título en Unbounded, datos en `inkMuted`, botón redondo de 44 px en degradado con flecha `onAccent`.
- **Botones:**
  - `PrimaryButton`: en la app, el botón principal es el **degradado terracota** con texto `onAccent` y resplandor (Reservar, Comprar, Pagar). La variante `accent` queda igual que `primary` en oscuro.
  - `GhostButton` / secundario: `surface` al 70 % con borde `lineStrong` y texto `ink`.
  - Destructivo: contorno `danger` con texto `danger` ("Cancelar reserva").
  - Deshabilitado: `sunken` con texto taupe #8A7F73.
  - En el panel, el botón principal sigue en tinta y no hay botón terracota.
- **`SegmentedTabs`** y selectores de semana y día: contenedor en píldora `surface` al 70 % con borde `line`; activo en degradado con texto `onAccent`. En la tira de días, el día con clases lleva un punto `accent`.
- **Pills (`StatusPill`, `Tag`):**
  - Éxito ("Confirmada", "Activa"): `success` sobre `success` al 10 %, con borde al 25 % y punto.
  - Pendiente: `accentSoft` con texto `ink`.
  - Error: `danger` sobre `danger` al 10 %.
  - Disponibilidad: lugares en `accentStrong`; "Últimos N" en `accentSoft`; "Llena" atenuada al 50 %.
- **Campos (`fields.tsx`, shadcn `Input` / `Select`):**
  - Fondo `sunken`, borde 1.5 px `lineStrong`, texto `ink`, marcador de posición en taupe #8A7F73.
  - Foco: contorno 2 px `ink` y halo `accentSoft`.
  - Error: borde y mensaje `danger`.
- **Interruptores:** pista `lineStrong` apagada y degradado encendido; perilla `inverse`.
- **Estados vacío y error:** el hexágono HIVE sobre un pedestal iluminado (resplandor radial `accent` al 38 %, base elíptica con filo `accent`), titular y acción. Error con reintento, como exige el sistema.
- **Toasts, diálogos, menús:** heredan el tema por sus variables: en la app son oscuros con `surface` y borde `line`, y en el panel claros como hoy.

## 6. Pantallas de la app

Cada pantalla conserva **todas** sus funciones, flujos, datos y llamadas actuales. Cambia cómo se ve, siguiendo el mockup. Donde el texto dice "Alma" pasa a "HIVE" (por ejemplo, "TU SEMANA / en HIVE.").

**Activas (diseño propio):**
1. **Inicio (`/app`):**
   - Saludo.
   - Encabezado con la fecha y "TU SEMANA / en HIVE.".
   - Tarjeta de próxima clase (`ActionRow`).
   - Tu próximo logro: anillos en terracota sobre pista `line`.
   - Tu cuenta: membresía con "Activa", plan, clases por usar en cifra grande `accent` y vencimiento. Sin membresía, botón "Comprar" en degradado.
2. **Reservar (`/app/classes`):**
   - "RESERVA TU / próxima clase." con Anterior / Actual / Siguiente en el encabezado.
   - Tira de días.
   - Filas de clase con la hora en Unbounded, clase, coach · duración y disponibilidad.
   - Botón "Reservar" en degradado; "Lista de espera" secundaria si está llena.
   - Día de descanso con el estado vacío del hexágono.
3. **Confirmar clase (`/app/classes/:classId`):**
   - Coach, clase en grande, hora y duración, y el hexágono iluminado.
   - Tarjeta del paquete ("N clases · Activo").
   - Aviso de cancelación con 12 h.
   - `StickyCta` con "Reservar" en degradado.
4. **Mis clases (`/app/bookings`):**
   - "TUS CLASES / en HIVE.".
   - Próximas / Pasadas con contadores.
   - Tarjetas con estado y "Cancelar reserva" destructivo. La penalización por cancelar tarde se avisa antes de confirmar.
   - Pasadas atenuadas.
5. **Wallet (`/app/wallet`):**
   - Pase oscuro con resplandor, logo HIVE (símbolo + "HIVE / PILATES STUDIO") y "● ACTIVO" en `success`.
   - Titular, plan, por usar / vence / puntos (cifras en Unbounded; por usar en `accent`) y próxima clase.
   - QR sobre baldosa `inverse` con margen, para que se lea.
   - Botones oficiales de Apple y Google Wallet sin cambios (permitidos en la guardia).
6. **Checkout (`/app/checkout`):**
   - Planes como tarjetas con el precio en Unbounded; el elegido con borde `accent` y fondo `accentSoft`.
   - Método de pago, resumen y "Pagar" en degradado.
   - Datos de transferencia en `DataRow` con copiar.
7. **Órdenes (`/app/orders`):** lista con estados en pills (§5).
8. **Perfil (`/app/profile`) y sus pantallas:**
   - Perfil: avatar y nombre arriba, `ListGroup` de opciones y "Cerrar sesión" destructivo.
   - Editar perfil: campos oscuros.
   - Preferencias: interruptores.
   - Responsiva: el panel de firma se queda como baldosa `inverse` para que el trazo oscuro se vea.
9. **Notificaciones (`/app/notifications`):** lista con punto `accent` en las no leídas.
10. **Acceso (`AuthShell`):**
    - Oscuro con el lockup HIVE en `accent`, el hexágono iluminado y el titular.
    - Campos oscuros y botón principal en degradado.
    - Aplica a entrar, registro, recuperar y restablecer.
11. **404:** oscura, con el hexágono y el botón para volver.

**Ocultas por bandera** (onboarding, detalle de orden, historial y recompensas del wallet, detalle de membresía, seguridad): toman el tema oscuro por las piezas compartidas, sin diseño propio. La verificación comprueba que no se vean rotas si se encienden.

## 7. Panel

- Sin cambios de estructura.
- Toma los valores claros de §3.1: fondo Ivory Silk, tarjetas blancas, borde fuerte en Smoked Taupe y terracota en lugar del coral para la sección activa, lo pendiente y lo lleno. La terracota va plana, con texto en `accentStrong` donde haga falta.
- La rama `hive-panel` se actualiza desde `hive` cuando B se fusione. Su diseño no cambia: sus reglas ya hablan de tokens por función.

## 8. Imágenes generadas

`scripts/brand-assets.mjs` deja de leer `COLOR` (que pasa a ser referencias CSS) y toma los hex de la tabla `DARK`:

- **Ícono de la app (192, 512, maskable, apple-touch):** fondo `canvas` #141210 con el hexágono en `accent`.
- **Favicon:** el mismo tratamiento.
- **Logo de correo:** círculo `accent` con el símbolo en `onAccent`, para que se vea en correo claro y oscuro.
- Los logos del pase de wallet se regeneran en terracota, pero el diseño del pase es de A.

Los nombres de archivo no cambian.

## 9. Implementación técnica

- **`src/design/tokens.ts`:**
  - `LIGHT` y `DARK`, dos tablas con las mismas claves (hex `#RRGGBB`).
  - `COLOR` pasa a ser el mapa de referencias CSS por token (`rgb(var(--c-canvas))`) para estilos en línea.
  - Un ayudante `alpha(token, opacidad)` devuelve `rgb(var(--c-x) / 0.55)` y reemplaza las 55 concatenaciones `${COLOR.x}NN` (en 18 archivos).
  - `TONE_STYLE` y `resolveTone` siguen igual por nombre.
- **`src/index.css`:**
  - Variables `--c-<token>` como tripletas RGB en `:root` (claro) y en `[data-theme="dark"]` (oscuro).
  - Las variables HSL de shadcn, definidas por tema a partir de las mismas tablas.
  - Una prueba verifica que coincidan con `tokens.ts`, como hoy.
- **`tailwind.config.ts`:** cada color es `rgb(var(--c-x) / <alpha-value>)`, para que `bg-surface/70` y similares sigan funcionando en los dos temas.
- **Cambio de tema:** un hook `useTheme("dark" | "light")` en `AppShell`, `AuthShell`, `NotFound` y `AdminLayout` fija `document.documentElement.dataset.theme` y `<meta name="theme-color">`.
- **Pruebas que comparan colores:**
  - jsdom no resuelve variables CSS. Las pruebas que hoy comparan hex con `toHaveStyle` pasan a comparar la referencia del token (`COLOR.accent`), o la variable resuelta mediante una hoja de estilos de prueba que define las variables del tema.
  - El contraste se prueba sobre las tablas hex.
- **Guardias** (se conservan y se amplían):
  - Ningún color escrito a mano fuera de `src/design/`, incluido `rgba()` y `#RRGGBBAA`.
  - Sin texto claro sobre terracota en los dos temas.
  - **Nuevas:** `LIGHT` y `DARK` tienen exactamente las mismas claves; no aparece #FA936A; en la zona de la app (`src/pages/client`, `src/components/app`, `src/components/auth`) no hay `bg-white`, `text-white`, `bg-black`, `text-black` ni `#fff`/`#000` que ignoren el tema.
- **`/sistema`:** muestra cada token y cada pieza en los dos temas, lado a lado.

## 10. Verificación

- Contraste de los dos temas como prueba unitaria (§3.2), incluido el punto medio del degradado.
- Suites en verde: frontend, servidor, scripts y regresión del servidor sobre una base desechable.
- Build con Node 20 (el de Railway).
- Barrido en navegador:
  - Todas las pantallas de la app y del acceso, a 390 y 1280 px.
  - Las pantallas ocultas encendiendo sus banderas sólo en una compilación local.
  - Una pasada del panel en claro.
  - Criterios de siempre: sin errores de consola, sin 4xx/5xx inesperados, sin `undefined`/`NaN`, sin pantalla en blanco, sin scroll horizontal.
  - Los diálogos, menús y toasts se revisan en los dos temas.
- Movimiento reducido: los resplandores son estáticos; no se agrega animación.
- Revisión adversarial del diff antes de fusionar a `hive`.

## 11. Riesgos

1. **Pruebas por valor:**
   - 29 aserciones `toHaveStyle`, en 6 archivos de prueba, comparan colores por hex y hay que reescribirlas.
   - Mitigación: primero la maquinaria de temas con sus pruebas, después las pantallas.
2. **Blancos y negros fijos:**
   - Las pantallas con blancos o negros propios se verían mal en oscuro.
   - Mitigación: la guardia nueva los encuentra y el barrido los confirma.
3. **Portales:** si algún componente abre un portal antes de que el marco fije el tema, parpadea en claro. Mitigación: el tema se fija de forma síncrona, antes de pintar.
4. **La sesión del panel:**
   - Trabaja en paralelo y necesita saber que sus valores cambian.
   - Mitigación: nota en este documento y en la memoria del proyecto. Al fusionar, su rama se actualiza desde `hive`.
5. **Producción:** B debe salir completo. Media app oscura con pantallas claras se vería rota. Se publica sólo cuando el usuario lo pida.

## 12. Ramas y entrega

- Trabajo en `hive-app` (worktree `/Users/saidromero/Alma Studio/alma-hive-app`).
- Al terminar y verificar, se fusiona a `hive`.
- Producción (`main`) sólo cuando el usuario lo pida.
- Después, A (quitar "Alma" y las fotos) sale de `hive` con su propio documento.

## 13. Referencias

- `assets/hive-app/paleta-marca.png`: paleta del estudio.
- `assets/hive-app/ref-autos-cobre.png`, `ref-tenis-lima.png`, `ref-bocinas-oscuro.png`: referencias de estilo.
- `assets/hive-app/mockup-app-oscura.png` y `.html`: el mockup aprobado. El `.html` se abre en navegador; sus botones de tono dependen del compañero visual y fuera de él no hacen nada.
- `2026-09-24-hive-sistema-visual-design.md`: sistema visual (sub-proyecto 1).
- `2026-09-25-hive-panel-design.md` (rama `hive-panel`): diseño del panel.
