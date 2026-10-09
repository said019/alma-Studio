from pathlib import Path
import re,json,collections
root=Path(__file__).parent
refs=Path('/Users/saidromero/.codex/skills/pilates-studio-auditor/references')
rows={}
for l in (refs/'matriz-escenarios.md').read_text().splitlines():
 p=[x.strip() for x in l.split('|')]
 if len(p)>=7 and re.fullmatch('[A-L][0-9]+',p[1]): rows[p[1]]={'id':p[1],'dominio':p[1][0],'escenario':p[3],'severidad':p[5],'estado':'❓','evidencia':'Sin prueba integral en este corte; requiere fixture y recorrido correspondiente.'}
for m in re.finditer(r'^### (EC\d+) — (.+?) ([🔴🟠🟡⚪])$',(refs/'edge-cases.md').read_text(),re.M):
 id,title,sev=m.groups();rows[id]={'id':id,'dominio':'EC','escenario':title,'severidad':sev,'estado':'❓','evidencia':'Sin prueba específica suficiente en este corte.'}
def put(ids,state,evidence):
 for id in ids.split(','):
  assert id in rows,id
  rows[id].update(estado=state,evidencia=evidence)
# Individual evidence supplied by agents; later explicit decisions override abbreviated tables.
for filename in ['clases-coaches.md','ventas-ingresos.md','reservas-creditos.md']:
 for l in (root/filename).read_text().splitlines():
  p=[x.strip() for x in l.split('|')]
  if len(p)<5:continue
  ids=p[1].split(',')
  if not all(x in rows for x in ids):continue
  s=p[2]
  if 'Delegado' in s:continue
  state='⚠️' if s.startswith('Parcial') else '✅' if s.startswith('Cubierto') else '➖' if s=='NA' else '❓'
  put(p[1],state,p[3]+' Ver '+filename+'.')
