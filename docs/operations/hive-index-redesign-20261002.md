# Inicio público HIVE — 2 de octubre de 2026

Rediseño editorial arena/oliva basado en la marca del material de HIVE. Portada con abeja, composición adaptable, oferta exclusiva de Pilates Reformer y contacto simplificado. El CSS queda limitado a `.hive-landing`; el acceso y la app conservan su tema.

El catálogo usa precios y reglas de la API, agrupados en sesiones, membresías y especiales. El mensual se clasifica como membresía por su límite diario incluso cuando su pago es único. Las condiciones completas siguen visibles, incluido el compromiso anual de 12 meses.

El inicio ya no consulta ni anuncia tipos de clase heredados. El calendario muestra Reformer/personalizadas programadas, calcula fechas en CDMX, refresca el reloj y respeta el cierre de reserva de dos horas.

## Verificación

- Suite frontend completa: 1,316 pruebas pasaron; una expectativa antigua de metadatos aún decía «clase muestra». Se actualizó a «primera clase».
- Reejecución focalizada después de corregir metadatos y tema inicial: 192/192 pruebas pasaron (8 archivos).
- TypeScript sin errores y compilación Vite correcta.
- Revisión independiente de contenido, enlaces, condiciones y accesibilidad con subagentes.
- Navegador con catálogo público real mediante proxy temporal de sólo lectura: escritorio, tableta 768 px, móvil 390 px y 320 px. Comprobados menú móvil, pestañas, precios/condiciones y registro con retorno a checkout. Desbordamiento de calendario a 320 px corregido; ancho de contenido igual al viewport.
- No se enviaron registros ni pagos durante la prueba visual. No se modificaron datos del catálogo ni credenciales de Mercado Pago.
