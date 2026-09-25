# HIVE · Panel

**Sub-proyecto 3 de 4 del cambio de marca Alma → HIVE**
Fecha: 25 sep 2026 · Rama: `hive-panel` (sale de `hive`) · Estado: diseño aprobado en conversación, pendiente de revisión escrita

---

## 1. Contexto

El sub-proyecto 1 (sistema visual) está en producción desde el 24 sep 2026. El panel ya usa los colores, las letras y las piezas de HIVE, pero cada pantalla conserva la estructura de Alma, y eso se nota:

- Las tarjetas grises se pierden sobre el fondo gris.
- Cada pantalla tiene un ancho distinto: Reservas y Cobros van en una columna angosta al centro; Inicio y Reportes ocupan todo.
- Las pestañas van arriba del título.
- Hay mucho espacio muerto. Por ejemplo, la semana vacía de Clases muestra sólo un aviso.
- Algunas pantallas se esconden o se repiten. Lista de espera no tiene entrada en el menú. Reservas y Clases muestran la misma semana de dos formas.

Este sub-proyecto rehace la **estructura** de cada pantalla del panel. El sub-proyecto 2 (app de clienta) todavía no empieza; el panel va primero a petición del dueño y no depende de él.

### Diseño de referencia

El lienzo aprobado vive en **https://claude.ai/artifact/ACA2tnwBbjzpLiJi2S7iVt**:

- Página **"Panel · dirección A"**: las 18 pantallas de escritorio y 3 de celular, con datos de ejemplo. Es la referencia visual de este documento.
- Página **"Direcciones"**: las tres direcciones que se compararon (A · Mostrador, B · Cartel, C · Bandeja).

Donde este documento y el lienzo no coincidan, manda este documento. Los casos conocidos están en la sección 9.

---

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Dirección | **A · Mostrador**: hoy primero, información densa, buscar y cobrar siempre a la mano |
| Préstamo de B | El bloque negro **"Siguiente clase"** en Inicio |
| Reglas de color | Las del sistema, sin cambios: en el panel, coral sólo para la sección activa, lo pendiente y lo lleno |
| Buscador global | Sólo clientas por ahora (el endpoint ya existe) |
| Lista de espera | Pestaña de Reservas que muestra toda la semana; el servidor agrega `waitlist_count` a `GET /api/classes` |
| Ficha de clienta | Suma "Editar" (el mismo formulario de Clientas) y "Renovar" (abre Cobrar con la clienta elegida) |
| Lealtad | Se esconde de la ficha mientras `FEATURES.loyalty` esté apagada |
| Enlaces muertos | Salen los que llevan a plantillas de WhatsApp (función apagada) |
| Historial de cobros | Pasa a ser pestaña hermana de Cobrar y Verificar |
| Cobrar | Una sola pantalla con resumen fijo, en vez del asistente de 3 pasos |
| Cámara para pasar lista | Sale de Inicio y va a Pasar lista |

---

## 3. Alcance

**Incluye**

- El marco común del panel (sección 4): barra lateral, barra superior, encabezado de pantalla y navegación de celular.
- Las 17 pantallas visibles hoy, más Historial como pantalla propia (sección 5).
- Las piezas compartidas nuevas del panel (sección 4.5).
- Un cambio pequeño en el servidor: `waitlist_count` en `GET /api/classes` (sección 6).
- Arreglos baratos que caen dentro de las pantallas que se reescriben (sección 7).

**No incluye**

- El texto "Alma" que ya existe en pantallas, avisos y correos. Es el sub-proyecto 4. El texto **nuevo** que se escriba aquí no dice "Alma".
- Las pantallas detrás de funciones apagadas: lealtad, reseñas, tienda, visitas, plantillas de WhatsApp, bandeja y Wellhub. Heredan el marco nuevo automáticamente, pero no se rediseñan.
- La app de clienta (sub-proyecto 2) y la landing.
- Cambios de permisos en el servidor.

---

## 4. Marco común

### 4.1 Barra lateral (escritorio)

