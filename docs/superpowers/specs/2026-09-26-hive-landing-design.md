# Landing de HIVE Pilates Studio — diseño

**Fecha:** 2026-09-26 · **Rama:** `hive-landing` (desde `hive` en 3ea261b, lo que está en producción) · **Sub-proyecto:** parte de A (quitar Alma), adelantada por pedido del usuario.

**Relación con otros documentos:**
- Colores, tokens por tema, guardias y piezas: `2026-09-25-hive-app-oscura-design.md` (paleta v2, app oscura). Esta landing es parte de la zona oscura y sigue sus reglas §3.3.
- Tipografía (Unbounded + Manrope), mínimos de 12 px y 44 px, logo provisional: `2026-09-24-hive-sistema-visual-design.md`.

**Maqueta aprobada:** `assets/hive-landing/mockup-landing.html`, con celular a 390 px con todas las secciones y escritorio a 1280 px con la portada y el horario. Precios del estudio: `assets/hive-landing/precios-estudio.png`.

---

## 1. Qué y para quién

**Objetivo:** reemplazar la landing de Alma en `/` por una landing nueva de HIVE Pilates Studio, oscura como la app, sin fotos ni rastros de Alma, que convierta a visitantes nuevos en clientas registradas o con una clase reservada.

**Para quién:** personas que llegan por Instagram o Google y aún no son clientas: jóvenes y adultos que buscan movimiento y bienestar, tanto quienes ya practican Pilates como quienes descubren el Reformer. Fuente: cuestionario del estudio del 2026-09-25.

**Tono de marca (del cuestionario):**
- Sofisticada, simple y minimalista.
- Premium y energética.
- Cercana, audaz y sofisticada.
- "Una marca fuerte y retadora, con un diferenciador frente a los colores cálidos asociados a calma."
- Valores: bienestar, optimismo, constancia, comunidad, perseverancia, confianza.
- Lo que la hace única: el concepto de colmena (comunidad y movimiento), un espacio con carácter, estilo urbano/industrial y grupos pequeños.

**Éxito:**
1. Quien llega entiende en la portada qué es HIVE, dónde está y cómo empezar (la clase muestra).
2. Ve el horario real de la semana y los paquetes reales con precio de apertura.
3. Reserva o se registra en pocos toques, y termina en la clase que eligió.
4. No aparece ninguna foto ni texto de Alma, ni dato de Juriquilla.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Qué hay en `/` | Landing nueva de HIVE (no redirigir a la app, no portada mínima) |
| Tono | **Oscuro**, igual que la app: carbón `#141210`, terracota `#CF8A6B → #A9603F`, resplandores estáticos |
| Construcción | Página nueva desde cero con secciones pequeñas. Se elimina `Index.tsx` de Alma |
| Secciones | Portada · Clases y coaches · Horario · Paquetes · Contacto y ubicación, más menú y pie |
| Fotos | Ninguna del estudio. Coaches: foto sólo si el estudio sube una en el panel; si no, monograma en hexágono |
| Datos | Horario, paquetes, clases y coaches salen del servidor (panel). Contacto sale de `src/lib/studio.ts` |
| Registro | El registro y la bienvenida respetan `returnUrl` para terminar en la clase elegida |
| Metadatos | Título, descripción e imagen al compartir de `/` pasan a HIVE; el resto de metadatos queda para A |

## 3. Estructura y contenido

Una sola página, en este orden. Los textos entre comillas son los aprobados en la maqueta; se pueden ajustar sin cambiar la estructura.

### 3.1 Menú superior (fijo)
- Izquierda: hexágono en terracota y "HIVE / PILATES STUDIO" (lockup de `BrandLogo`).
- Escritorio: ligas a Clases, Horario, Paquetes y Contacto (anclas a cada sección).
- Móvil: botón de menú que abre las mismas ligas.
- Derecha, sin sesión: botón "Entrar" (`/auth/login`).
- Derecha, con sesión: "Mi cuenta" (`/app`) para clientas, o "Panel" (`/admin/dashboard`) para `admin`, `super_admin`, `instructor` y `reception`, como hoy.
- Fondo `canvas` al 88–90 % con línea inferior `line`.