put('A1,A5','⚠️','Navegador registro país/día/mes/año correcto; API acepta teléfono inválido/terms=false/password débil. identidad-seguridad.md ID01.')
put('A3,A4,A9,L2,L3','⚠️','41 regresiones API/PG identidad pasan: perfil, consentimiento/retirada y anonimización; entrega externa y recorrido completo de usuario no certificados. identity-api-retry.log.')
put('A6','❓','Registro de menor201 demostrado; falta política explícita del estudio/tutor para evaluar corrección.')
put('A8,EC14','➖','Trial no forma parte del catálogo actual solicitado; paquetes anteriores eliminados por instrucción del usuario.')
put('EC15','✅','API/PG: baja con membresía activa/reserva futura409 sin cambios; baja sin compromisos anonimiza y preserva contabilidad.41regresiones identidad.')
put('I1','❌','CC01 cupo1 con2reservas; CC02 generación duplicada; CC05 horarios/cupos inválidos. Clases-coaches API/PG.')
put('I3','⚠️','ClientDetail DOM y asignación API verifican saldo y venta; búsqueda completa por teléfono/historial UI no ejercida.')
put('I4','⚠️','Venta existente→paquete→reserva funciona API admin/recepción; retry duplica venta P0. Alta reclamada y retroactividad no completas.')
put('I5','⚠️','Cortesía exige motivo y pruebas membershipAdmin pasan; ajustes completos/ledger no ejercidos por navegador.')
put('I7','⚠️','Recepción no ve finanzas (41regresiones pasan); instructor opera clase ajena y coach eliminada mantiene acceso CC03/04. Política de roles amplia requiere decisión.')
put('I9','⚠️','Producción setting max_cancellations=0; editor completo y todos límites no ejercidos; no se aplicó pedido cancelado de3h.')
put('C3,B11','❌','No-show aceptado3días antes y desde waitlist, RC01 reproducido API/PG.')
put('B5','⚠️','Promoción automática una vez verificada en API; entrega durable del aviso no certificada. No se exige aceptación según política actual.')
put('B8','⚠️','API bloquea sinpaquete403 y futuro/horario inválido; CTA renovación navegador no certificado.')
put('G7','⚠️','QR web presente en código/UI tests globales; no lector físico ni recorrido de escaneo navegador con API real.')
put('L4','⚠️','Rate limit devolvió429 durante primer harness; límites elevados sólo en repetición local. No prueba distribuida/abuso completa.')
put('L5','❌','Registro débil/teléfonoabc201; fecha imposible500; clases cupo negativo/horas invertidas201. ID01/CC05.')
put('L6','⚠️','Firma/monto/moneda/propietario y estados MP probados con proveedor ficticio; webhook real no enviado.ventas-ingresos.md.')
put('L8','⚠️','Variables de proveedor configuradas en servidor; chequeos estáticos credenciales pasan. No auditoría completa de almacenes/cifrado/logs históricos.')
put('H1,H3,H4,H6','⚠️','Hooks y pruebas existentes en suite; cancelación/promoción/API funcionan. No entrega externa ni validación durable completa por destinatario.')
put('H9','❌','Audiencias all/with_active_membership/without_membership omiten receive_promotions; gap de código CO01.')
put('H10','⚠️','Campañas enviadas en bucle de request sin outbox durable por destinatario CO02; no extrapolar a todos canales.')
put('EC6','⚠️','Zona estudio API/CDMX verificada; conexión DB administrativaUTC no es zona pool app. Test medianoche falla local Node25.9; no certifica todosjobs.')
put('EC26','⚠️','Regresión seed no sobrescribe password y ediciónpromociones pasan; reinicio con valores operativos personalizados no ejercido completo.')
# Excluded features are NOT asserted to be broken and are not silently removed from denominator.
put('G1,G2,G3,G4,G5,G6,EC17','❓','Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto.')
put('F6,K6,EC19','❓','Excluido por usuario: Wellhub desconfigurado/oculto; no probar ni reactivar agregadores.')
put('B14,I10,L1,EC20,EC24,EC29','❓','Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede.')
assert len(rows)==len(set(rows))
data=list(rows.values());(root/'cobertura.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
states=['✅','⚠️','❌','➖','❓']
score=['| Dominio | ✅ | ⚠️ | ❌ | ➖ | ❓ | Cobertura | Semáforo |','|---|---:|---:|---:|---:|---:|---:|---|']
for dom in list('ABCDEFGHIJKL')+['EC','Global']:
 subset=[r for r in data if dom=='Global' or r['dominio']==dom];n=collections.Counter(r['estado'] for r in subset);den=len(subset)-n['➖'];percent=100*(n['✅']+.5*n['⚠️'])/den if den else 0
 critical=any(r['severidad']=='🔴' and r['estado']=='❌' for r in subset)
 color='🔴' if critical or percent<60 else '🟡' if percent<85 or any(r['severidad']=='🔴' and r['estado']=='⚠️' for r in subset) else '🟢'
 score.append('| '+dom+' | '+' | '.join(str(n[s]) for s in states)+f' | {percent:.1f}% | {color} |')
text='# Cobertura trazable — HIVE, 2026-10-08\n\nMatriz completa inventariada; ejecución parcial y por capas. ✅ demostrado en capa indicada, ⚠️ parcial o con brecha, ❌ contrato roto, ➖ noaplica confirmado, ❓ sin evidencia suficiente/excluido. El porcentaje NO significa tasa de pruebas que pasan ni porcentaje libre de errores en producción. Las filas amplias sólo se marcan completas si la evidencia cubre su contrato. No se multiplican conteos por regresiones RG.\n\n'+ '\n'.join(score)+'\n\nFórmula: (✅ + 0.5 × ⚠️)/(total − ➖). Denominador incluye noverificados y exclusiones. IDs extraídos de referencias reales, no del índice desactualizado. '+str(len(data))+' IDs únicos, sin duplicados.\n\n| ID | Escenario | Estado | Evidencia/límite |\n|---|---|---|---|\n'
for r in data:text+='| '+r['id']+' | '+r['escenario']+' | '+r['estado']+' | '+r['evidencia'].replace('|','/')+' |\n'
text+='\n## Pendientes para cerrar ❓\n\n'
for r in data:
 if r['estado']=='❓':text+=f"- **{r['id']}** — {r['escenario']}: {r['evidencia']}\n"
text+='\nPara cerrar evidencia externa: entorno de prueba de proveedor, webhook entregado y retorno en dispositivos reales; backup con restauración aislada; escenarios sintéticos de cada reporte y confirmación de políticas de menores/multisede. No se requiere reactivar Wallet/Wellhub excluidos para corregir operación actual.\n'
(root/'cobertura.md').write_text(text)
(root/'scorecard.md').write_text('\n'.join(score)+'\n')
print('\n'.join(score));print('IDs',len(data))
