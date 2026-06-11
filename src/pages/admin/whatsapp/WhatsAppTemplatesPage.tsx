import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { EmptyState, ErrorState } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Eye, RotateCcw, Save, Loader2, Send, BellOff, Bell, ChevronDown, MoreHorizontal, X } from "lucide-react";

interface Template { subject: string; body: string; enabled?: boolean }
interface ApiResponse {
  data: {
    templates: Record<string, Template>;
    defaults: Record<string, Template>;
    variables: Record<string, string[]>;
  };
}

// Categorías para agrupar templates
const CATEGORIES: { id: string; label: string; keys: string[] }[] = [
  { id: "onboarding", label: "Onboarding", keys: ["welcome", "password_reset"] },
  { id: "bookings", label: "Reservas", keys: ["booking_confirmed", "booking_cancelled", "class_reminder", "class_attended", "admin_new_booking"] },
  { id: "membership", label: "Membresía", keys: ["membership_activated", "membership_expiring_today", "membership_expiring_tomorrow", "membership_expiring_n_days", "membership_expired", "renewal_reminder", "transfer_rejected"] },
  { id: "loyalty", label: "Lealtad", keys: ["rings_closed", "points_earned", "reward_redeemed", "milestone_classes_5", "milestone_classes_10", "milestone_classes_25", "milestone_classes_50", "milestone_classes_100"] },
  { id: "events", label: "Eventos", keys: ["event_registered"] },
  { id: "motivation", label: "Motivación", keys: ["motivation_first_class_week", "motivation_almost_ringed", "motivation_streak_2_weeks", "motivation_streak_4_weeks", "motivation_streak_8_weeks", "motivation_comeback"] },
  { id: "promos", label: "Promos", keys: ["promo_custom", "promo_dormant_invite", "promo_expiring_offer", "promo_birthday_month"] },
];

// Vars de muestra para preview
const SAMPLE_VARS: Record<string, string | number> = {
  firstName: "María",
  name: "María González",
  class: "Reformer",
  date: "viernes 9 de mayo",
  time: "07:00",
  startDate: "1 mayo",
  endDate: "31 mayo",
  plan: "Reformer 4 clases por semana",
  expiresAt: "31 mayo",
  reason: "comprobante ilegible",
  link: "https://alma-movement.app/r/xyz",
  creditRestored: "Sí",
  classesThisWeek: 1,
  weekGoal: 4,
  days: 18,
  classes: 25,
  points: 250,
  totalPoints: 1500,
  rewardName: "Clase muestra gratis",
  eventTitle: "Clase muestra mensual",
  message: "te queremos de regreso al estudio",
};