### 3.2 Portada
- Eyebrow: "Pilates Reformer · Coyoacán".
- Titular en Unbounded, mayúsculas: "Entra. Muévete." y la línea de acento en terracota: "Sal más fuerte."
- Frase: "Grupos de 6 en un espacio urbano con carácter. Una colmena que se mueve junta, desde las 6 de la mañana."
- Botón principal (degradado): "Reserva tu clase muestra" → `/auth/register?returnUrl=/app/checkout`. Con sesión de clienta → `/app/checkout`.
- Botón secundario: "Ver horario" (ancla a §3.4).
- Tres datos cortos: "6 · reformers por clase", "L–D · desde las 6 AM", "CDMX · Coyoacán".
- Escritorio: dos columnas; a la derecha el hexágono grande con degradado terracota y resplandor, sobre su pedestal (`HexPedestal` o equivalente).

### 3.3 Clases y coaches
- Título "Reformer," / acento "a tu ritmo y al nuestro."
- Tarjetas de los tipos de clase activos (`/class-types`): nombre, descripción corta y duración si existe.
- Coaches activos (`/public/instructors`): nombre y especialidades.
  - Si tiene `photoUrl`, su foto recortada en hexágono.
  - Si no, un monograma en hexágono con su inicial.
- Tres líneas de lo que distingue a HIVE: "Grupos pequeños: atención de verdad." · "Comunidad que te empuja a volver." · "Pilates · Café · Wellness."

### 3.4 Horario de la semana
- Título "Esta semana" / acento "en HIVE."
- Tira de días de la semana actual (lunes a domingo), con el día elegido en degradado terracota.
- Filas de clase del día elegido, desde `/classes?start&end`:
  - Hora en Unbounded.
  - Tipo de clase.
  - "coach · duración".
  - Lugares: "N de M lugares", o "Último lugar" / "Pocos lugares" con las mismas reglas de escasez de la app.
- Acción por fila:
  - "Reservar" → `/app/classes/:id`. Sin sesión, `ClientAuthGuard` manda a login con `returnUrl`.
  - Clase llena: "Llena" con la información atenuada y "Lista de espera" (misma ruta) a opacidad completa.
  - Clase pasada o cancelada: no se muestra.
- Navegación a la semana siguiente: opcional. La primera versión muestra sólo la semana actual; si hoy es domingo por la tarde, muestra la siguiente.

### 3.5 Paquetes
- Título "Elige cómo" / acento "entrar a la colmena."
- **Clase muestra** destacada arriba. Es el plan activo con `isNonRepeatable` y `classLimit === 1`; si no hay ninguno, el que tenga "muestra" en el nombre; si tampoco, no hay tarjeta destacada.
- Lista de los demás paquetes activos en su `sortOrder`:
  - Nombre.
  - Precio por clase cuando `classLimit > 1`.
  - Precio. Si `openingActive` y `effectivePrice < price`: el precio normal tachado y el de apertura, con la etiqueta "Precio de apertura".
  - Todo sale de `/plans?active=true` (`effectivePrice`, `openingActive`); nunca hay precios escritos en el código.
- Botón "Comprar paquete" → `/app/checkout` (sin sesión, el guardia pide login y regresa).
- Si no hay paquetes activos, la sección no se muestra y su liga desaparece del menú.

### 3.6 Contacto y ubicación
- Título "Te esperamos" / acento "en Coyoacán."
- Tarjetas:
  - Dirección, con liga "Cómo llegar" a Google Maps.
  - Horario de atención.
  - Instagram. WhatsApp sólo si hay número.
  - Política de cancelación: "Cancela con 12 h. Después cuenta como tomada.", con liga a `/legal/cancelacion`.

