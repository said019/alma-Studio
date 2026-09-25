# HIVE · Sistema visual

**Sub-proyecto 1 de 4 del cambio de marca Alma → HIVE**
Fecha: 24 sep 2026 · Rama: `hive` · Estado: diseño aprobado, pendiente de revisión escrita

---

## 1. Contexto

Alma Movement se convierte en **HIVE Pilates Studio** (Coyoacán, CDMX). Es el mismo repositorio y el mismo despliegue: al publicar, las clientas actuales verán HIVE. Esta decisión la tomó el dueño del proyecto de forma explícita.

El cambio se hace en cuatro sub-proyectos, en orden, cada uno con su diseño y su revisión:

1. **Sistema visual** — este documento. Tokens, tipografía, piezas compartidas, logo provisional.
2. **App de clienta** — reservar, mis clases, cancelar/reagendar, perfil, pase.
3. **Panel** — operación diaria de dueña y recepción.
4. **Resto de puntos de contacto** — el nombre "Alma" en pantallas, landing, correos, plantillas de WhatsApp, pase de wallet y metadatos; fotos del estudio.

**Nada llega a producción hasta que los cuatro estén terminados.** Una app que diga HIVE con correos y pase que todavía dicen Alma confundiría a las clientas actuales.

### Lo que pide la marca

Del cuestionario de marca de HIVE:

- Sofisticada, simple y minimalista; **premium y energética**; *cercana + audaz + sofisticada*.
- Estilo urbano/industrial. Concepto de colmena: comunidad y movimiento.
- Diferenciarse **a propósito** de los colores cálidos asociados a calma.
- Reservar debe sentirse **valorada, conectada a la comunidad y memorable**.
- Valores: bienestar, optimismo, constancia, comunidad, perseverancia, confianza.

