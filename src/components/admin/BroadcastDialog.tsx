import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  { value: "with_active_membership", label: "Con membresía activa", hint: "Solo usuarios con paquete vigente" },
  { value: "without_membership",     label: "Sin membresía activa", hint: "Para reactivar / promoción" },
  { value: "all",                    label: "Todos los usuarios",    hint: "Todas las cuentas de usuario" },
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

export function BroadcastDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
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
    mutationFn: () => api.post("/admin/broadcast/email", { audience, subject, headline, body, ctaUrl, ctaText }),
    onSuccess: (res: any) => {
      const d = res?.data?.data ?? res?.data;
      toast({ title: `Emails enviados`, description: `${d?.sent ?? 0} ok · ${d?.failed ?? 0} fallaron · ${d?.total ?? 0} totales` });
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
    if (tab === "email") emailMutation.mutate();
    else waMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isPending) { setConfirmStep(false); onOpenChange(v); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar comunicado</DialogTitle>
          <DialogDescription>Envía un email o WhatsApp a tus usuarios. Usa <code className="text-ink-muted">{"{name}"}</code> para personalizar con el nombre.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Audience */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Audiencia</Label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Users size={12} />
                {AUDIENCES.find((a) => a.value === audience)?.hint} ·{" "}
                {countKnown ? (
                  <>
                    <strong>{audienceCount}</strong> {recipientsLabel(audienceCount)}
                  </>
                ) : (
                  <span>Contando destinatarios…</span>
                )}
              </p>
            )}
          </div>

          {/* Template */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Plantilla</Label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              <TabsTrigger value="whatsapp" className="flex-1"><MessageSquare size={13} className="mr-1.5" />WhatsApp</TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Asunto</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del email" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Encabezado (h1)</Label>
                <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Hola, {name}" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Cuerpo</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} placeholder="Tu mensaje. Usa salto de línea doble para separar párrafos." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">URL del botón (opcional)</Label>
                  <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Texto del botón</Label>
                  <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Reservar clase" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Mensaje</Label>
                <Textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} rows={6} placeholder="Hola {name}, tenemos novedades..." />
                <p className="text-[11px] text-muted-foreground">{waMessage.length} caracteres · WhatsApp permite hasta ~4000.</p>
              </div>
              <div className="rounded-xl border border-line bg-sunken px-3 py-2 text-[11px] text-ink-muted">
                Los mensajes se envían de forma gradual. Mantén esta ventana abierta hasta ver el resultado.
              </div>
            </TabsContent>
          </Tabs>

          {confirmStep && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              Estás por enviar a <strong>{audienceCount}</strong> {recipientsLabel(audienceCount)}. Confirma para proceder.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setConfirmStep(false); onOpenChange(false); }} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={isPending || !countKnown || countLoading || audienceCount === 0 || (tab === "email" ? !subject || !body : !waMessage.trim())}
            className="bg-ink hover:bg-ink/90 text-canvas"
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