- Igual que hoy en orden y grupos (principal · Más · Sistema), blanca, con el logo HIVE completo arriba.
- Sección activa: fondo `canvas` y línea coral a la izquierda, como ya dice el sistema.
- El contador de Cobros va sobre coral y muestra los pagos por verificar (`pendingAlerts` de `GET /admin/stats`).
- Pie: avatar, nombre y rol ("Dueña", "Recepción", "Coach"), con "Ver sitio" y "Cerrar sesión".
- Se puede plegar, como hoy.

### 4.2 Barra superior (escritorio)

- **Buscador** de clientas: "Buscar clienta, clase o pago" pasa a decir **"Buscar clienta"**, porque sólo busca clientas. Usa `GET /users?role=client&search=`, espera 300 ms entre teclas y abre la ficha al elegir.
  - Se abre con ⌘K / Ctrl+K.
  - Resultados: nombre, email y teléfono, hasta 8. Sin resultados: "No encontramos a nadie con esos datos."
  - Se navega con teclado: flechas, Enter y Esc.
- **"Pasar lista"** (secundario) lleva a `/admin/pasar-lista`.
- **"Cobrar"** (principal) lleva a `/admin/payments`. Sólo lo ven dueña y súper admin.
- Se quita la migaja "ADMIN › Sección": la etiqueta del encabezado ya da el contexto.

### 4.3 Encabezado de pantalla

- Etiqueta arriba (`label`, p. ej. "Reservas · semana 39"), título `display-l` en mayúsculas y subtítulo opcional en `ink-muted`.
- A la derecha: pestañas de la sección y la acción principal de la pantalla.
- El contenido usa **todo el ancho** con márgenes de 32 px. Se acaba la columna angosta centrada.

### 4.4 Celular (< 768 px)

- Barra superior compacta. Muestra el símbolo HIVE en las pantallas de primer nivel y una flecha para volver en las demás, más el título, un botón de buscar y el avatar.
- Barra inferior de 5: Inicio, Reservas, Clases, Personas y Cobros (Cobros sólo para dueña). La activa lleva el ícono sobre coral; Cobros lleva su contador.
- Todo lo de escritorio se apila en una columna; los paneles de detalle se abren como pantalla completa.

### 4.5 Piezas compartidas nuevas

En `src/components/admin/`, con las mismas reglas del sistema (tokens, 44 px mínimo, bordes en vez de sombras):

| Pieza | Para qué |
|---|---|
| `AdminPageHeader` | Etiqueta + título + subtítulo + zona derecha |
| `AdminTopBar` | Buscador de clientas, "Pasar lista" y "Cobrar" |
| `ClientSearch` | El buscador con su lista de resultados (sirve también en Cobrar) |
| `KpiStrip` | Fila de cifras en una tarjeta con divisores |
| `Panel` / `PanelHeader` | Tarjeta blanca con título y enlace opcional |
| `SeatMeter` | Segmentos de ocupación (reservadas de cupo); llena se anuncia con texto, no sólo color |
| `StatusDot` | Estado con punto y palabra (Activa, Asistió, Cancelada…) |
| `PersonCell` | Avatar + nombre + línea secundaria |
| `MasterDetail` | Lista a la izquierda (400 px) y detalle a la derecha, con selección en la URL |
| `SettingsNav` | Menú vertical de Configuración |
| `SaveBar` | Aviso "Tienes cambios sin guardar" con Descartar y Guardar |

`SectionTabs` gana un contador opcional sobre coral y se usa a la derecha del título.

---

## 5. Pantallas

Cada pantalla conserva **todas** sus funciones, textos de estado y endpoints actuales salvo donde se dice otra cosa. Los estados de carga, vacío y error siguen la regla del sistema: esqueleto visible, mensaje honesto y reintento, sin disfrazar un fallo como vacío.

### 5.1 Inicio — `/admin/dashboard`

De arriba abajo:

1. **Encabezado** "Hoy en el estudio", con la fecha y la hora de la última actualización.
2. **Cifras**: Reservas hoy (de N lugares en N clases), Ocupación de la semana, Ingresos del mes y Membresías activas.
   - Ocupación e Ingresos sólo los ve la dueña.
   - Recepción y coaches ven "Clases hoy" y "En lista de espera hoy" en su lugar.
