import { campaignKey, completeCampaign } from '@/lib/campaign-intent';
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, MessageSquare, Send, Users } from "lucide-react";

// Los enlaces de los mensajes apuntan al propio origen de la app, nunca a un
// dominio cableado: las plantillas heredadas enviaban a pilatesroom.com.mx,
// el sitio de otro estudio del linaje.
const APP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

type Audience =
  | "accepts_communications"
  | "with_active_membership"
  | "without_membership"
  | "all";

const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: "accepts_communications", label: "Aceptan comunicación", hint: "Solo usuarios que marcaron recibir promociones" },
  { value: "with_active_membership", label: "Con membresía activa", hint: "Con paquete vigente y autorización para promociones" },
  { value: "without_membership",     label: "Sin membresía activa", hint: "Sin paquete y con autorización para promociones" },
  { value: "all",                    label: "Todos los suscritos",    hint: "Solo personas que aceptan promociones" },
];

interface Template {
  id: string;
  label: string;
  subject: string;
  headline: string;
  body: string;
  ctaUrl?: string;
  ctaText?: string;
  whatsapp: string;
}

const TEMPLATES: Template[] = [
  {id:"weekly",label:"Recordatorio",subject:"Tu semana en HIVE",headline:"Hola, {name}",body:"Reserva tus próximas clases desde la app. Te esperamos en el estudio.",ctaUrl:`${APP_ORIGIN}/app/classes`,ctaText:"Ver clases",whatsapp:`Hola {name}, reserva tus próximas clases en ${APP_ORIGIN}/app/classes`},
  {id:"blank",label:"Escribir desde cero",subject:"",headline:"Hola, {name}",body:"",whatsapp:""}
];

