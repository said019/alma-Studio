# Cierre clases y coaches — 8 octubre 2026

Cambios locales, sin deploy ni escrituras productivas. Se conserva el cambio previo de Wellhub en ClassesCalendar. No se hicieron cobros ni se enviaron mensajes.

## Correcciones verificadas

- CC01: edición individual bloquea la fila y verifica ocupación dentro de la misma transacción. Carrera real devuelve409, conserva cupo8 y reservas2.
- CC02: creación, edición y generación usan lock transaccional compartido. Dos generaciones simultáneas devuelven created1 y0; existe una sola clase.
- CC03: coach eliminada no accede a roster ni check-in (403), ni se asigna a nuevas clases (409). Su historial permanece.
- CC04: instructor sólo edita sus clases estando activo; edición ajena403 y propia200. Alta de coaches es exclusiva de administración. Borrar clase individual o semana requiere ownerMiddleware; recepción403.
- CC05: valida fecha civil real, cupo entero positivo, horas y estado final en ediciones parciales. Datos inválidos400 sin persistir.
- CC06: clases con reservas no pueden cambiar horario, disciplina ni coach, individualmente o en lote. Se indica cancelar con devolución y crear otra clase; cupo y notas siguen editables. Esto evita un traslado silencioso, no implementa notificaciones de reasignación.
- CC07: endpoint legacy POST /admin/classes devuelve410 con ruta vigente indicada, ya no500.

## Pruebas ejecutadas

1. `node auditoria-estudio/2026-10-08/clases-coaches.verify.mjs`: PASS. Servidor real y PostgreSQL desechable sin credenciales externas. Verifica los siete cierres más CRUD válido, historial protegido, devolución única al cancelar y permisos positivos y negativos. Evidencia `clases-coaches-fixes.log`.
2. `node scripts/verify-bulk-classes.mjs`: PASS. Preview sin escritura, apply atómico, auditoría, lista de espera, permisos, preview obsoleto, carrera de reservas y edición concurrente. Evidencia `clases-bulk-fixes.log`.
3. Vitest GenerateClasses, ClassesCalendar, InstructorsList: 3 archivos / 10 pruebas PASS. Evidencia `clases-coaches-ui-fixes.log`. DOM con API simulada; no navegador productivo.

El cierre es local/API/PostgreSQL. No certifica entrega de correos ni integración externa. Se retiró el acceso de recepción al borrado físico; puede continuar operación diaria autorizada. Cancelar una clase con reservas preserva historial y devuelve crédito una sola vez.