3. **Columna izquierda**
   - **Siguiente clase**: bloque negro con la hora grande, el tipo, la coach, la duración, "Llena · N/N" en coral cuando aplica, "N en espera", las iniciales de quienes reservaron, "Ver lista" y "Pasar lista".
     - Si ya no quedan clases hoy, el bloque dice "Ya no hay más clases hoy" y muestra la primera de mañana.
   - **Agenda de hoy**: el resto de las clases del día, con hora, tipo, coach, medidor de ocupación, N/N y un estado:
     - las que ya pasaron: "N asistieron · N faltas", atenuadas;
     - las llenas: "Llena" en coral;
     - las demás: "N lugares libres".
4. **Columna derecha**
   - **Por atender**, en este orden:
     - Pagos por verificar: número coral sobre `accent-soft`, el monto total y el botón "Revisar";
     - En lista de espera hoy;
     - Membresías por vencer en 7 días;
     - Cumpleaños de hoy, con cuántos hay en el mes.
     - Cada renglón lleva a su pantalla. Si no hay nada: "Todo al día".
   - **Últimas membresías**: 5 renglones con nombre, plan y estado, y el enlace "Todas".
5. **Gráficas** (sólo dueña)
   - "Ingresos · últimos 6 meses", con el mes actual en tinta y los anteriores en gris.
   - "Clientas por última visita", con 5 cubetas y el enlace "Ver en Reportes".

**Datos:**

| Qué | De dónde |
|---|---|
| Agenda, siguiente clase, reservas de hoy y lista de espera de hoy | `GET /admin/today-roster` |
| Pagos por verificar, clases de hoy y membresías activas | `GET /admin/stats` |
| Monto total de los pagos por verificar | La suma de los montos de las órdenes pendientes que ya carga hoy |
| Membresías por vencer | `GET /memberships?status=expiring` |
| Cumpleaños | `GET /admin/birthdays?month=` |
| Últimas membresías | `GET /memberships?limit=5` |
| Ingresos y última visita | `/reports/revenue` y `/reports/dormant` (sólo dueña) |

**Sale:** el botón "Pasar lista con cámara" (se va a Pasar lista), la cuadrícula de cumpleaños del mes (queda el renglón en Por atender y la lista vive en Clientas) y el texto "Reactivar por WhatsApp".

### 5.2 Reservas · Semana — `/admin/bookings`

- **Pestañas:** Semana · Hoy · pasar lista · Lista de espera (con su contador coral).
- **Navegación:** semana anterior, siguiente y "Hoy".
- **Izquierda:** tira de 7 días con el número de clases de cada uno, y la lista de clases del día elegido, con hora, tipo, coach, N/N o "Llena".
- **Derecha:** la lista de la clase elegida. Hoy es una segunda vista que reemplaza a la primera; ahora se ven juntas. Contiene:
  - Encabezado con fecha, hora, tipo y coach, y la nota "se actualiza sola cada 15 s".
  - Botones "Asignar socia" (principal), "Asignar visitante" y un menú "⋯" con "Cancelar clase" y "Actualizar".
  - Contadores: Confirmadas, Asistieron, En espera y Faltas.
  - Renglones con avatar (una palomita verde si ya asistió), nombre, plan, clases restantes, teléfono, estado y acciones:
    - "Check-in";
    - "Falta";
    - "⋯" con "Cancelar reserva (devuelve crédito)".
    - Las mismas reglas por estado que hoy.
  - Pie: el aviso "Cancelar una reserva devuelve el crédito, salvo que elijas lo contrario." y el botón "Cancelar clase" (peligro).
- **URL:** la clase elegida vive en `?clase=<id>`. Así "Abrir en Reservas" (Lista de espera) y "Gestionar en Reservas" (Calendario) abren esa clase directo; hoy llevan a la semana sin elegir.
- **Sin cambios:** los diálogos de cancelar reserva, cancelar clase, asignar socia (con acompañante) y asignar visitante conservan sus campos y flujos.

### 5.3 Reservas · Pasar lista — `/admin/pasar-lista`

- **Encabezado:** "Pasar lista", con el subtítulo "Marca asistencia con un tap. Se actualiza cada 30 segundos."
- **Barra de acciones:**
  - **"Escanear QR del pase"** (principal). Abre el mismo diálogo de cámara que hoy vive en Inicio (`CheckinScanner`), con su modo manual.
  - "Actualizar".
  - El reloj grande con la fecha.