export function BroadcastDialog({ open, onOpenChange, emailOnly = false }: { open: boolean; onOpenChange: (v: boolean) => void; emailOnly?: boolean }) {
  const { toast } = useToast();
  const queryClient=useQueryClient();
  const [tab, setTab] = useState<"email" | "whatsapp">("email");
  const [audience, setAudience] = useState<Audience>("accepts_communications");
  const [templateId, setTemplateId] = useState<string>("weekly");
  const [subject, setSubject] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const [previewName, setPreviewName] = useState("María");
  const [preview, setPreview] = useState<{subject:string;html:string;key:string}|null>(null);
  const previewKey = JSON.stringify({subject,headline,body,ctaUrl,ctaText,name:previewName});
  const previewMutation = useMutation({
    mutationFn: async () => ({...(await api.post("/admin/broadcast/email-preview", {subject,headline,body,ctaUrl,ctaText,name:previewName})).data.data,key:previewKey}),
    onSuccess: setPreview,
    onError: (err: any) => toast({title:"No se pudo generar la vista previa",description:err?.response?.data?.message ?? "Intenta nuevamente",variant:"destructive"}),
  });
  useEffect(() => { setPreview(null); setConfirmStep(false); }, [subject,headline,body,ctaUrl,ctaText,previewName,audience]);

  // Seed fields when template changes
  useEffect(() => {
    const t = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
    setSubject(t.subject);
    setHeadline(t.headline);
    setBody(t.body);
    setCtaUrl(t.ctaUrl ?? "");
    setCtaText(t.ctaText ?? "");
    setWaMessage(t.whatsapp);
  }, [templateId]);

  // QA 2026-09-16 ronda 4: si el conteo fallaba, `?? 0` pintaba «0
  // destinatarios» como si nadie cumpliera el filtro. Un conteo que falló o que
  // todavía no llega no es un número: se dice y no se deja enviar a ciegas.
  const {
    data: countData,
    isError: countFailed,
    isPending: countLoading,
    refetch: retryCount,
    isFetching: countFetching,
  } = useQuery({
    queryKey: ["broadcast-audience", audience],
    queryFn: async () => (await api.get(`/admin/broadcast/audience-count?audience=${audience}`)).data,
    enabled: open,
  });
  const rawCount = countData?.data?.count;
  const countKnown = !countFailed && typeof rawCount === "number" && Number.isFinite(rawCount);
  const audienceCount = countKnown ? rawCount : 0;
  const recipientsLabel = (n: number) => `destinatario${n === 1 ? "" : "s"}`;

  // no-refresco: no hay pantalla de historial de envíos que leer después; el
  // conteo de enviados/fallidos ya lo trae el propio aviso, y el conteo de
  // audiencia (broadcast-audience) no cambia por haber enviado el mensaje.
  const emailMutation = useMutation({
    mutationFn: () => {
      const payload={audience,subject,headline,body,ctaUrl,ctaText};
      return api.post("/admin/broadcast/email",{...payload,idempotencyKey:campaignKey(payload)});
    },
    onSuccess: (res: any) => {
      const d = res?.data?.data ?? res?.data;
      toast({ title: "Campaña guardada", description: `${d?.total ?? 0} destinatarios. Puedes consultar el avance en el historial.` });
      completeCampaign();
      void queryClient.invalidateQueries({queryKey:["email-campaigns"]});
      setConfirmStep(false);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error al enviar", description: err?.response?.data?.message ?? err.message, variant: "destructive" });
      setConfirmStep(false);
    },
  });

  // no-refresco: mismo caso que emailMutation — sin lista que leer después.
  const waMutation = useMutation({
    mutationFn: () => api.post("/admin/broadcast/whatsapp", { audience, message: waMessage }),
    onSuccess: (res: any) => {
      const d = res?.data?.data ?? res?.data;
      toast({ title: "WhatsApp enviados", description: `${d?.sent ?? 0} ok · ${d?.failed ?? 0} fallaron · ${d?.total ?? 0} totales` });
      setConfirmStep(false);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error al enviar", description: err?.response?.data?.message ?? err.message, variant: "destructive" });
      setConfirmStep(false);
    },
  });

  const isPending = emailMutation.isPending || waMutation.isPending;

  const handleSend = () => {
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }
    if (emailOnly || tab === "email") emailMutation.mutate();
    else waMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isPending) { setConfirmStep(false); onOpenChange(v); } }}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border-line bg-surface p-0 text-ink">
        <DialogHeader className="shrink-0 border-b border-line px-6 py-6 text-left sm:px-8">
          <DialogTitle className="font-display text-2xl">{emailOnly ? "Nueva campaña por correo" : "Enviar comunicado"}</DialogTitle>
          <DialogDescription className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">{emailOnly ? "Envía un correo a tus usuarios." : "Envía un email o WhatsApp a tus usuarios."} Usa <code className="text-ink-muted">{"{name}"}</code> para personalizar con el nombre.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-7 sm:px-8">
          <div className="space-y-4"><h3 className="text-base font-semibold text-ink">1. Elige tu audiencia</h3>
          {/* Audience */}
          <div className="space-y-1.5">
            <Label htmlFor="campaign-audience" className="text-sm font-medium text-ink">Destinatarios</Label>
            <select
              id="campaign-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
              className="min-h-12 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-ink"
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            {countFailed ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <span>No se pudo contar a los destinatarios. No se puede enviar hasta saber a cuántas personas llegará.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={countFetching}
                  onClick={() => { void retryCount(); }}
                >
                  Reintentar
                </Button>
              </div>
            ) : (
              <p className="flex items-start gap-2 pt-2 text-sm leading-relaxed text-ink-muted">
                <Users size={16} className="mt-0.5 shrink-0" />
                <span>{AUDIENCES.find((a) => a.value === audience)?.hint} ·{" "}
                {countKnown ? (
                  <>
                    <strong>{audienceCount}</strong> {recipientsLabel(audienceCount)}
                  </>
                ) : (
                  <span>Contando destinatarios…</span>
                )}</span>
              </p>
            )}
            {countKnown && audienceCount === 0 && (
              <div role="status" className="rounded-xl border border-line bg-canvas p-4 text-sm leading-relaxed text-ink-muted">
                No hay personas suscritas por correo en esta audiencia.
                {typeof countData?.data?.totalClients === "number" && <p className="mt-2">Clientes registrados: {countData.data.totalClients}. Sin suscripción por correo: {countData.data.unsubscribed}.</p>}
                <p className="mt-2">Cada cliente puede activar «Novedades del estudio» en su perfil, en Preferencias. Aceptar WhatsApp no activa los correos.</p>
              </div>
            )}
          </div>

          </div><div className="space-y-4 border-t border-line pt-7"><h3 className="text-base font-semibold text-ink">2. Prepara el mensaje</h3>
          {/* Template */}
          <div className="space-y-1.5">
            <Label htmlFor="campaign-template" className="text-sm font-medium text-ink">Empieza con una plantilla</Label>
            <select
              id="campaign-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-ink"
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Channel tabs */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as "email" | "whatsapp")}>
            <TabsList className="w-full">
              <TabsTrigger value="email" className="flex-1"><Mail size={13} className="mr-1.5" />Email</TabsTrigger>
              {!emailOnly && <TabsTrigger value="whatsapp" className="flex-1"><MessageSquare size={13} className="mr-1.5" />WhatsApp</TabsTrigger>}
            </TabsList>

            <TabsContent value="email" className="mt-5 space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="campaign-subject" className="text-sm font-medium text-ink">Asunto</Label>
                <Input id="campaign-subject" className="min-h-12 rounded-xl border-line bg-canvas" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-headline" className="text-sm font-medium text-ink">Saludo o título</Label>
                <Input id="campaign-headline" className="min-h-12 rounded-xl border-line bg-canvas" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Hola, {name}" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-body" className="text-sm font-medium text-ink">Mensaje</Label>
                <Textarea id="campaign-body" className="min-h-48 rounded-xl border-line bg-canvas p-4 leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} rows={9} placeholder="Tu mensaje. Usa salto de línea doble para separar párrafos." />
              </div>
              <div className="space-y-4 rounded-xl border border-line bg-canvas p-4 sm:p-5"><div><h4 className="text-sm font-semibold text-ink">Botón del correo · opcional</h4><p className="mt-1 text-sm leading-relaxed text-ink-muted">Añade un enlace para que puedan reservar o consultar tus novedades.</p></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-url" className="text-sm font-medium text-ink">URL del botón (opcional)</Label>
                  <Input id="campaign-url" className="min-h-12 rounded-xl border-line bg-canvas" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-button-text" className="text-sm font-medium text-ink">Texto del botón</Label>
                  <Input id="campaign-button-text" className="min-h-12 rounded-xl border-line bg-canvas" value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Reservar clase" />
                </div>
              </div>
              </div>
              <section className="space-y-4 border-t border-line pt-5" aria-label="Vista previa del correo">
                <h3 className="text-base font-semibold">3. Revisa cómo se enviará</h3>
                <p className="text-sm text-ink-muted">La vista previa usa la misma plantilla del envío. El nombre de ejemplo se sustituirá por el de cada destinatario.</p>
                <Label htmlFor="preview-name">Nombre de ejemplo</Label>
                <Input id="preview-name" value={previewName} maxLength={100} disabled={previewMutation.isPending} onChange={e=>setPreviewName(e.target.value)} />
                <Button type="button" variant="outline" disabled={previewMutation.isPending} onClick={()=>previewMutation.mutate()}>{previewMutation.isPending ? "Generando…" : "Ver vista previa"}</Button>
                {preview && preview.key === previewKey && <div className="overflow-hidden rounded-xl border border-line">
                  <p className="border-b border-line bg-canvas p-4 text-sm break-words"><strong>Asunto:</strong> {preview.subject}</p>
                  <iframe title="Vista previa del correo personalizado" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html} className="h-[560px] w-full border-0 bg-white" />
                </div>}
              </section>
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-ink">Mensaje</Label>
                <Textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} rows={6} placeholder="Hola {name}, tenemos novedades..." />
                <p className="text-[11px] text-muted-foreground">{waMessage.length} caracteres · WhatsApp permite hasta ~4000.</p>
              </div>
              <div className="rounded-xl border border-line bg-sunken px-3 py-2 text-[11px] text-ink-muted">
                Los mensajes se envían de forma gradual. Mantén esta ventana abierta hasta ver el resultado.
              </div>
            </TabsContent>
          </Tabs></div>

          {confirmStep && (
            <div role="status" className="rounded-xl border border-line bg-canvas p-5 text-sm leading-relaxed text-ink">
              Estás por enviar a <strong>{audienceCount}</strong> {recipientsLabel(audienceCount)}. Confirma para proceder.
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-3 border-t border-line bg-surface px-6 py-5 sm:px-8">
          <Button variant="ghost" onClick={() => { setConfirmStep(false); onOpenChange(false); }} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={isPending || !countKnown || countLoading || audienceCount === 0 || (tab === "email" ? !subject || !body : !waMessage.trim())}
            className="min-h-11 bg-ink px-5 text-canvas hover:bg-ink/90"
          >
            {isPending ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <Send size={14} className="mr-1.5" />}
            {confirmStep ? `Confirmar y enviar a ${audienceCount}` : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BroadcastDialog;