### 3.7 Pie
- Hexágono, "MOVIMIENTO · BIENESTAR · COMUNIDAD" (lema del estudio), ligas a Privacidad, Términos y Cancelación, y "© <año> HIVE Pilates Studio".

### 3.8 Lo que no va
- Galería de fotos, "Esto es Alma", testimonios, tabla comparativa de modalidades, bloques de cierre y mapa embebido: el mapa se sustituye por la liga a Google Maps.

## 4. Diseño visual

- Tema oscuro de la paleta v2 (spec 2026-09-25 §3.1) con sus reglas §3.3:
  - Nunca texto claro sobre terracota.
  - Terracota como texto sólo en oscuro.
  - Degradado y resplandor sólo aquí y en la app.
  - Resplandores estáticos que no bajan el contraste del texto de AA.
- Fondo `canvas` con resplandor `bg-app-glow` (esquina superior derecha) y uno tenue a media página.
- Tarjetas: `bg-surface/70` con borde `line` y radios de 16–20 px, como la app.
- Botón principal con degradado terracota, texto `accent-foreground` y `shadow-accent-glow`. Secundario con contorno `line-strong`.
- Titulares de sección: eyebrow en terracota, título en Unbounded mayúsculas y línea de acento en terracota.
- Móvil primero:
  - A 390 px, sin scroll horizontal.
  - Texto de 12 px o más.
  - Controles de 44 px.
- Escritorio (1280 px): portada en dos columnas, horario en dos columnas (título y tira a la izquierda, filas a la derecha) y ancho máximo de contenido ~1120 px.
- Movimiento: aparición suave de secciones sólo si no hay `prefers-reduced-motion`. Nada anima con movimiento reducido.

## 5. Construcción

### 5.1 Archivos
- **Nueva página:** `src/pages/landing/Landing.tsx`. Sólo compone las secciones y hace las consultas; pasa datos a las secciones.
- **Secciones** en `src/components/landing/`: `LandingNav.tsx`, `LandingHero.tsx`, `ClassesCoaches.tsx`, `WeekSchedule.tsx`, `Plans.tsx`, `Contact.tsx`, `LandingFooter.tsx`. Cada una recibe datos por props y no hace consultas, para poder probarla sola.
- **Lógica pura** en `src/components/landing/landingData.ts`:
  - Elegir la clase muestra.
  - Ordenar planes.
  - Precio por clase.
  - Agrupar clases por día.
  - Estado de lugares.
  - Con pruebas unitarias.
- **Ruta:** `src/App.tsx` usa `Landing` en `/`.
- **Eliminar:**
  - `src/pages/Index.tsx` y sus dos pruebas (`Index.catalog.test.ts`, `Index.client-copy.test.ts`). Sus protecciones pasan a las pruebas nuevas (§7).
  - `src/components/Schedule.tsx`, si nada más lo importa (hoy sólo lo usa `Index.tsx`).
  - Las imágenes de `src/assets/alma/` que sólo usaba `Index.tsx`: las tres fotos de clase, y `alma-mark*.png` si ya nada las importa.

### 5.2 Tema
- `src/design/theme.ts`: `themeForPath` devuelve `dark` también para `/` exacto. Queda `/app`, `/auth` y `/`. Las legales (`/legal/*`) siguen claras hasta A.
- `index.html`: el script de primera pintada replica la misma regla, con `meta theme-color` `#141210` en `/`.
- Pruebas de `theme.test.tsx` y `wiring.test.ts` actualizadas para `/`.

### 5.3 Datos
Mismas consultas y claves de react-query que ya existen:

| Dato | Consulta | Campos usados |
|---|---|---|
| Horario | `GET /classes?start=<lunes>&end=<domingo>` | `id`, `date`/`class_date`, `start_time`, `end_time`, `class_type_name`, `instructor_name`, `capacity`/`max_capacity`, `current_bookings`, `status` |
| Paquetes | `GET /plans?active=true` | `name`, `price`, `effectivePrice`, `openingActive`, `classLimit`, `durationDays`, `isNonRepeatable`, `sortOrder`, `description` |
| Tipos de clase | `GET /class-types` | `name`, `description`, duración si existe |
| Coaches | `GET /public/instructors` | `displayName`, `specialties`, `photoUrl` |