- **La clase en curso o la siguiente**, abierta con borde de tinta:
  - Arriba: hora, tipo, coach, cupo y "N asistieron · N pendientes"; pendientes en `accent-strong`.
  - Alumnas en dos columnas, cada una con "Check-in" (principal) y el ícono de falta, que conserva su confirmación.
  - Quien ya asistió muestra "Asistió" en verde con palomita. La lista de espera no tiene acciones, igual que hoy.
- **Las clases siguientes**, plegadas: hora, tipo, coach, "N pendientes" y "Llena" cuando aplica. Se abren con un toque.
- **"Ya terminaron"**, al final, plegadas y atenuadas, con "N asistieron · N faltas".

### 5.4 Reservas · Lista de espera — `/admin/bookings/waitlist`

- Se vuelve pestaña de Reservas. Hoy sólo se llega escribiendo la URL.
- **Izquierda:** sólo las clases de la semana **que tienen gente esperando**, con fecha, hora, tipo, coach y "N en espera" en coral. Sale de `waitlist_count` (sección 6).
- **Derecha:** la lista de la clase elegida, en orden. Cada renglón lleva la posición grande, nombre, email, teléfono, plan y clases, y un botón de WhatsApp.
  - Arriba, "Abrir en Reservas" lleva a `/admin/bookings?clase=<id>`.
- Sigue siendo sólo de lectura, como hoy.
- **Vacío:** "Nadie en lista de espera esta semana."

### 5.5 Clases · Calendario — `/admin/classes`

- **Pestañas:** Calendario · Tipos de clase · Generar. Van a la derecha del título "Clases", con la etiqueta "Semana N · mes".
- **Barra:**
  - Semana anterior, siguiente, el rango y "Hoy".
  - El resumen "N clases · N reservas · N% ocupación".
  - "Limpiar semana" (fantasma), "Generar semana" y "Nueva clase".
- **Calendario por horas:** 07:00 a 21:00, 7 columnas.
  - La columna de hoy lleva el número sobre tinta.
  - Cada clase es un bloque con su posición y alto según la hora. Muestra tipo, N/N y "hora · coach", con una barra de ocupación abajo. El punto del tipo usa su color neutro de la paleta.
  - Llena: bloque coral con "hora · Llena". Cancelada: borde punteado y el nombre tachado. Ya pasó: atenuada.
  - La línea de la hora actual cruza la columna de hoy, con la hora marcada en el margen.
- **Al tocar una clase** se abre el **panel lateral actual**, con la misma información y acciones: cupo con − y +, inscritas, editar, cerrar, reabrir y cancelar.
  - Su encabezado adopta el resumen del lienzo: fecha y hora, tipo en `display-m`, coach, "Llena · N/N", "N en espera" y las iniciales.
  - "Gestionar en Reservas" abre esa clase (sección 5.2).
- **Semana vacía:** se mantiene el aviso "Semana sin clases" con "Generar semana", pero **arriba del calendario vacío**, que sigue visible para tocar un día y crear una clase.
- **Celular:** la tira de días y la lista del día de hoy se mantienen.

### 5.6 Clases · Tipos de clase — `/admin/class-types`

- **Tabla:**
  - "Tipo": una muestra del bloque como se ve en el calendario, con el punto de color y el nombre.
  - "Categoría", "Duración", "Capacidad" y "Estado", más el menú "⋯".
- **"Nuevo tipo" y "Editar"** abren el formulario en un **panel a la derecha de la tabla** (escritorio) en vez de un diálogo. En celular sigue como diálogo.
  - Campos iguales a hoy. El color se elige con tres opciones grandes: Tinta, Grafito y Concreto.
  - El interruptor "Activo" conserva el significado de hoy. No se agrega texto de ayuda porque hoy un tipo inactivo todavía se puede programar.

### 5.7 Clases · Generar — `/admin/class-generator`

- **Izquierda, arriba — "Horario oficial"** (la plantilla del estudio):
  - La línea de horarios, "Instructora", "Semanas a generar", "Aplicar y generar" y "Sólo guardar plantilla" (fantasma), con la ayuda "Elige una instructora para activar el botón."