const TemplateCard = ({
  templateKey,
  template,
  variables,
  isModified,
  onSave,
  onReset,
  onToggleEnabled,
  toast,
}: {
  templateKey: string;
  template: Template;
  variables: string[];
  isModified: boolean;
  onSave: (key: string, t: Template) => Promise<void>;
  onReset: (key: string) => void;
  onToggleEnabled: (key: string, next: boolean) => Promise<void>;
  toast: ReturnType<typeof useToast>["toast"];
}) => {
  const enabled = template.enabled !== false;
  const { confirm, promptText, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(template.subject || "");
  const [body, setBody] = useState(template.body || "");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  const dirty = subject !== template.subject || body !== template.body;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(templateKey, { subject, body });
      toast({ title: "Template guardado", description: templateKey });
    } catch {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const r = await api.post("/admin/whatsapp-templates/preview", {
        templateKey,
        vars: SAMPLE_VARS,
      });
      setPreview(r.data?.data || null);
    } catch {
      toast({ title: "Error al previsualizar", variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const insertVariable = (v: string) => {
    setBody((prev) => prev + `{${v}}`);
  };

  const handleTestSend = async () => {
    const phone = await promptText({
      title: "Enviar WhatsApp de prueba",
      description: "Escribe el teléfono que recibirá esta plantilla. Con código de país, solo números. Ej: 5214441234567.",
      placeholder: "5214441234567",
      confirmLabel: "Enviar prueba",
      required: true,
    });
    if (!phone) return;
    setSendingTest(true);
    try {
      await api.post("/admin/whatsapp-templates/test-send", {
        templateKey,
        phone,
      });
      toast({ title: "Prueba enviada", description: `WhatsApp de prueba enviado a ${phone}` });
    } catch (e: any) {
      toast({
        title: "No se envió",
        description: e?.response?.data?.message || "Verifica conexión Evolution",
        variant: "destructive",
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleResetClick = async () => {
    const ok = await confirm({
      title: "¿Restaurar al texto default?",
      description: `Tu versión editada de "${templateKey}" se reemplaza por el texto original de Alma y no se puede recuperar.`,
      confirmLabel: "Restaurar",
      destructive: true,
    });
    if (ok) onReset(templateKey);
  };

  const handleToggleClick = async () => {
    const next = !enabled;
    if (!next) {
      const ok = await confirm({
        title: "¿Desactivar este aviso?",
        description: `El WhatsApp "${templateKey}" dejará de enviarse automáticamente a las clientas. Puedes reactivarlo cuando quieras.`,
        confirmLabel: "Desactivar",
        destructive: true,
      });
      if (!ok) return;
    }
    setToggling(true);
    try {
      await onToggleEnabled(templateKey, next);
      toast({
        title: next ? "Aviso activado" : "Aviso desactivado",
        description: next
          ? `Se enviará el WhatsApp '${templateKey}' automáticamente.`
          : `Ya no se enviará el WhatsApp '${templateKey}'.`,
      });
    } catch {
      toast({ title: "Error al cambiar el estado", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className={`rounded-xl border border-alma-hairline bg-alma-mist overflow-hidden ${!enabled ? "opacity-60" : ""}`}>
      {dialog}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 p-4 text-left transition-colors hover:bg-alma-oat/30"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-[11px] px-1.5 py-0.5 rounded bg-alma-oat/60 text-alma-berry font-mono">{templateKey}</code>
            {isModified && (
              <Badge variant="outline" className="border-transparent bg-alma-oat text-alma-ink text-[10px] h-4">
                editado
              </Badge>
            )}
            {!enabled && (
              <Badge variant="outline" className="text-[10px] h-4 border-destructive/40 text-destructive">
                desactivado
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium text-alma-ink mt-1 truncate">{template.subject}</p>
          <p className="text-xs text-alma-ink/55 mt-0.5 truncate">{template.body.slice(0, 90)}…</p>
        </div>
        <ChevronDown
          size={15}
          className={`shrink-0 text-alma-ink/55 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="border-t border-alma-hairline p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Subject (asunto interno)</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-alma-canvas"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mensaje (cuerpo del WhatsApp)</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="bg-alma-canvas resize-none font-mono text-sm"
            />
            {variables.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[11px] text-alma-ink/55">Variables:</span>
                {variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="rounded border border-alma-hairline bg-alma-canvas px-1.5 py-0.5 text-[11px] font-mono text-alma-ink/80 transition-colors hover:bg-alma-oat/60"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {preview && (
            <div className="rounded-xl border border-alma-sandstone/60 bg-alma-oat/30 p-3">
              <p className="text-[10px] uppercase tracking-widest text-alma-berry mb-1.5">Preview con datos de muestra</p>
              <p className="text-sm font-medium text-alma-ink">{preview.subject}</p>
              <p className="text-sm text-alma-ink/70 mt-1 whitespace-pre-wrap">{preview.body}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={!dirty || saving}
              size="sm"
              className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep"
            >
              {saving ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Save size={13} className="mr-1.5" />}
              Guardar
            </Button>
            <Button
              onClick={handlePreview}
              disabled={previewing}
              variant="ghost"
              size="sm"
              className="text-alma-ink/70 hover:text-alma-ink"
            >
              {previewing ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Eye size={13} className="mr-1.5" />}
              Preview
            </Button>
            <Button
              onClick={handleTestSend}
              disabled={sendingTest || dirty}
              variant="ghost"
              size="sm"
              className="text-alma-ink/70 hover:text-alma-ink"
              title={dirty ? "Guarda primero los cambios antes de enviar prueba" : "Mandar WhatsApp de prueba a un teléfono"}
            >
              {sendingTest ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Send size={13} className="mr-1.5" />}
              Enviar prueba
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-alma-ink/55 hover:text-alma-ink"
                  disabled={toggling}
                  aria-label="Más acciones del template"
                >
                  {toggling ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={15} />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isModified && (
                  <DropdownMenuItem onClick={handleResetClick}>
                    <RotateCcw size={13} className="mr-2" />
                    Restaurar default
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={handleToggleClick}
                  className={enabled ? "text-destructive focus:text-destructive" : ""}
                >
                  {enabled ? <BellOff size={13} className="mr-2" /> : <Bell size={13} className="mr-2" />}
                  {enabled ? "Desactivar aviso" : "Activar aviso"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
};

const WhatsAppTemplatesPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ["whatsapp-templates"],
    queryFn: async () => (await api.get("/admin/whatsapp-templates")).data,
  });

  const updateMutation = useMutation({
    mutationFn: (templates: Record<string, Template>) => api.put("/admin/whatsapp-templates", { templates }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });

  const resetMutation = useMutation({
    mutationFn: () => api.post("/admin/whatsapp-templates/reset"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast({ title: "Templates restaurados a defaults Alma" });
    },
  });

  const templates = data?.data?.templates ?? {};
  const defaults = data?.data?.defaults ?? {};
  const variables = data?.data?.variables ?? {};

  // ── Admin phones (a quién se le manda 'admin_new_booking' y similares) ───
  const { data: notifSettings, refetch: refetchSettings, isError: phonesError } = useQuery<{ data: { admin_phones?: string[] } }>({
    queryKey: ["notification-settings"],
    queryFn: async () => (await api.get("/admin/notification-settings")).data,
  });
  const adminPhones: string[] = Array.isArray(notifSettings?.data?.admin_phones)
    ? notifSettings.data.admin_phones
    : [];
  const [phoneInput, setPhoneInput] = useState("");
  const updatePhonesMutation = useMutation({
    mutationFn: (phones: string[]) => api.put("/admin/notification-settings", { admin_phones: phones }),
    onSuccess: () => { refetchSettings(); },
  });
  const addAdminPhone = async () => {
    const v = phoneInput.trim();
    if (!v) return;
    if (adminPhones.includes(v)) {
      toast({ title: "Ese teléfono ya está en la lista" });
      return;
    }
    try {
      await updatePhonesMutation.mutateAsync([...adminPhones, v]);
      setPhoneInput("");
      toast({ title: "Teléfono agregado", description: "Ahora recibirá los avisos administrativos." });
    } catch {
      toast({ title: "Error al guardar", variant: "destructive" });
    }
  };
  const removeAdminPhone = async (p: string) => {
    const ok = await confirm({
      title: `¿Quitar ${p}?`,
      description: "Ese teléfono dejará de recibir los avisos administrativos por WhatsApp.",
      confirmLabel: "Quitar",
    });
    if (!ok) return;
    try {
      await updatePhonesMutation.mutateAsync(adminPhones.filter((x) => x !== p));
      toast({ title: "Teléfono quitado" });
    } catch {
      toast({ title: "Error al guardar", variant: "destructive" });
    }
  };

  const isModified = (key: string) => {
    const cur = templates[key];
    const def = defaults[key];
    if (!cur || !def) return false;
    return cur.subject !== def.subject || cur.body !== def.body;
  };

  const handleSave = async (key: string, t: Template) => {
    await updateMutation.mutateAsync({ ...templates, [key]: t });
  };

  const handleResetOne = async (key: string) => {
    if (!defaults[key]) return;
    await updateMutation.mutateAsync({ ...templates, [key]: defaults[key] });
    toast({ title: "Template restaurado al default", description: key });
  };

  // Activa/desactiva el envío automático del template (no se elimina el copy:
  // solo se marca enabled=false para que el server lo salte).
  const handleToggleEnabled = async (key: string, next: boolean) => {
    const cur = templates[key];
    if (!cur) return;
    await updateMutation.mutateAsync({ ...templates, [key]: { ...cur, enabled: next } });
  };

  const handleResetAll = async () => {
    const ok = await confirm({
      title: "¿Restaurar todos los templates?",
      description: "Todos los templates vuelven al texto original de Alma y se pierde el copy editado. Esta acción no se puede deshacer.",
      confirmLabel: "Restaurar todo",
      destructive: true,
    });
    if (ok) resetMutation.mutate();
  };

  // Agrupar templates no listados explícitamente bajo "Otros"
  const allKeys = Object.keys(templates);
  const categorized = new Set(CATEGORIES.flatMap((c) => c.keys));
  const others = allKeys.filter((k) => !categorized.has(k));
  const allCategories = others.length > 0
    ? [...CATEGORIES, { id: "others", label: "Otros", keys: others }]
    : CATEGORIES;

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-4xl">
          {dialog}
          <SectionTabs
            tabs={[
              { label: "Ajustes", to: "/admin/settings" },
              { label: "Instructoras", to: "/admin/staff" },
              { label: "Templates WA", to: "/admin/whatsapp-templates" },
            ]}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
            <div className="min-w-0">
              <h1 className="admin-title font-semibold text-alma-ink">Templates de WhatsApp</h1>
              <p className="mt-1 text-sm text-alma-ink/70">
                Edita el copy de las{allKeys.length > 0 ? <> <span className="nums">{allKeys.length}</span></> : null} notificaciones automáticas. Los cambios aplican al instante.
              </p>
            </div>
            <Button
              onClick={handleResetAll}
              disabled={resetMutation.isPending || isLoading || isError}
              variant="outline"
              size="sm"
              className="shrink-0"
            >
              {resetMutation.isPending ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RotateCcw size={14} className="mr-1.5" />}
              Restaurar todo a default
            </Button>
          </div>

          {/* ── Destinatarios de avisos administrativos ───────────────── */}
          <div className="rounded-xl border border-alma-hairline bg-alma-mist p-5 mb-6">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-ink/60 mb-1">
              Avisos a la dueña / staff
            </p>
            <p className="text-xs text-alma-ink/70 mb-3">
              Teléfonos que reciben los WhatsApps administrativos (ej. <code className="font-mono">admin_new_booking</code>). Agrega tu número y el de quien quieras que reciba estas alertas. Formato: <code className="font-mono nums">+524441234567</code>.
            </p>
            <div className="flex gap-2">
              <Input
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+524441234567"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAdminPhone(); } }}
                className="bg-alma-canvas nums"
              />
              <Button
                onClick={addAdminPhone}
                disabled={!phoneInput.trim() || updatePhonesMutation.isPending}
                size="sm"
                className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep"
              >
                Agregar
              </Button>
            </div>
            {phonesError ? (
              <p className="mt-3 text-xs text-destructive">
                No pudimos cargar los teléfonos.{" "}
                <button type="button" className="underline underline-offset-2" onClick={() => refetchSettings()}>Reintentar</button>
              </p>
            ) : adminPhones.length === 0 ? (
              <p className="mt-3 text-xs text-alma-ink/55">
                Sin teléfonos configurados. Mientras tanto, los avisos van a usuarias con rol admin que tengan teléfono.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {adminPhones.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1.5 rounded-full border border-alma-hairline bg-alma-canvas px-2.5 py-1 text-xs text-alma-ink">
                    <code className="font-mono nums">{p}</code>
                    <button
                      type="button"
                      onClick={() => removeAdminPhone(p)}
                      className="text-alma-ink/45 transition-colors hover:text-destructive"
                      aria-label={`Quitar ${p}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {isError ? (
            <ErrorState
              description="No pudimos cargar los templates de WhatsApp. Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetch()}
            />
          ) : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full max-w-md rounded-md" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : allKeys.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={20} strokeWidth={1.8} />}
              title="Sin templates configurados"
              description="El servidor aún no devuelve templates de WhatsApp. Verifica la configuración de Evolution y vuelve a cargar."
              ctaLabel="Volver a cargar"
              onCta={() => refetch()}
            />
          ) : (
            <Tabs defaultValue={allCategories[0].id}>
              <TabsList className="flex flex-wrap h-auto">
                {allCategories.map((cat) => {
                  const editedCount = cat.keys.filter((k) => isModified(k)).length;
                  return (
                    <TabsTrigger key={cat.id} value={cat.id} className="text-xs">
                      {cat.label}
                      <span className="ml-1.5 text-[10px] text-alma-ink/50 nums">{cat.keys.length}</span>
                      {editedCount > 0 && (
                        <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-alma-berry" />
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {allCategories.map((cat) => (
                <TabsContent key={cat.id} value={cat.id} className="mt-4 space-y-2">
                  {cat.keys.filter((k) => templates[k]).map((k) => (
                    <TemplateCard
                      key={k}
                      templateKey={k}
                      template={templates[k]}
                      variables={variables[k] || []}
                      isModified={isModified(k)}
                      onSave={handleSave}
                      onReset={handleResetOne}
                      onToggleEnabled={handleToggleEnabled}
                      toast={toast}
                    />
                  ))}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default WhatsAppTemplatesPage;
