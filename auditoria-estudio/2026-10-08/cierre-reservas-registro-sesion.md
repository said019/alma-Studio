# Cierre de correcciones: reservas, registro y sesión

Validación local en PostgreSQL desechable y API real, sin modificar producción ni contactar proveedores.

## Correcciones verificadas
- No-show rechaza clase futura y lista de espera; clase iniciada acepta marca e idempotencia al repetir.
- Invitado con pase incluido no consume crédito regular; cancelar no crea créditos. Nueva reserva reutiliza el pase liberado.
- Fallo al vender plan incompatible desde visita revierte perfil de invitado creado en la transacción.
- Registro valida contraseña, consentimiento, teléfono internacional y fecha real en servidor. Cuatro solicitudes inválidas devuelven400 y registro internacional válido201.
- Respuestas retrasadas200/401/503 de sesión anterior no sobrescriben login nuevo; logout no revive al recibir auth/me. Interceptor401 compara el token enviado antes de cerrar sesión.
- Etiqueta de Dashboard sube a12px y pasan las dos suites visuales antes fallidas.

## Evidencia
- `booking-fixes-verification.log`: AUDIT COMPLETE, incluye concurrencia último cupo, doble cancelación/promoción, venta→asignación, invitado y rollback.
- `registration-fixes.log`: 1 prueba unitaria con casos válidos e inválidos, aprobada.
- `session-dashboard-fixes.log`: 4 archivos,316 pruebas aprobadas.

No se certifican cobros reales ni notificaciones. Log aislado señala error preexistente del job Motivation `extract(unknown, integer)`; ajeno a las regresiones aprobadas. Los marcadores de pases incluidos se guardan para nuevas reservas; historiales previos sin marcador requieren conciliación por ruta porque el walkin antiguo consumía crédito y otras rutas no.

## Regresión de revocación cerrada

El lookup de accountGate tenía una referencia inexistente `queryable` en lugar de `pool`, ocultada por manejo fail-open. Se corrigió la referencia y se eliminó fail-open: errores se propagan a authMiddleware, que devuelve503 sin cerrar sesión ni permitir acceso. Prueba real aislada fuerza fallo de consulta:503 y recuperación200 con el mismo token al restaurar la columna. Baja de usuario conserva revocación inmediata401, inclusoUUID con mayúsculas.

Evidencia final: `identity-fixes-final.log`41/41; `account-gate-fixes.log`6/6. Fixtures adaptadas al contrato actual de registro y a la restricción de clases duplicadas. Scriptidentity ahora falla su proceso si alguna regresión falla.

Baja también anonimiza contactos copiados en `email_campaign_deliveries`: correo vacío, nombreNULL, trabajo pendiente marcado skipped y lease/claim liberados; evidencia accepted permanece como estado histórico. Regresión cubre queued/retry/sending/accepted y mantiene41/41 aprobadas después del cambio.