- **Izquierda, abajo — "Crear clases en bloque"**, con los 4 grupos numerados de hoy:
  - Clase e instructora;
  - Rango de fechas;
  - Días de la semana, con los atajos "Lun a Vie", "Lun a Sáb", "Todos" y "Limpiar";
  - Horario y cupo.
- **Derecha, fija — "Vista previa"**:
  - Un mes con los días que se van a crear marcados en tinta, el conteo "N clases" y la línea de resumen.
  - El botón **"Generar N clases"** y la nota "Las clases que ya existan en ese horario no se duplican."
  - Hoy la vista previa es una cuadrícula de mosaicos debajo del formulario.
- **Arreglo:** la hora de fin debe ser posterior a la de inicio y la capacidad al menos 1. El botón se desactiva y el campo dice por qué.

### 5.8 Cobros · Cobrar — `/admin/payments`

- **Pestañas:** Cobrar · Verificar (con el contador coral) · Historial.
- **Una sola pantalla**, en vez de los 3 pasos:
  1. **Clienta**: `ClientSearch`. Al elegir, queda una ficha con nombre, email y teléfono, y "Cambiar".
  2. **Plan**: tarjetas agrupadas por categoría (Studio, Reformer & Tower, Mixtos, Otros paquetes), 3 por fila. Cada una tiene un botón de opción, el nombre, "N clases · N días" o "Ilimitado" y el precio. Se ocultan los planes inactivos, igual que hoy.
  3. **Método de pago**: Efectivo (predeterminado), Tarjeta y Transferencia, como tres opciones grandes.
- **Resumen fijo a la derecha**:
  - Clienta, plan, vigencia (hoy más la duración del plan), método y total en `display`.
  - El botón **"Confirmar y activar membresía"**, desactivado hasta tener clienta y plan.
  - La nota "La membresía se activa hoy y la clienta recibe su confirmación."
- **Renovar desde la ficha:** acepta `?clienta=<id>`. Carga la clienta con `GET /users/:id` y la deja elegida.
- **Sin cambios:** el mismo endpoint (`POST /memberships`), los mismos avisos y los mismos errores.

### 5.9 Cobros · Verificar — `/admin/orders`

- **Izquierda:** tabla con las pestañas "Por verificar" (contador) y "Todas".
  - Columnas: Clienta (con el método debajo), Monto, Estado y Fecha.
  - "Por verificar" va sobre `accent-soft`. "Esperando pago" lleva borde.
  - La fila elegida se marca con fondo `canvas` y una línea de tinta.
- **Derecha, fija (440 px):**
  - Número de orden, estado y la clienta.
  - El comprobante (miniatura, "Ver completo" y el visor de hoy). Si es PDF, un enlace; si no hay, "Sin comprobante adjunto".
  - **"Monto a verificar"** grande sobre `accent-soft`, con Plan, Método y Fecha.
  - "Notas internas (opcional)".
  - "Rechazar" (peligro) y "Aprobar" (principal), lado a lado.
  - La nota "Si la rechazas, le avisamos a la clienta por email y WhatsApp con el motivo."
  - El formulario de rechazo con motivo obligatorio se queda igual.
- **Pago con tarjeta:** se mantiene el aviso "Pago con tarjeta (automático)".
- **Celular:** el detalle se abre a pantalla completa, igual que hoy.

### 5.10 Cobros · Historial — `/admin/payments/historial` (nueva ruta)

- Hoy es una pestaña interna de Cobrar; pasa a su propia ruta para que funcione como pestaña hermana.
- **Tres cifras**, calculadas en el navegador con los mismos datos de `GET /payments`:
  - "Esta semana" (monto y número de pagos);
  - el mes actual (monto y número de pagos);
  - el mes actual por método.
- **Tabla:** Clienta, Fecha, Método (pill) y Monto.
- Sólo dueña, igual que hoy.

### 5.11 Personas · Clientas — `/admin/clients`

- **Pestañas:** Clientas · Coaches. Al lado, "Nueva clienta".
- **Buscador grande** con "Buscar por nombre, email o teléfono" y "N clientas registradas".
- **Tabla:** Nombre (avatar e iniciales), Email, Teléfono y "Clienta desde".
  - Acciones por fila: **WhatsApp** (sólo si hay teléfono) y "⋯" con Editar y Eliminar.
  - Tocar la fila abre la ficha.
