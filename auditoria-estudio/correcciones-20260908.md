# Correcciones de la auditoría — Alma Movement · 8 sep 2026

Rama `fix/auditoria-20260908` (worktree aislado, base desechable propia). **Sin desplegar y sin fusionar.**
Diagnóstico original en [reporte.md](reporte.md) — este documento no lo sustituye, lo continúa.

---

## Qué cambia para la dueña

| Antes | Ahora |
|---|---|
| Un paquete de 8 clases rendía **4**: reservar cobraba un crédito y asistir cobraba otro | Una clase = **un** crédito |
| El dashboard mostraba **$0 de ingresos y 0 reservas del día**, todos los días | Muestra lo que pasó hoy, incluido hoy |
| Lo cobrado en efectivo o transferencia **no aparecía** en el reporte de ingresos | Cada venta de mostrador genera su orden aprobada, con método y quién la registró |
| Cambiar la contraseña de admin se **revertía en cada deploy**, y la contraseña estaba en el repositorio | La cuenta existente nunca se toca; crear una nueva exige `ADMIN_PASSWORD` |
| Banco, titular, cuenta y CLABE reales **en el código** | En entorno o en el panel, con aviso de arranque si faltan |
| Recepción veía ingresos, reportes y datos bancarios | Recepción opera el estudio; el dinero es sólo de la dueña — en el API y en el menú |
| Editar el nombre de una instructora **borraba** su correo, teléfono y bio | Sólo cambia lo que mandas |
| "Cerrar clase" y "Reabrir clase" daban error siempre | Funcionan |
| La ocupación del panel salía al **doble** | Coincide con las reservas reales |
| Un enlace mal formado devolvía "Error interno" | Devuelve un mensaje claro |

---

## Agrupado por causa raíz

No se hicieron 340 arreglos: se hicieron **9**, porque los síntomas venían de pocas causas.

| # | Causa raíz | Cerraba | Cómo |
|---|---|---|---|
| 1 | Dos dueños del débito de crédito: la app al reservar y un trigger al hacer check-in | P0-1 | `DROP TRIGGER trigger_decrement_classes` — la app queda como única vía |
| 2 | Dos dueños del contador de cupo: el trigger y 8 ajustes manuales | P1-6 | Se quitan los ajustes manuales; el trigger queda como único dueño y la migración repara el desfase |
| 3 | El rango de reportes cerraba en la medianoche de hoy y usaba `toISOString()` (UTC) | P0-2 | Fecha civil local y extremo superior al final del día |
| 4 | Los ingresos se suman sobre `orders`, pero la venta manual no creaba orden | P0-3 | La venta de mostrador crea su orden aprobada en la misma transacción |
| 5 | `adminMiddleware` no distinguía operar de ver dinero | P1-1, ayuda a L2 | `ownerMiddleware` en 13 rutas + menú y dashboard filtrados por rol |
| 6 | Los PUT eran de reemplazo, no de actualización parcial | P1-2 | `COALESCE` y flags atados a lo que trae el cuerpo |
| 7 | Sin manejo del error de parseo del body | P2 (94 rutas) | El manejador global mapea `entity.parse.failed` a 400 |
| 8 | Parámetros de ruta sin validar llegaban crudos a Postgres | P2 (~236 sondas) | `app.param` valida los 5 nombres que sí son UUID |
| 9 | El enum `class_status` no tenía el valor `'closed'` que el código escribía | P1-3 | Se añade el valor |

---

## Revisión adversarial del diff (misma fecha)

Revisé mi propio diff buscando refutarlo. **Encontró 7 regresiones que yo mismo introduje**, todas reproducidas antes de aceptarlas:

| # | Qué rompí | Consecuencia si se hubiera fusionado |
|---|---|---|
| R1 | `schema_complete.sql` seguía creando `trigger_decrement_classes`, y `db-apply-schema.cjs` lo reaplica siempre. La migración nueva no estaba en ningún camino automático | **Toda instalación nueva reinstalaba el doble cobro.** El arreglo estrella sólo funcionaba en mi base, porque yo apliqué la migración a mano después |
| R2 | `class_limit = COALESCE(...)` volvía NULL irrepresentable | Un plan **ya no podía volver a ser ilimitado**: el formulario manda `null` y el servidor lo ignoraba con un 200 |
| R3 | `POST /api/admin/clients/manual` es la **otra** vía de venta de mostrador y seguía sin generar orden | Ese dinero seguía fuera del reporte: arreglé el P0-3 a medias |
| R4 | `/api/admin/stats` pasó entera a `ownerMiddleware`, pero también trae clases de hoy, membresías activas y órdenes pendientes | Recepción veía **ceros presentados como hechos** en vez de sus contadores |
| R5 | El harness llevaba escrita la contraseña que `seguridad.test.mjs` prohíbe, y dependía de una cuenta que el servidor ya no siembra | **La suite fallaba en una base limpia** — mis 34 verdes eran sobre una base que ya traía el admin viejo |
| R6 | El cast a `jsonb` en el PUT de instructoras | 500 donde `specialties` es TEXT (`index.js` crea la tabla así como respaldo) |
| R7 | `days` en milisegundos con `to = now` | Después del mediodía el período previo salía un día más largo: los deltas quedaban torcidos — el mismo tipo de bug que acababa de arreglar |

Las siete están corregidas y cubiertas por 11 pruebas nuevas (`instalacion.test.mjs`, `revision.test.mjs`).

**La lección**: los tres primeros arreglos parecían verdes porque los verifiqué sobre una base que yo mismo había preparado paso a paso. La verificación honesta es **una instalación desde cero con el aplicador real**, y eso es lo que ahora hacen las pruebas.

## Estado de las pruebas