- Estados:
  - Mientras carga, esqueletos con la altura final, para que la página no salte.
  - Si una consulta falla, un aviso discreto en su sección ("No pudimos cargar el horario.") con "Reintentar"; el resto de la página funciona.
- Horario sin clases esa semana: "Pronto publicamos el horario de la semana." con liga a Instagram.

### 5.4 Contacto
`src/lib/studio.ts` pasa a los datos de HIVE. Es la única fuente de verdad, y también la usan el perfil de la app y las páginas legales:

```ts
export const STUDIO = {
  name: "HIVE Pilates Studio",
  address: "Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX",
  mapsUrl: "https://maps.app.goo.gl/6KvMNWPZk35siB4fA",
  instagram: "hive.pilates",
  whatsapp: null as string | null,   // pendiente del estudio
  phone: null as string | null,      // pendiente del estudio
  hours: "6 AM a 9 PM",
} as const;
```

- Los campos se conservan con los mismos nombres. `facebook` se quita si nada lo usa, o queda en `null`.
- Todo botón o liga de WhatsApp o teléfono sólo se pinta si su valor no es `null`. Hoy `src/pages/client/Profile.tsx` (~152) y `src/pages/legal/LegalLayout.tsx` (~104) usan `STUDIO.whatsapp` sin condición: se protegen igual.
- En el perfil y en las legales cambia la dirección de Juriquilla por la de Coyoacán. El resto del texto legal no se toca (sub-proyecto A).

### 5.5 Regreso tras registrarse
- `Register.tsx`: lee `returnUrl` de la URL y lo pasa a la bienvenida (`/auth/onboarding?returnUrl=…`) o, si la bienvenida está apagada, navega a `returnUrl`.
- `Onboarding.tsx`: al terminar, navega a `returnUrl` si existe; si no, a `/app`, como hoy.
- Sólo se aceptan rutas internas que empiecen con `/app`. Cualquier otra se ignora, para evitar redirecciones abiertas.
- `Login.tsx` ya respeta `returnUrl`. La liga "Crear cuenta" del login conserva el `returnUrl`.

### 5.6 Metadatos de `/`
- `index.html`:
  - `<title>`: "HIVE Pilates Studio · Pilates Reformer en Coyoacán".
  - `description` y `og:description`: "Pilates Reformer en grupos de 6 en Coyoacán, CDMX. Reserva tu clase muestra."
  - `og:title` y `twitter:*` a HIVE.
- `public/og-image.png`: se regenera desde `scripts/brand-assets.mjs` con un objetivo nuevo de 1200×630: carbón, hexágono terracota centrado con resplandor. Queda probado como los demás objetivos del script.
- Los demás metadatos, el manifiesto y los nombres de archivos `alma-*` quedan para A.

## 6. Accesibilidad y rendimiento

- Un solo `h1` (portada); cada sección con `h2` y `aria-labelledby`; el menú móvil con `aria-expanded` y cierre con Escape.
- Anclas con desplazamiento que respeta el menú fijo (`scroll-margin-top`).
- Estado de lugares con texto, no sólo color. Los botones "Reservar" llevan en `sr-only` el tipo de clase y la hora, como en la app.
- Contraste AA en todo el texto, incluido sobre los resplandores (pruebas de contraste ya existentes).
- Sin imágenes de fotos. El hexágono es SVG o CSS; las fotos de coaches, si las hay, con `loading="lazy"` y tamaño fijo.

## 7. Pruebas

- **Guardia de zona:** `src/pages/landing` y `src/components/landing` entran a `ZONA` en `app-zone.test.ts`. Aplica todo lo de la zona oscura:
  - Sin colores a mano.
  - Sin blancos ni negros fijos.
  - Regla 1 invertida.
  - Opacidades que Tailwind genera.
  - Texto de 12 px o más.