- **Nueva clienta** y **Editar clienta** quedan como paneles laterales, con las mismas secciones y campos que hoy.
- **Arreglos:**
  - Si eliminar falla, la clienta ve el motivo que manda el servidor (tiene membresías o reservas). Hoy falla en silencio.
  - El error al registrar lee `message`. Hoy lee `error` y siempre muestra el texto genérico.
  - "Editar" carga la clienta completa con `GET /users/:id`, así la fecha de nacimiento, el contacto de emergencia y las notas de salud ya no abren vacíos.
- `?birthday=month` (el enlace desde Inicio) filtra a las que cumplen en el mes, con los datos de `GET /admin/birthdays`.

### 5.12 Personas · Coaches — `/admin/staff`

- **Tarjetas en 4 columnas**, en vez de la tabla.
  - Foto principal con su enfoque, o iniciales grandes sobre `sunken`.
  - Nombre, estado (Activa / Inactiva, atenuada), email y especialidades como pills.
  - El menú "⋯" con Editar, Subir foto principal, Subir 2ª foto, Magic link y Eliminar.
- **Magic link:** el aviso aparece arriba de las tarjetas, con "Copiar" y cerrar.
- **Sin cambios:** el formulario de crear y editar, con el enfoque de la foto.

### 5.13 Personas · Ficha de clienta — `/admin/clients/:id`

- **Encabezado:**
  - "← Clientas".
  - Foto grande con el botón de cambiar foto.
  - "Clienta desde {mes año}", el nombre en `display-l`, email y teléfono.
  - Pills del plan activo y las clases restantes, incluido el desglose de Studio y Reformer/Tower en planes mixtos.
  - A la derecha: "Llamar", "WhatsApp" y **"Editar"**, que abre el mismo panel de Editar clienta. Editar sólo lo ven dueña y súper admin, porque el servidor rechaza a los demás.
- **Pestañas:** Perfil, Membresías (N), Reservas (N), Pagos (N) y Responsiva.
  - **Lealtad se esconde** mientras `FEATURES.loyalty` esté apagada.
  - **Pagos se esconde** para recepción y coaches. Hoy les muestra un error por el 403.
- **Perfil:**
  - Datos: fecha de nacimiento con edad, contacto de emergencia y notas de salud.
  - "Cuestionario de ingreso": una lesión reportada se muestra en un recuadro con borde `danger`.
- **Columna derecha:**
  - **Membresía**: plan, estado, clases restantes en grande con su medidor y la fecha de vencimiento. Botones "Editar" (el diálogo actual de editar membresía) y **"Renovar"** (Cobrar con `?clienta=<id>`). Sin membresía activa: "Sin membresía activa" y "Vender plan".
  - **Próximas clases**: hasta 3 reservas futuras, confirmadas o en espera, de `GET /bookings?userId=`, y el enlace a la pestaña Reservas.
  - **Responsiva**: Firmada con fecha, o Pendiente.
- **Resto de pestañas:** mismas tablas, paginación, diálogo de editar membresía, descarga del PDF de la responsiva y estados vacíos de hoy.

### 5.14 Membresías — `/admin/memberships`

- **Pestañas subrayadas:** Todas, Activas, Por vencer (N) y Pendientes (N).
  - Sólo las dos últimas llevan contador, porque son las que piden atención y cuestan una consulta cada una.
- **Tabla:**
  - Clienta.
  - Plan, con la categoría debajo.
  - Estado:
    - "Activa" en verde;
    - "Pendiente pago" sobre `accent-soft`;
    - "Expirada" gris;
    - "Cancelada" en `danger`.
  - Vigencia: la fecha de fin con "desde {inicio}" debajo. Si vence en 7 días o menos, suma "· vence pronto" en `accent-strong`.
  - Clases: medidor y "restantes/total", o "Ilimitadas".
- **Menú "⋯":** Activar, Editar vigencia y Cancelar membresía, con los diálogos de hoy.

### 5.15 Planes — `/admin/plans`

- **Tarjetas agrupadas por categoría** (Studio, Reformer/Tower, Mixto, Todo), 4 por fila, en vez de la tabla.
  - Cada tarjeta: nombre, precio en `display`, el precio de apertura si existe, "N clases · N días", las reglas como pills y el estado.
  - Las reglas posibles: No transferible, No repetible, Sólo mañanas y Paquete de visitas.
  - Los planes inactivos se atenúan.