El kit de marca y las referencias visuales estaban pendientes. La fuente visual real fue su Instagram [@hive.pilates](https://www.instagram.com/hive.pilates/): el símbolo hexagonal con abeja, el coral `#FA936A`, el negro, y un letrero retroiluminado sobre concreto.

### Decisiones tomadas

| Tema | Decisión |
|---|---|
| Alcance de marca | Cambio completo en la app, aunque se separe del kit de Alma |
| Dirección | **Coral Bold**: base clara neutra, coral en bloques grandes, negro |
| Coral en el panel | **Coral = atención**: sólo sección activa, lo pendiente y lo lleno |
| Momentos especiales | **Tipográficos**: sin brocha, Unbounded y coral |
| Herencia de Alma | **Ninguna**: sale la paleta greige, Fraunces, Jost y los tokens `alma-*` |
| Logo | Redibujo provisional en SVG a partir del Instagram |
| Letra del wordmark | **Unbounded**, la misma de los titulares |
| Enfoque técnico | Tokens por función + piezas nuevas (no sólo cambiar valores) |

---

## 2. Alcance de este sub-proyecto

**Incluye**

- Los 14 tokens de color, la tipografía y la escala.
- Las piezas compartidas de la app (27 en `src/components/app/`) y del panel (`AdminLayout` + variantes de los componentes shadcn), rediseñadas por dentro con sus props intactas.
- El componente de logo y el SVG provisional; favicon, íconos de la app y logo del pase generados desde ese SVG.
- La migración completa de nombres: cero referencias a Alma en el sistema.
- Una página del sistema en `/sistema`, visible sólo en desarrollo.
- Pruebas de contraste y guardias contra regresar a Alma.

**No incluye**

- Rehacer la estructura de las pantallas — sub-proyectos 2 y 3. Las pantallas cambiarán de aspecto porque sus piezas cambian, pero su distribución sigue igual.
- El texto "Alma" en pantallas, correos y WhatsApp, las fotos del estudio de Alma y la landing — sub-proyecto 4.
- El backend.

---

## 3. Fundamentos

### 3.1 Color

Los tokens nombran **para qué sirve** cada color, no a qué marca pertenece. Si la marca vuelve a cambiar, cambian los valores, no los nombres.

La base es gris cemento neutro con blanco limpio. **El coral es la única calidez del sistema**; sobre una base neutra resalta más, y ningún neutro tiene tono cálido.

| Token | Valor | Rol | Contraste medido |
|---|---|---|---|
| `canvas` | `#F4F4F3` | Fondo de toda la app | — |
| `surface` | `#FFFFFF` | Tarjetas, paneles, barra del panel | — |
| `sunken` | `#EAEAE9` | Fondo de campos, filas alternas, hover | — |
| `line` | `#DEDEDC` | Divisores. Sólo decorativo | — |
| `line-strong` | `#8A8A88` | Borde de campos y controles | 3.14:1 sobre canvas · 3.46:1 sobre surface |
| `ink` | `#111111` | Texto principal, botón principal | 17.16:1 · 18.88:1 |
| `ink-muted` | `#5B5B59` | Texto secundario | 6.18:1 · 6.81:1 |
| `accent` | `#FA936A` | Bloques y rellenos coral | con `ink` encima: 8.49:1 |
| `on-accent` | `#111111` | Texto sobre `accent` | 8.49:1 |
| `accent-soft` | `#FEE4D8` | Resaltes suaves, fondos de aviso | con `ink` encima: 15.56:1 |
| `accent-strong` | `#B94A26` | Coral pequeño: números, íconos, enlaces | 4.69:1 · 5.16:1 |
| `success` | `#2E6B50` | Sólo confirmación | 5.72:1 · 6.30:1 |
| `danger` | `#A3243B` | Sólo error y destructivo | 6.64:1 |
| `inverse` | `#111111` | Secciones oscuras (pase, pie) | texto `#F4F4F3`: 17.16:1 · `accent`: 8.49:1 |
| `inverse-raised` | `#1E1E1E` | Tarjetas sobre `inverse`; texto secundario `#A3A3A1` | 15.15:1 · 7.47:1 |

Mínimos: 4.5:1 para texto, 3:1 para bordes que identifican un control.

### 3.2 Reglas de color

1. **Nunca texto claro sobre coral.** Da 2.02:1. Sobre `accent` el texto siempre es `on-accent`.
2. **El coral no es texto.** Sobre `canvas` el coral da 2.02:1. Para un número, ícono o enlace coral se usa `accent-strong`.
3. **En el panel, coral = atención.** Sólo la sección activa, lo pendiente y lo lleno. Siempre acompañado de texto o de un número en `accent-strong`; nunca el color como única señal.
4. **Nunca coral sobre coral.** Un bloque `accent` no lleva botones ni pills coral; ahí el botón es `ink`.
5. **`success` y `danger` son funcionales**, nunca decoración. `danger` es distinto del coral a propósito.
6. **Nada de colores escritos a mano** fuera de los archivos de tokens.

### 3.3 Tipografía

- **Unbounded** (600, 800) — titulares y cifras grandes. Los titulares grandes van en mayúsculas.
- **Manrope** (400–800) — todo lo que se lee: párrafos, etiquetas, formularios, tablas.
- Las listas de horas y montos usan **cifras tabulares de Manrope** para que alineen. Unbounded sólo para cifras que van solas (una hora destacada, el número de una tarjeta de resumen).
- Se cargan desde Google Fonts, igual que hoy.

| Estilo | Fuente | Tamaño / interlínea | Uso |
|---|---|---|---|
| `display-xl` | Unbounded 800, mayúsculas | 40 / 1.0 | Confirmaciones, momentos especiales |
| `display-l` | Unbounded 800, mayúsculas | 28 / 1.05 | Título de pantalla |
| `display-m` | Unbounded 600 | 20 / 1.1 | Secciones, hora de una clase |
| `body-l` | Manrope 500 | 17 / 1.5 | Texto destacado |
| `body` | Manrope 500 | 15 / 1.5 | Texto normal |
| `label` | Manrope 700, mayúsculas, +0.12em | 12 / 1.2 | Etiquetas y encabezados de tabla |

Mínimo legible: 12 px.

---

## 4. Piezas compartidas

**Principio:** cada pieza conserva su nombre y sus props. Sólo cambia cómo se ve. Así ninguna pantalla se rompe el día que cambia el sistema, y las pantallas se rehacen después, en los sub-proyectos 2 y 3.

### 4.1 Botones — `PrimaryButton`, `GhostButton`, shadcn `Button`

| Variante | Aspecto | Uso |
|---|---|---|
| `primary` | Relleno `ink`, texto claro | Acción principal, en todas partes |
| `accent` | Relleno `accent`, texto `on-accent` | **Sólo en la app** y sólo para la acción que genera ingreso (comprar, renovar). Una por pantalla. **No existe en el panel** |
| `secondary` | Borde `line-strong`, texto `ink` | Acción secundaria |
| `ghost` | Sin fondo | Acciones terciarias |
| `danger` | Borde y texto `danger` | Acciones destructivas |
| `disabled` | Fondo `sunken`, texto `line-strong` | — |

Forma de píldora; alto mínimo 44 px.

### 4.2 Pills y estados — `Tag`, `StatusPill`, shadcn `Badge`

- **Disponibilidad**: `accent` cuando hay lugar, `accent-soft` cuando quedan pocos, `ink` cuando está llena.
- **Estados de pago**: texto con punto, sobre blanco. Pagado en `success`, por verificar sobre `accent-soft`, rechazado en `danger`. El color nunca va solo: siempre con la palabra.

### 4.3 App de clienta

- **`AppShell`** — barra inferior blanca de 5 pestañas; la activa lleva su ícono sobre `accent`. El logo es el símbolo hexagonal.
- **`PageHeader`** — la firma de la app: un bloque `accent` con esquinas inferiores redondeadas, etiqueta superior, título `display-l` y una línea de contexto. **Uno por pantalla.**
- **`SegmentedTabs`** (días) — píldoras blancas; la activa en `ink`. El negro marca "estás aquí" sin gastar coral.
- **`ListRow`** de clase — tarjeta `surface`, hora en `display-m`, instructora y duración en `ink-muted`, disponibilidad a la derecha. Una clase llena se atenúa pero sigue visible.
- **`StickyCta`**, **`DataRow`**, **`ListGroup`**, **`Section`**, **`Stat`**, **`InfoBanner`**, **`Stepper`**, **`BackLink`**, **`ActionRow`** — mismas reglas: superficies blancas sobre `canvas`, tinta negra, coral sólo en bloques.

### 4.4 Campos — `Field`, `SelectField`, `TextAreaField`, `PasswordField`, shadcn `Input` / `Select`

Fondo `surface`, borde `line-strong` (3:1), esquinas de 12 px, alto mínimo 44 px. En foco: borde `ink` de 2 px y halo `accent-soft`. En error: borde y mensaje en `danger`; el mensaje dice qué pasa, no sólo que algo falló.

### 4.5 Panel

- **`AdminLayout`** — barra lateral `surface`; la sección activa lleva una línea `accent` a la izquierda y fondo `canvas`. El contador de pendientes del menú va sobre `accent`.
- **Tarjeta de cifra** — `surface` con borde `line`. Variante *atención*: borde `accent` y número en `accent-strong`. Es el único número coral de la pantalla.
- **Tabla** (shadcn `Table`) — encabezado `label` sobre `canvas`, filas con divisor `line`, montos en cifras tabulares.
- **`SectionTabs`**, **`ConfirmDialog`** y los componentes shadcn restantes (`Dialog`, `Sheet`, `Tabs`, `DropdownMenu`, `Select`) se reestilan desde sus variables CSS.

### 4.6 Estados obligatorios — `EmptyState`, `ErrorState`, `SkeletonRow`

Toda pantalla maneja cargando, vacío y error. Vacío: símbolo hexagonal sobre `accent-soft`, titular, texto de marca y la acción que corresponde. Error: mensaje honesto y botón de reintento; un fallo de red nunca se disfraza de vacío. Cargando: barras con contraste visible sobre la tarjeta.

### 4.7 Forma, íconos y movimiento

- **Radios**: 12 px en tarjetas y campos, 16–22 px en bloques grandes, píldora en botones y pills.
- **Profundidad**: bordes en vez de sombras; una sombra suave sólo en lo que flota (diálogos, CTA fijo).
- **Hexágono**: sólo en momentos de marca — logo, estados vacíos, confirmaciones. Nunca como patrón decorativo repetido.
- **Íconos**: lucide, trazo fino.
- **Movimiento**: sólo `transform` y `opacity`, salida suave, sin rebotes, respetando "reducir movimiento". El sistema de atributos actual (`data-press`, `data-reveal`, …) se conserva con nombres neutros.

---

## 5. Logo provisional

El símbolo se trazó en SVG a partir del Instagram de HIVE: un hexágono de vértice arriba dividido en seis cuñas, con una abeja en negativo — cabeza en domo, dos alas que se tocan en una línea central, cuerpo en arco apuntado con una franja, y cola. Se comparó cuatro veces contra el original. Archivo: [`assets/hive-mark-provisional.svg`](assets/hive-mark-provisional.svg).

- **Un solo color**, heredado (`currentColor`): `ink` sobre claro o coral; `accent` sobre `inverse`. Nunca coral sobre coral ni sobre fondo claro.
- **Logo completo**: símbolo + "HIVE" en Unbounded 800 + "PILATES STUDIO" en Manrope 700 con espaciado amplio.
- **Dónde vive**: `AppShell`, `AdminLayout`, favicon, íconos de la app, pase de Apple/Google Wallet y encabezado de correo.
- **Reemplazo**: el símbolo vive en un solo SVG y un solo componente `BrandLogo`. Favicon, íconos y la imagen del pase se generan desde ese archivo con `sharp`. Cuando llegue el logo oficial se cambia ese archivo y todo se regenera.
- Queda marcado como provisional en el archivo y en el componente.

---

## 6. Migración

Cinco pasos; al final de cada uno la app funciona completa.

### 6.1 Tokens en un solo lugar

Los tokens de la sección 3 se definen una vez como variables CSS en `src/index.css`. De ahí los leen Tailwind (`tailwind.config.ts`), los componentes shadcn (sus variables `--background`, `--primary`, …) y el objeto de estilos de la app (`src/components/app/tokens.ts`). Se cambian las fuentes en `index.html` a Unbounded + Manrope.

**Colisión con shadcn**: shadcn ya usa el nombre `accent` para el fondo de *hover* en 10 componentes (58 usos: menús, selects, diálogos, calendario). Antes de que `accent` pase a ser coral, ese hover se reasigna a `sunken`. Si no, cada hover del panel se volvería coral.

### 6.2 Puente temporal

Los nombres viejos apuntan a los tokens nuevos por su función, para que la app cambie de color completa sin tocar ninguna pantalla:

| Alma | Usos (clase / `ALMA.`) | HIVE |
|---|---|---|
| `canvas` / `cream` | 105 / 143 | `canvas` |
| `mist` | 115 / 10 | `sunken` |
| `oat` / `blush` | 128 / 45 | `sunken` — **no** coral; el coral se pone a propósito en las piezas, nunca por reemplazo |
| `sandstone` | 131 / 14 | por prefijo: `border-` → `line-strong`, `bg-` → `line`, `text-` → `ink-muted` |
| `stone` y `coral` (alias viejo) | 1 / 8 | `ink-muted` — **ojo**: `ALMA.coral` es un beige, no el coral de HIVE |
| `berry` | 96 / 200 | panel → `ink` (85 usos); todo lo que ve la clienta — app, acceso, landing, legales, 404 — → `accent-strong` (211) |
| `ink` | 772 / 282 | `ink` |
| `ink-deep` / `inkDeep` | 44 / 12 | `inverse` |
| `hairline` / `border` | 215 / 113 | `line` |
| `olive` | 63 / 28 | `success` |
| `destructive` | — / 29 | `danger` |

El reparto de `berry` sale de dos reglas ya aprobadas: coral = atención en el panel, y app generosa con el coral. Se revisa a mano en los sub-proyectos 2 y 3.

### 6.3 Reemplazo de nombres

Un script sustituye los 1,670 usos de clases `alma-*` y los 883 de `ALMA.*` por los nombres nuevos, aplicando la tabla anterior. Los 108 colores escritos a mano se revisan uno por uno: cada uno pasa a un token o se justifica. Al terminar se borra el puente.

### 6.4 Piezas y logo

Se reescriben por dentro las piezas de la sección 4 y entra `BrandLogo` con el SVG provisional. Se generan favicon, íconos de la app y el logo del pase.

### 6.5 Limpieza

Sale la paleta de Alma, Fraunces, Jost y cualquier nombre interno con "alma" (por ejemplo `--ease-alma-out`, `.alma-photo`). `docs/DESIGN.md` se reescribe para HIVE.

### 6.6 Ramas

- `hive` es la rama de integración de los cuatro sub-proyectos. Sale de `main`.
- Cada sub-proyecto trabaja en su propia rama desde `hive` y se fusiona a `hive` tras su revisión.
- `main` sigue recibiendo trabajo (ya pasó con Drive), así que se fusiona `main` → `hive` con regularidad para no acumular divergencia.
- `hive` → `main` sólo cuando los cuatro sub-proyectos estén terminados y verificados.

---

## 7. Verificación

- **Contraste como prueba unitaria**: cada combinación permitida de la sección 3.1 se verifica contra su mínimo. Las dos combinaciones prohibidas quedan documentadas en la misma prueba.
- **Guardias contra regresar a Alma**: fallan si aparece una clase `alma-*`, el objeto `ALMA`, Fraunces o Jost, un color escrito a mano fuera de los archivos de tokens, texto claro sobre `accent` en las piezas compartidas, o la variante `accent` de botón en el panel.
- **Suites existentes en verde**: 24 de frontend (incluye las 5 de paridad con Velan), 54 de servidor y 63 de regresión.
- **Página del sistema**: ruta `/sistema`, registrada sólo cuando `import.meta.env.DEV`, con todos los tokens, tipografías y piezas en sus estados.
- **Barrido en navegador**: todas las rutas visibles del panel y de la app, en escritorio y a 390 px — sin errores de consola, sin respuestas 4xx/5xx inesperadas, sin `undefined`, `NaN` ni pantallas en blanco, con captura de cada una.
- **Movimiento**: todas las animaciones respetan "reducir movimiento".
- **Revisión adversarial del diff** antes de fusionar a `hive`.

---

## 8. Pendientes y riesgos

- **Logo oficial.** El SVG es provisional. Cuando llegue el archivo oficial, reemplazarlo es un cambio de un archivo.
- **Fotos del estudio.** HIVE tiene una sola foto publicada. El sistema no depende de fotografía; las fotos reales entran en el sub-proyecto 4.
- **Rama larga.** `hive` vivirá mientras duren los cuatro sub-proyectos; el riesgo de conflictos con `main` se controla fusionando seguido.
- **`berry` y los colores escritos a mano** son los puntos donde un reemplazo automático puede equivocarse. Por eso se revisan a mano y el barrido en navegador cubre ambas zonas.

---

## 9. Referencias

Los mockups aprobados durante el diseño están en `.superpowers/brainstorm/68706-1790269489/content/` (no versionado): `direcciones.html` (se eligió B), `admin-coral.html` (se eligió 2), `confirmacion.html` (se eligió A), `fundamentos-v2.html`, `componentes.html` y `logo.html` (se eligió A).