| Suite | Antes | Ahora |
|---|---|---|
| `server/tests/*.test.mjs` (regresión, 45 casos) | 24 en rojo (+ 4 y 7 más tras la revisión) | **45/45 verde sobre una instalación nueva** |
| `npm test` — frontend | 19/19 | 19/19 |
| `npm test` — servidor (38 casos) | **no se ejecutaban** | 38/38, ya incluidos en `npm test` |
| Barrido de 245 rutas × 4 roles (923 llamadas) | **342 respuestas 5xx** | **6**, todas `503 Google Wallet no configurado` (proveedor apagado) |
| Recepción en rutas de finanzas | `200` | `403` |
| Concurrencia (última cama, doble reserva, cancelación ×5) | sin sobreventa, contador desfasado | sin sobreventa, **contador 3 = 3** |
| Navegador: 28 rutas del panel | 27 limpias | 27 limpias, sin regresión |

Comandos: `npm test` · `npm run test:regression` (requiere API viva y base desechable).

La corrida decisiva es sobre una base creada con `node scripts/db-apply-schema.cjs`, no sobre una preparada a mano: es la única que demuestra que una instalación nueva no trae el doble cobro de vuelta.

---

## Decisiones que tomé (y por qué la conservadora)

1. **El débito se queda al reservar, no al asistir.** Ambas son defendibles. Elegí conservar la de la app porque es transaccional, ya está protegida contra carreras y la clienta ve el saldo bajar cuando aparta el lugar. Quitar el trigger es un cambio de una línea; mover el débito al check-in habría tocado seis rutas.
2. **`orders` es la única fuente de ingresos.** La tabla `payments` estaba muerta (0 lecturas, 0 escrituras). Revivirla habría creado dos verdades; hacer que la venta manual escriba en `orders` usa el camino que el reporte ya lee, y sigue el patrón que `visit-sale` ya tenía.
3. **El método de pago pasa a ser obligatorio.** El default anterior (`"efectivo"`) ni siquiera era un valor válido del enum y devolvía 500. Poner `"cash"` por default habría registrado como efectivo lo que quizá fue transferencia: es preferible un 400 explícito a un dato contable equivocado.
4. **Los datos bancarios vacíos avisan en consola.** Sacarlos del código deja la pantalla de transferencia en blanco hasta que se capturen. Preferí que se note al arrancar antes que dejar la CLABE de una persona real en un repositorio.
5. **Recepción pierde acceso a finanzas, no a la operación.** Conserva roster, clientas, órdenes, clases, POS y check-in.

---

## Qué queda abierto (y por qué)

Estos eran hallazgos del reporte que **no** toqué, porque son decisiones de producto, no defectos:

- **D9 — dos paquetes activos a la vez.** El sistema descuenta del más antiguo (regla correcta), pero permite apilar dos idénticos sin avisar. Falta definir la política: ¿el nuevo empieza al vencer el anterior, o suman?
- **B5/H4 — la lista de espera no promueve sola.** El estado existe y funciona; falta decidir la ventana de confirmación.
- **E6 reembolsos, D7 congelamiento, C4 reagendado, A9/L3 ARCO, K7 export, A10 merge de duplicados, I8 log de auditoría, I11 ledger de créditos.** Son funciones que no existen; construirlas excede "arreglar lo que está roto".
- **`payments` sigue siendo tabla muerta.** La dejé así a propósito (decisión 2). Conviene borrarla o poblarla, pero no a medias.

## Hallazgos nuevos que aparecieron al corregir

1. **`adminMiddleware` también dejaba pasar a `instructor`** con acceso total. Al separar `ownerMiddleware` quedan fuera de finanzas, pero siguen teniendo el resto del panel: hay que decidir su alcance real.
2. **`indexHtmlExists` se calcula una sola vez al arrancar.** Si el build termina después de que el servidor arrancó, sirve `503 Frontend build missing` para siempre. Me pasó en esta sesión.
3. **Un 401 dispara un bucle de reintentos sin fin.** Con un token inválido en `localStorage` conté **14 473** peticiones 401 seguidas. Falta cortar el reintento y mandar al login.
4. **`PUT /api/settings/:key` acepta un cuerpo vacío** y sobrescribe la configuración. No lo toqué, pero merece la misma protección de PUT parcial que instructoras y planes.

## Correcciones a mis propios guiones (no al producto)

- `POST /api/bookings` devuelve `{ booking }`, no `{ data }`: mi harness leía mal el id (RG72).
- Las suites comparten base, así que la prueba de ingresos falla en paralelo y pasa en serie. `test:regression` corre con `--test-concurrency=1`.
- `pagos.mjs` sigue reportando "pago registrado: NINGUNO" porque mira la tabla `payments`. Esa expectativa quedó obsoleta con la decisión 2 (RG71): el rastro contable ahora está en `orders`.

## Qué NO se verificó

Stripe, WhatsApp, email, Apple/Google Wallet y Wellhub reales (proveedores apagados) · la base de producción · restauración de respaldo · cobros ni reembolsos reales · los crons con el paso del tiempo · dispositivos físicos.

## Antes de desplegar

1. Definir `ADMIN_PASSWORD` o la cuenta de admin no se creará en una instalación nueva (la existente conserva su contraseña).
2. Capturar los datos bancarios en el panel, o definir `BANK_NAME`, `BANK_ACCOUNT_HOLDER`, `BANK_ACCOUNT_NUMBER`, `BANK_CLABE`.
3. Aplicar `supabase/migrations/20260908_fix_doble_descuento_y_contador.sql` **antes** de arrancar el código nuevo.
4. Rotar la contraseña de admin: la anterior estuvo en el repositorio y sigue en el historial de git.
5. Reconstruir el frontend: lo desplegado era de junio.