- **Menú "⋯":** Editar, Activar o Desactivar, y Eliminar. Se mantiene el caso especial de borrado en cascada.
- **Sin cambios:** el panel de crear y editar, con sus secciones Esencial, Reglas y Avanzado.

### 5.16 Descuentos — `/admin/discount-codes`

- **Encabezado:** "Descuentos", "Nuevo código" y el subtítulo que explica qué son.
  - Se quitan las pestañas Reportes · Descuentos: las dos pantallas ya están en el menú.
- **Tabla:**
  - Código en monoespaciada, con borde punteado y un botón para copiarlo.
  - Descuento, Canal, "Aplica a" y Vence.
  - Usos: "N/M" con una barra. La barra se vuelve coral y suma "· agotado" al llegar al máximo.
  - Estado y el menú "⋯".
- **Sin cambios:** el diálogo de crear y editar.

### 5.17 Reportes — `/admin/reports`

- **Encabezado:**
  - Etiqueta "Análisis · actualizado {hora}".
  - A la derecha: el periodo (Este mes, Últimos 30 días, Últimos 90 días, Año en curso) e "Imprimir".
- **Sugerencia:** sobre `accent-soft`. Se queda sólo la de alumnas perdidas (60+ días) → "Crear código de regreso". Las otras dos llevaban a una función apagada y salen.
- **Cifras:**
  - "Ingresos del periodo" grande, con el cambio contra el periodo anterior y la línea de 12 meses.
  - "Miembros activos", "Ocupación" y "Churn 30 d".
- **Tira de cifras:** Reservas, Canceladas, Nuevos miembros, Reseñas y Promedio.
- **Dos tarjetas:** Conversión de muestra a paquete y Clientas por última visita.
- **Detalle:** pestañas Ingresos, Clases, Retención, Top alumnas e Instructoras, con "Exportar CSV" donde hoy existe.
  - La gráfica aclara **"No depende del periodo elegido arriba"**, porque sólo las cifras de arriba cambian con el periodo.
  - Las gráficas siguen las reglas del sistema de gráficas: marcas delgadas, un solo eje, el último mes en tinta y los anteriores en gris, y etiqueta directa sólo en el último valor.

### 5.18 Configuración — `/admin/settings`

- **Menú vertical a la izquierda:** General, Pagos, Notificaciones, Políticas, WhatsApp y Seguridad.
  - La pestaña elegida se refleja en `?tab=`. Hoy sólo se lee al entrar.
- **General**, en tarjetas:
  - Datos del estudio;
  - Región (zona horaria y moneda);
  - los interruptores de precios de apertura y modo mantenimiento, cada uno con su explicación;
  - Media del lugar.
- **Barra "Tienes cambios sin guardar"**, con "Descartar" y "Guardar cambios". Aparece al editar y reemplaza el botón suelto.
- **Arreglo:** el formulario General vuelve a leer la configuración después de subir media. Hoy, guardar después de subir un archivo puede deshacer la subida.
- **Resto de pestañas:** mismos campos y comportamiento, con el mismo acomodo en tarjetas.
  - En Notificaciones sale el enlace a "Templates de WhatsApp", que lleva a una función apagada.

---

## 6. Cambios en el servidor

- **`GET /api/classes`** agrega `waitlist_count`: cuántas reservas de la clase están en `waitlist`. Es una subconsulta igual a la que ya calcula `live_current_bookings`. El endpoint es público; un conteo no expone datos personales.
- No hay endpoints nuevos. Todo lo demás usa los que ya existen:
  - "Renovar": `GET /users/:id`;
  - buscador: `GET /users?search=`;
  - próximas clases: `GET /bookings?userId=`;
  - totales del Historial: `GET /payments`.

---

## 7. Arreglos que entran

Son fallas que ya existen, pero caen en pantallas que se reescriben, así que corregirlas cuesta poco:

