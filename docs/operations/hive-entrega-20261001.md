# Aplicación de información HIVE — 1 de octubre de 2026

Fuentes: imagen de precios, texto de información para la app y carta PDF entregados por el usuario. La entrega incluye los cambios de catálogo, consentimiento y pago integrado. El estado del despliegue se documenta al terminar las verificaciones de producción.

## Catálogo

| Plan | Regular | Apertura | Vigencia y condiciones |
| --- | ---: | ---: | --- |
| 1 Clase | $330 | $290 | 1 sesión, 30 días |
| 4 Clases | $1,200 | $1,080 | 4 sesiones, 30 días |
| 10 Clases | $2,700 | $2,200 | 10 sesiones, 30 días |
| 20 Clases | $4,400 | $4,000 | 20 sesiones, 60 días |
| Plan mensual | $4,800 | $4,200 | 1 sesión diaria, 2 guest pass, 30 días |
| Plan anual / pago mensual | $4,200/mes | $3,900/mes | 2 sesiones diarias, 2 guest pass por periodo mensual, 1 café regular al día, compromiso de 12 meses |
| Horario especial | $250 | — | 1 sesión, lunes a viernes, inicio de 11:00 a 16:00, 30 días |
| Promo estudiante | $250 | — | 1 sesión, credencial verificada vigente, cualquier horario, 30 días |
| Personalizado | $500 | — | 1 a 1, lunes a viernes, inicio de 11:00 a 16:00, 30 días |

El editor permite configurar precio regular/promocional, duración, total de clases, límite diario, disciplina, días y franja horaria, sesiones individuales, credencial, pases y su periodo, café diario, periodicidad de cobro, compromiso, renovación y enlaces de pago. Las reglas de HIVE prohíben transferir clases y extender vigencias. Los cambios de reglas afectan a las membresías vinculadas: el panel lo explica.

Las restricciones se comprueban en servidor y base de datos, incluyendo solicitudes simultáneas y promociones desde lista de espera. Se cuentan las faltas y cancelaciones tardías; salir de una lista de espera o una cancelación del estudio no consume el límite diario. Se conservan los saldos y vencimientos independientes de cada compra. El perfil administrativo permite verificar credenciales y registrar el café entregado.

## Información y firma

- Mercado Pago y CLABE suministrada, sin inventar titular ni mezclar datos bancarios anteriores.
- WhatsApp, horarios regulares y especiales, dirección, estacionamiento, 21 preguntas frecuentes y 7 reglas.
- Cancelación/reagenda hasta 12 horas antes, tolerancia de acceso de 5 minutos, sin prórrogas.
- Responsiva v3 del documento entregado y acceso al PDF original; se conservan los textos v1/v2 para firmas anteriores.
- Firma durante la inscripción y antes de vender/comprar; recepción puede recoger la firma digital del cliente. En visitas se exige constancia de firma presencial y conservación del documento original.
- Contacto de emergencia y campos médicos del documento; datos médicos opcionales con autorización expresa. La revocación limpia los datos de perfil y carta en una transacción.

## Límites operativos y aplicación

Se añadió el formulario integrado de Mercado Pago basado en la última experiencia de Bao, con sincronización y webhook firmado, validación de cuenta/importe y activación transaccional. Falta confirmar la cuenta receptora y conectar sus credenciales para habilitarlo. Los enlaces del plan anual conservan verificación administrativa; abrirlos no confirma el pago y el sistema no ejecuta sus cargos recurrentes. Consulta [configuración de Mercado Pago](./hive-mercadopago.md).

Para instalaciones existentes, la estructura se prepara al iniciar la app. La reconciliación del catálogo requiere ejecutar primero la simulación y después `scripts/sync-hive-conditions.mjs --apply` contra la base elegida. Preserva los identificadores e historial, retira los productos anteriores reconocidos y conserva planes personalizados ajenos al catálogo. Los datos bancarios proporcionados se aplican una sola vez al arrancar la nueva versión, guardando la configuración anterior en la base.

Consulta [operación y migración](./hive-plan-conditions.md) para los detalles de despliegue y renovación. Las verificaciones se realizaron únicamente en una base local aislada con datos sintéticos; no se cobraron pagos reales ni se abrieron los enlaces para efectuar transacciones.

## Verificación final

- Interfaz: 114 archivos, **1,308 pruebas aprobadas** en ejecución completa; verificaciones dirigidas posteriores cubren estados de devolución y reintento.
- Servidor: **250 pruebas unitarias aprobadas** en ejecución completa; suite Mercado Pago posterior **5/5**, incluyendo bloqueo de pagos de prueba en producción.
- Scripts: **5 pruebas aprobadas**.
- Regresión HTTP general actualizada: **245/245 aprobados**, incluyendo 9 casos independientes de Mercado Pago contra PostgreSQL y proveedor simulado.
- Reglas PostgreSQL y concurrencia: **11/11 aprobados**, ejecutados explícitamente contra la base QA.
- Flujo cliente HTTP: **1/1 aprobado**, incluyendo firma, compra estudiantil bloqueada sin credencial y permitida con verificación, selección de otra membresía elegible y correspondencia entre importe y enlace de Mercado Pago.
- TypeScript, compilación de producción y `git diff --check` completados correctamente.
- Tres subagentes participaron en implementación y revisión cruzada; se inspeccionó el catálogo y editor anual en navegador local.

Las pruebas que necesitan base de datos se omiten deliberadamente en los comandos unitarios normales; aquí se ejecutaron por separado con sus variables QA explícitas. No se han realizado cargos reales ni recibido webhooks reales de Mercado Pago. Se verifican firma y conciliación con datos simulados.

## Verificación adicional del cobro integrado

El smoke HTTP del servidor completo (`server/tests/hive-mercadopago-http.smoke.mjs`) utiliza una base temporal independiente y bloquea la red saliente. Validó firma previa, dos envíos simultáneos con una sola llamada al proveedor ficticio y una única membresía activa de 20 clases, 60 días, tras sincronizaciones repetidas. La base y el proceso se eliminaron al terminar. No se usaron credenciales ni tarjetas reales.