- **Lógica pura** (`landingData.test.ts`):
  - Elección de la clase muestra (bandera, nombre, ninguna).
  - Orden.
  - Precio por clase.
  - Agrupación por día.
  - Lugares y escasez.
  - Precio de apertura (con y sin `openingActive`, y con `effectivePrice >= price`).
- **Render por sección**, con datos simulados:
  - **Paquetes:** tachado y etiqueta de apertura; sin sección si no hay planes.
  - **Horario:** tira de días, "Llena" + "Lista de espera", mensaje de semana vacía y aviso de error.
  - **Coaches:** foto contra monograma.
  - **Contacto:** sin WhatsApp cuando es `null`.
  - **Menú:** "Entrar", "Mi cuenta" o "Panel" según la sesión.
  - **Portada:** destinos de sus botones con y sin sesión.
- **Contenido** (heredan las pruebas viejas), sobre los archivos de la landing y `studio.ts`:
  - Sin "Alma".
  - Sin "Juriquilla" ni "Querétaro".
  - Sin testimonios.
  - Sin precios escritos a mano.
  - Sin fotos importadas de `src/assets/alma`.
- **Tema:** `themeForPath("/") === "dark"` y el script de `index.html` coincide.
- **Regreso:**
  - `Register` y `Onboarding` navegan a `returnUrl` interno.
  - Ignoran uno externo (`https://…`, `//…`) o uno que no empiece con `/app`.
- **Metadatos:** `index.html` sin "Alma" en `title`, `description` ni `og:*`; el objetivo de `og-image` está en `brand-assets.mjs`.

## 8. Verificación antes de entregar

- `npm test` completo (frontend, servidor, scripts), `tsc` y build con Node 20.
- Regresión del servidor en base desechable (63/63).
- Barrido en navegador de `/` a 390 y 1280 px, con datos de HIVE sembrados en la base desechable: los precios de la imagen del estudio, clases de L–D en sus horarios, coaches sin foto y uno con foto.
  - Sin errores de consola ni `/api` ≥ 400.
  - Sin scroll horizontal.
  - Primera pintada oscura.
  - Movimiento reducido = `[]`.
  - Menú móvil.
  - Anclas.
- Flujo completo: landing → "Reservar" en una clase → registro → bienvenida → la clase elegida.
- Nada se publica sin que el usuario lo pida.

## 9. Pendientes del estudio (no bloquean)

1. **Precio de la clase muestra:** en la imagen de precios, la promoción de apertura dice $500 y el precio normal $200. Parece invertido; confirmarlo antes de capturarlo en el panel.
2. **Teléfono y WhatsApp:** pendientes. Al tenerlos se ponen en `studio.ts` y aparecen los botones.
3. **Kit de marca:** la imagen de precios muestra otro logo (tres hexágonos, "HIVE" delgado, "PILATES • CAFÉ • WELLNESS"). La landing usa el logo provisional hasta que llegue el kit.
4. **Paquetes en el panel:** hoy la base de datos tiene los paquetes de Alma. El estudio captura los de HIVE en el panel:
   - Cada paquete con su precio normal y su "precio de apertura".
   - El interruptor de precios de apertura encendido en Configuración.
   - La clase muestra marcada como "No repetible" con 1 clase.
5. **Política de cancelación y vigencias:** en definición. La landing sólo resume las 12 horas y liga a la política completa.

## 10. Fuera de alcance

- Páginas legales (siguen claras y con su texto).
- Correos, WhatsApp automáticos, pase de wallet del servidor.
- Nombres de archivos `alma-*` y manifiesto.
- Los valores por defecto del servidor (`DEFAULT_GENERAL_SETTINGS` con el nombre y la dirección de Alma).
- Cafetería (sólo se menciona).
- Sistema de lealtad.
- Pagos en línea.
- Todo eso sigue en el sub-proyecto A o en fases posteriores.