1. Clientas: el error al eliminar se muestra; hoy falla en silencio.
2. Clientas: el error al registrar muestra el mensaje real del servidor.
3. Clientas: "Editar" abre con todos los datos de la clienta.
4. Configuración: guardar General ya no deshace la media recién subida.
5. Generar: se valida que la hora de fin sea posterior a la de inicio y que la capacidad sea al menos 1.
6. Ficha: la pestaña Pagos se esconde para quien no puede verla.
7. Se quitan los cuatro enlaces que llevan a `/admin/whatsapp-templates` (404 con la función apagada): dos en las sugerencias de Reportes, uno en Inicio y uno en Notificaciones.
8. "Gestionar en Reservas" y "Abrir en Reservas" abren la clase indicada.

---

## 8. Roles

| Qué | Dueña / súper admin | Recepción / coach |
|---|---|---|
| Menú Cobros, botón "Cobrar", contador de Cobros | Sí | No |
| Ingresos, ocupación y gráficas en Inicio | Sí | No (ven "Clases hoy" y "En lista de espera hoy") |
| Reportes | Sí | No |
| Ficha: pestaña Pagos, botón "Editar" | Sí | No |
| Todo lo demás | Sí | Sí |

Es sólo lo que se muestra: el servidor ya protege esas rutas y no cambia.

---

## 9. Diferencias conocidas con el lienzo

- **Tocar una clase en el calendario:** el lienzo la dibuja como una tarjeta flotante. Se implementa como el panel lateral actual con ese encabezado, para no perder cupo, inscritas ni acciones.
- **Buscador:** el lienzo dice "Buscar clienta, clase o pago"; el texto final es "Buscar clienta" (sección 4.2).
- **Pie de la barra lateral:** el lienzo muestra sólo "Cerrar sesión"; también va "Ver sitio".
- **Datos:** los números, nombres y montos del lienzo son de ejemplo.
- **Funciones apagadas que siguen a la vista:** "Asignar visitante" (visitas), "Sólo guardar plantilla" (plantillas de horario) y el control de Wellhub en el panel de la clase aparecen aunque su función está apagada, igual que hoy. Queda pendiente decidir si se esconden como Lealtad.

---

## 10. Verificación

- **Suites existentes en verde**: `npm test` (frontend, servidor y scripts) y `npm run test:regression`.
- **Guardias del sistema** (sub-proyecto 1) en verde, sobre todo porque el código nuevo crea muchas piezas:
  - sin colores escritos a mano;
  - sin texto claro sobre coral;
  - sin la variante `accent` de botón en el panel;
  - sin coral como texto.
- **Pruebas nuevas:**
  - `GET /api/classes` devuelve `waitlist_count` correcto con reservas en espera, confirmadas y canceladas.
  - Cobrar con `?clienta=<id>` deja a la clienta elegida.
  - Recepción no ve Cobros, "Cobrar", ingresos, la pestaña Pagos ni "Editar" en la ficha.
  - La ficha no muestra Lealtad con la función apagada.
  - El buscador abre la ficha elegida y se maneja con teclado.
  - Reservas abre la clase de `?clase=`.
  - Configuración General no borra la media al guardar.
- **Barrido en navegador**: las 18 rutas en escritorio (1280 y 1440) y a 390 px, como dueña y como recepción.
  - Sin errores de consola, sin respuestas 4xx/5xx inesperadas y sin `undefined`, `NaN` ni pantallas en blanco.
  - Captura de cada una, comparada contra el lienzo.
- **Accesibilidad:** foco visible, navegación con teclado en el buscador, pestañas y paneles, y áreas de toque de 44 px.
- **Revisión adversarial del diff** antes de fusionar a `hive`.

---

## 11. Ramas y entrega

- `hive` se adelantó a `main` (sólo el merge del sub-proyecto 1). `hive-panel` sale de ahí, en el worktree `alma-hive-panel`.
- Se fusiona a `hive` tras la revisión. **Se pregunta antes de publicar en producción.**
- Orden sugerido para el plan, de modo que al final de cada paso el panel funcione completo:
  1. Marco común y piezas compartidas;
  2. Inicio;
  3. Reservas (Semana, Pasar lista, Lista de espera, con el cambio del servidor);
  4. Clases;
  5. Cobros;
  6. Personas;
  7. Membresías, Planes y Descuentos;
  8. Reportes y Configuración;
  9. Barrido en celular y arreglos finales.
