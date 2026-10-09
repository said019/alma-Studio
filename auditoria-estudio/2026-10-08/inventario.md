# Inventario — HIVE — 8 de octubre de 2026

## Identidad comprobada

- URL: https://hivestudio.com.mx y https://www.hivestudio.com.mx.
- Repositorio local: `/Users/saidromero/Alma Studio/alma-Studio`, origin `https://github.com/said019/alma-Studio.git`, main.
- HEAD/API version: `e76f73ff156d59f5feabe10dca67b1c6e8897a17`.
- Railway proyecto Hive studio; servicio alma-web; entorno production; deployment `e1003020-552f-4e70-8f60-70528cdd2efb` SUCCESS.
- Bundle servido `/assets/index-DIlZypn_.js`; hash documento HTML en production-readonly.json. No confundir con hash del archivo JS.
- React/TypeScript/Vite, Express Node, PostgreSQL; Mercado Pago, correo y componentes QR/Wallet. Nombre interno alma-movement no implica deployment equivocado: identidad contrastada con API/Railway.
- Sin AGENTS.md encontrado en recorrido inicial.

## Operación y exclusiones confirmadas

Catálogo productivo nueve planes: 1/4/10/20 clases, mensual, anual con pago mensual, horario especial, estudiante y personalizada. Promoción de apertura activa en catálogo consultado. Cuenta Mercado Pago propia de HIVE. No se leyeron ni imprimieron secretos.

Consulta productiva explícita BEGIN READ ONLY: database railway, role postgres, conexión administrativa UTC. API reporta pool/proceso/zona del estudio America/Mexico_City y matchesDb=true; no se interpreta UTC administrativo como bug de agenda. Conteos:9planes activos,0coaches activos,0clases futuras. cancellation_settings={max_cancellations:0}; no inferir semántica completa del número sin función que lo consume. No aplicar petición de3horas cancelada anteriormente.

Wallet Apple/Google oculto por usuario (QR mantenido), Wellhub desconfigurado/oculto, puntos desactivados y campañas por correo. No se reactivaron exclusiones ni se califican como fallos por faltar.

## Aislamiento y cambios

Todas las mutaciones se hicieron en PostgreSQL Embedded desechable/API loopback con variables mínimas, sin .env/credenciales externas. Fixtures sintéticas; API/DB detenidos en finally. Snapshot schema_complete.sql más bootstrap real; schedule_slots se preparó explícitamente en fixture por snapshot antiguo. **No demuestra migración autónoma limpia ni equivalencia de cada constraint de producción.**

Cambio previo del usuario en ClassesCalendar.tsx de7líneas conservado. Los tests frontend incluyen ese cambio; API fuente coincide con commit desplegado. Nuevos archivos: reportes/logs/scripts de auditoría y una prueba de componente. Sin cambios funcionales, commit ni deploy. La compilación local genera artefacto distinto al servido, no se publicó.

No hubo ventas/reembolsos reales, correos/WhatsApp ni fixtures productivas que limpiar. No se creó/validó backup ni restauración; ninguna afirmación de recuperación certificada. Pestaña temporal de navegador cerrada.

## Evidencia

- `frontend.log`:1358/1360 pasan,2fallan por mismo tamaño de letra Dashboard.
- `server-unit.log`:276pasan,1falla,2omitidos; total279. Fallo de expectativa medianoche Intl con Node25.9 local; producción runtime no reensayado.
- `types.log` y `build.log`:typecheck/build terminan0. Avisos Tailwind y bundle grande.
- `identity-api-retry.log`:41/41 regresiones de identidad, permisos y datos; primer intento429 conservado aparte, límites elevados sólo en proceso desechable.
- `hive-mp-audit.log`:36pruebas con proveedor ficticio, no certificación bancaria.
- `hive-sales-ui-audit.log` + `hive-sales-regression-audit.log`:32+2tests DOM, incluidas reproducciones de KPI y reintento.
- `hive-plan-promotions-audit.log`:verificador aislado PASS de precios/modos/edición/validaciones/enlaces.
- `hive-expiration-audit.log`:caducidad1hora y excepciones PASS.
- `clases-coaches-bulk.log`:bulk API/DB PASS; JSONL separado demuestra defectos individuales.
- `clases-coaches-ui.log`:10tests DOM. `reservas-creditos.md`:24unitarias/46DOM y JSONL de API.

Los conjuntos se superponen: **no sumar todas esas cifras como pruebas únicas**. Un reproductor que termina correctamente puede haber confirmado un bug; exit0 no significa aplicación aprobada.
