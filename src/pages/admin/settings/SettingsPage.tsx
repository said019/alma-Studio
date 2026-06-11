import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { ErrorState } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import {
  Loader2,
  Send,
  MessageSquare,
  RefreshCw,
  Wifi,
  WifiOff,
  Pencil,
  BellDot,
  Upload,
  Image as ImageIcon,
  Video,
  Trash2,
  Info,
  CalendarCheck,
  CalendarX,
  CalendarClock,
  BadgeCheck,
  CreditCard,
  Bell,
  UserPlus,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import { ChangePassword } from "@/components/account/ChangePassword";

function normalizeQrDataUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  // Guard against Evolution "code" payloads that are not image data.
  if (trimmed.includes(",") && trimmed.includes("@")) return null;
  return `data:image/png;base64,${trimmed}`;
}

const DRIVE_CHUNK_SIZE = 5 * 1024 * 1024;
const VENUE_MEDIA_MAX_MB = 500;

function inferVenueMediaType(url: string, explicitType?: string): "image" | "video" | "" {
  const normalizedType = String(explicitType || "").toLowerCase();
  if (normalizedType === "image" || normalizedType === "video") return normalizedType;
  const normalizedUrl = String(url || "").toLowerCase();
  if (!normalizedUrl) return "";
  if (normalizedUrl.includes("/api/drive/video/")) return "video";
  if (normalizedUrl.includes("/api/drive/image/")) return "image";
  if (/\.(mp4|m4v|mov|webm|ogg)(\?|$)/.test(normalizedUrl)) return "video";
  if (/\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/.test(normalizedUrl)) return "image";
  return "";
}

// Etiqueta pequeña de sección (uppercase, tracking amplio)
const sectionLabelClass = "text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-ink/60";

// Generic settings section — reads { data: <value_object> } from server
const SettingsSection = ({ settingKey, fields }: { settingKey: string; fields: { key: string; label: string; type?: string; multiline?: boolean }[] }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, any>>({});
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["settings", settingKey],
    queryFn: async () => (await api.get(`/settings/${settingKey}`)).data,
    staleTime: Infinity, // don't re-fetch unless explicitly invalidated
  });

  useEffect(() => {
    // Server returns { data: <value_object> } where <value_object> is the saved JSON
    const raw = data?.data ?? data?.value ?? data?.data?.value;
    if (raw && typeof raw === "object" && !loaded) {
      setValues(raw);
      setLoaded(true);
    }
  }, [data, loaded]);

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/settings/${settingKey}`, { value: values }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", settingKey] });
      setLoaded(false); // allow re-sync after save
      toast({ title: "Configuración guardada" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  if (isError) {
    return (
      <div className="max-w-md">
        <ErrorState
          description="No pudimos cargar esta configuración. Revisa tu conexión y vuelve a intentarlo."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-md">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className={f.multiline ? "h-24 w-full" : "h-10 w-full"} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-md">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1">
          <Label>{f.label}</Label>
          {f.type === "boolean"
            ? <div className="flex items-center gap-3"><Switch checked={!!values[f.key]} onCheckedChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} /></div>
            : f.multiline
              ? <Textarea rows={5} value={values[f.key] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
              : <Input type={f.type ?? "text"} value={values[f.key] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
          }
        </div>
      ))}
      <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep">
        {updateMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
        Guardar cambios
      </Button>
    </div>
  );
};

// ── Datos de transferencia SPEI (editables) ──────────────────────────────────
const BankInfoSettings = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [bank, setBank] = useState("");
  const [holder, setHolder] = useState("");
  const [clabe, setClabe] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["bank-info"],
    queryFn: async () => (await api.get("/admin/bank-info")).data,
    staleTime: Infinity,
  });

  useEffect(() => {
    const info = data?.data;
    if (info && !loaded) {
      setBank(info.bank ?? "");
      setHolder(info.account_holder ?? "");
      setClabe(String(info.clabe ?? "").replace(/\D/g, ""));
      setAccountNumber(String(info.account_number ?? "").replace(/\D/g, ""));
      setLoaded(true);
    }
  }, [data, loaded]);

  const clabeDigits = clabe.replace(/\D/g, "");
  const clabeValid = clabeDigits.length === 18;

  const save = useMutation({
    mutationFn: () =>
      api.put("/admin/bank-info", {
        bank: bank.trim(),
        account_holder: holder.trim(),
        clabe: clabeDigits,
        account_number: accountNumber.replace(/\D/g, ""),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-info"] });
      setLoaded(false);
      toast({ title: "Datos de transferencia guardados" });
    },
    onError: (e: any) =>
      toast({ title: e?.response?.data?.message ?? "Error al guardar", variant: "destructive" }),
  });

  const canSave = bank.trim() && holder.trim() && clabeValid && !save.isPending;

  if (isError) {
    return (
      <div className="max-w-md">
        <ErrorState
          description="No pudimos cargar los datos de transferencia. Revisa tu conexión y vuelve a intentarlo."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-5 max-w-md">
        <Skeleton className="h-4 w-72" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-md">
      <p className="text-sm text-alma-ink/70">
        Estos datos se muestran a las clientas en la pantalla de pago por transferencia (SPEI).
      </p>

      <div className="space-y-1">
        <Label>Banco</Label>
        <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="BBVA" />
      </div>

      <div className="space-y-1">
        <Label>Titular de la cuenta</Label>
        <Input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Nombre del titular" />
      </div>

      <div className="space-y-1">
        <Label>CLABE interbancaria (18 dígitos)</Label>
        <Input
          value={clabe}
          onChange={(e) => setClabe(e.target.value.replace(/\D/g, "").slice(0, 18))}
          placeholder="012700015394444888"
          inputMode="numeric"
          className="nums"
        />
        <p className={`nums text-xs ${clabeValid || clabeDigits.length === 0 ? "text-alma-ink/55" : "text-destructive"}`}>
          {clabeDigits.length}/18 dígitos{!clabeValid && clabeDigits.length > 0 ? " (debe tener 18)" : ""}
        </p>
      </div>

      <div className="space-y-1">
        <Label>Número de cuenta (opcional)</Label>
        <Input
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
          placeholder="Opcional"
          inputMode="numeric"
          className="nums"
        />
      </div>

      <Button onClick={() => save.mutate()} disabled={!canSave} className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep">
        {save.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
        Guardar datos de transferencia
      </Button>
    </div>
  );
};

const WhatsAppSettings = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Connection ──────────────────────────────────────────────────────
  const { data: statusData, refetch, isFetching, isLoading, isError } = useQuery({
    queryKey: ["evolution-status"],
    queryFn: async () => (await api.get("/evolution/status")).data,
    refetchInterval: (query) => {
      const d = query.state.data as any;
      return d?.data?.state === "qr_pending" || d?.state === "qr_pending" ? 3000 : false;
    },
  });

  const status = (statusData as any)?.data ?? statusData ?? {};

  const connectMutation = useMutation({
    mutationFn: () => api.post("/evolution/connect"),
    onSuccess: (res: any) => {
      const d = res?.data?.data ?? res?.data ?? {};
      const qrCode = normalizeQrDataUrl(
        d.qrCode ??
        d.base64 ??
        d.code ??
        d.qrcode?.base64 ??
        d.qrcode?.code ??
        null,
      );
      // Immediately inject the QR code returned by connect into the status cache
      qc.setQueryData(["evolution-status"], { data: { connected: false, state: "qr_pending", qrCode, instanceExists: true } });
      refetch();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al conectar", variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.post("/evolution/disconnect"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["evolution-status"] }); toast({ title: "WhatsApp desconectado" }); },
    onError: () => toast({ title: "Error al desconectar", variant: "destructive" }),
  });

  // ── Test message ────────────────────────────────────────────────────
  const [testPhone, setTestPhone] = useState("");
  const testMutation = useMutation({
    mutationFn: () => api.post("/evolution/send-test", { phone: testPhone }),
    onSuccess: () => toast({ title: "Mensaje de prueba enviado" }),
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al enviar prueba", variant: "destructive" }),
  });

  if (isError) {
    return (
      <div className="max-w-xl">
        <ErrorState
          title="No pudimos consultar la conexión"
          description="No fue posible leer el estado de WhatsApp. Revisa tu conexión y vuelve a intentarlo."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-8 max-w-xl">
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-xl">
      {/* ── Status ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-alma-hairline bg-alma-mist p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className={`${sectionLabelClass} flex items-center gap-2`}>
            {status.connected ? <Wifi size={15} className="text-alma-olive" /> : <WifiOff size={15} className="text-alma-ink/45" />}
            Conexión WhatsApp
          </p>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="Actualizar estado">
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {status.connected ? (
            <Badge variant="outline" className="border-transparent bg-alma-olive/15 text-alma-olive hover:bg-alma-olive/15">Conectado</Badge>
          ) : (
            <Badge variant="outline" className="border-alma-hairline bg-transparent text-alma-ink/55">
              {status.state === "qr_pending" ? "Esperando QR" : "Desconectado"}
            </Badge>
          )}
          {status.number && <span className="nums text-sm text-alma-ink/60">{status.number}</span>}
        </div>

        {status.state === "qr_pending" && status.qrCode && (
          <div className="space-y-2">
            <p className="text-sm text-alma-ink/70">Escanea con WhatsApp para conectar:</p>
            <img src={status.qrCode} alt="QR Code" className="w-52 h-52 border border-alma-hairline rounded-xl bg-alma-canvas" />
            <p className="text-xs text-alma-ink/55">Actualizando cada 3 segundos…</p>
          </div>
        )}

        <div className="flex gap-3">
          {!status.connected ? (
            <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending} className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep">
              {connectMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
              {status.state === "qr_pending" ? "Obtener nuevo QR" : "Conectar WhatsApp"}
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
              {disconnectMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
              Desconectar
            </Button>
          )}
        </div>
      </div>

      {/* ── Test message ────────────────────────────────────────────── */}
      {status.connected && (
        <div className="rounded-xl border border-alma-hairline bg-alma-mist p-5 space-y-4">
          <p className={`${sectionLabelClass} flex items-center gap-2`}>
            <MessageSquare size={15} />
            Mensaje de prueba
          </p>
          <div className="flex gap-3">
            <Input
              placeholder="Ej. 5219991234567"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="flex-1 bg-alma-canvas nums"
              inputMode="numeric"
            />
            <Button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !testPhone}
              className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep"
              aria-label="Enviar mensaje de prueba"
            >
              {testMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
            </Button>
          </div>
          <p className="text-xs text-alma-ink/55">Incluye código de país. Ej: 521 + 10 dígitos para México.</p>
        </div>
      )}
    </div>
  );
};

// ── Notification Templates Section ─────────────────────────────────────────
const NOTIFICATION_TEMPLATES: { key: string; label: string; icon: LucideIcon; hint: string }[] = [
  { key: "booking_confirmed",    label: "Reserva confirmada",          icon: CalendarCheck, hint: "Se envía al confirmar una reserva. Vars: {name}, {class}, {date}, {time}" },
  { key: "booking_cancelled",    label: "Reserva cancelada",           icon: CalendarX,     hint: "Se envía al cancelar. Vars: {name}, {class}, {date}, {creditRestored}" },
  { key: "membership_activated", label: "Membresía activada",          icon: BadgeCheck,    hint: "Se envía al activar membresía. Vars: {name}, {plan}, {startDate}, {endDate}" },
  { key: "transfer_rejected",    label: "Transferencia rechazada",     icon: CreditCard,    hint: "Se envía cuando se rechaza un comprobante. Vars: {name}, {reason}" },
  { key: "class_reminder",       label: "Recordatorio de clase",       icon: Bell,          hint: "Se envía horas antes de la clase. Vars: {name}, {class}, {time}" },
  { key: "renewal_reminder",     label: "Recordatorio de renovación",  icon: CalendarClock, hint: "Se envía cuando la membresía está por vencer. Vars: {name}, {plan}, {expiresAt}" },
  { key: "welcome",              label: "Bienvenida",                  icon: UserPlus,      hint: "Se envía al registrarse. Vars: {name}" },
  { key: "password_reset",       label: "Recuperación de contraseña",  icon: KeyRound,      hint: "Se envía para restablecer contraseña. Vars: {name}, {link}" },
];

const NotificationTemplates = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editSubject, setEditSubject] = useState("");

  const { data: tplData, isLoading: tplLoading, isError: tplError, refetch: refetchTpl } = useQuery({
    queryKey: ["settings", "notification_templates"],
    queryFn: async () => (await api.get("/settings/notification_templates")).data,
    staleTime: Infinity,
  });

  const { data: configData, refetch: refetchConfig, isError: configError } = useQuery({
    queryKey: ["settings", "notification_settings"],
    queryFn: async () => (await api.get("/settings/notification_settings")).data,
    staleTime: Infinity,
  });
  const { data: walletLogsData, refetch: refetchWalletLogs, isFetching: walletLogsFetching, isError: walletLogsError } = useQuery({
    queryKey: ["wallet-notification-logs"],
    queryFn: async () => (await api.get("/admin/wallet/notifications?limit=30")).data,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const [config, setConfig] = useState<Record<string, any>>({});
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    const raw = configData?.data ?? configData?.value;
    if (raw && !configLoaded) { setConfig(raw); setConfigLoaded(true); }
  }, [configData, configLoaded]);

  const templates: Record<string, { subject?: string; body: string }> = tplData?.data ?? {};
  const walletLogs: any[] = walletLogsData?.data ?? [];

  const saveTplMutation = useMutation({
    mutationFn: ({ key, subject, body }: { key: string; subject: string; body: string }) => {
      const updated = { ...templates, [key]: { subject, body } };
      return api.put("/settings/notification_templates", { value: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "notification_templates"] });
      toast({ title: "Plantilla guardada" });
      setEditingKey(null);
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const saveConfigMutation = useMutation({
    mutationFn: () => api.put("/settings/notification_settings", { value: config }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "notification_settings"] });
      setConfigLoaded(false);
      refetchConfig();
      toast({ title: "Configuración guardada" });
    },
  });

  const openEdit = (key: string) => {
    const tpl = templates[key];
    setEditText(tpl?.body ?? "");
    setEditSubject(tpl?.subject ?? "");
    setEditingKey(key);
  };

  const currentTpl = NOTIFICATION_TEMPLATES.find((t) => t.key === editingKey);

  return (
    <div className="space-y-6 max-w-xl">
      {/* Alcance: sistema vs Templates de WhatsApp */}
      <div className="flex items-start gap-2.5 rounded-xl border border-alma-hairline bg-alma-oat/40 px-3.5 py-3">
        <Info size={15} className="mt-0.5 shrink-0 text-alma-berry" />
        <p className="text-xs leading-relaxed text-alma-ink/80">
          Estos son los mensajes del sistema. Para las plantillas de WhatsApp ve a{" "}
          <Link
            to="/admin/whatsapp-templates"
            className="font-medium text-alma-berry underline underline-offset-2 hover:text-alma-ink"
          >
            Templates de WhatsApp
          </Link>.
        </p>
      </div>

      {/* Config toggles */}
      <div className="rounded-xl border border-alma-hairline bg-alma-mist p-4 space-y-3">
        <p className={sectionLabelClass}>Canales activos</p>
        {configError ? (
          <p className="text-xs text-destructive">
            No pudimos cargar los canales.{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => refetchConfig()}>Reintentar</button>
          </p>
        ) : (
          <>
            {[
              { key: "email_reminders", label: "Recordatorios por email" },
              { key: "whatsapp_reminders", label: "Recordatorios por WhatsApp" },
            ].map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <Switch checked={!!config[f.key]} onCheckedChange={(v) => setConfig((p) => ({ ...p, [f.key]: v }))} />
                <Label>{f.label}</Label>
              </div>
            ))}
            <div className="space-y-1 pt-1">
              <Label>Horas antes del recordatorio</Label>
              <Input
                type="number"
                className="w-28 bg-alma-canvas nums"
                value={config.reminder_hours_before ?? 2}
                onChange={(e) => setConfig((p) => ({ ...p, reminder_hours_before: Number(e.target.value) }))}
              />
            </div>
            <Button size="sm" onClick={() => saveConfigMutation.mutate()} disabled={saveConfigMutation.isPending} className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep">
              {saveConfigMutation.isPending ? <Loader2 className="animate-spin mr-1" size={12} /> : null}Guardar
            </Button>
          </>
        )}
      </div>

      <div className="rounded-xl border border-alma-hairline bg-alma-mist p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className={`${sectionLabelClass} flex items-center gap-2`}>
            <BellDot size={15} />
            Notificaciones de pase (Wallet)
          </p>
          <Button variant="ghost" size="sm" onClick={() => refetchWalletLogs()} disabled={walletLogsFetching} aria-label="Actualizar notificaciones de pase">
            <RefreshCw size={14} className={walletLogsFetching ? "animate-spin" : ""} />
          </Button>
        </div>

        {walletLogsError ? (
          <p className="text-xs text-destructive">
            No pudimos cargar las notificaciones de pase.{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => refetchWalletLogs()}>Reintentar</button>
          </p>
        ) : !walletLogs.length ? (
          <p className="text-xs text-alma-ink/55">Aún no hay notificaciones de pase registradas.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {walletLogs.map((row) => (
              <div key={row.id} className="rounded-lg border border-alma-hairline bg-alma-canvas px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-alma-ink truncate">{row.display_name || row.email || row.user_id || "Usuaria"}</p>
                  <Badge
                    variant="outline"
                    className={
                      row.status === "ok"
                        ? "border-transparent bg-alma-olive/15 text-alma-olive hover:bg-alma-olive/15"
                        : row.status === "partial"
                          ? "border-alma-sandstone/60 bg-alma-oat/50 text-alma-berry"
                          : "border-transparent bg-destructive/10 text-destructive"
                    }
                  >
                    {row.status === "ok" ? "OK" : row.status === "partial" ? "Parcial" : "Error"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-alma-ink/60">
                  <span className="nums">{formatDateTime(row.created_at)}</span> · motivo: {row.reason}
                </p>
                <p className="mt-1 text-alma-ink/60 nums">
                  Apple: {row.apple_sent ?? 0} enviadas / {row.apple_failed ?? 0} fallidas · Google: {row.google_synced ? `sincronizado (${row.google_mode || "updated"})` : "sin sincronizar"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Templates list */}
      <div className="space-y-2">
        <p className={`${sectionLabelClass} mb-3`}>Plantillas de mensajes</p>
        {tplError ? (
          <ErrorState
            description="No pudimos cargar las plantillas de mensajes. Revisa tu conexión y vuelve a intentarlo."
            onRetry={() => refetchTpl()}
          />
        ) : tplLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          NOTIFICATION_TEMPLATES.map((t) => {
            const tpl = templates[t.key];
            const Icon = t.icon;
            return (
              <div key={t.key} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-alma-hairline bg-alma-mist">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-alma-oat/60 text-alma-berry">
                  <Icon size={15} strokeWidth={1.8} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-alma-ink">{t.label}</p>
                  <p className="text-xs text-alma-ink/55 mt-0.5 truncate">
                    {tpl?.body ? tpl.body.slice(0, 80) + (tpl.body.length > 80 ? "…" : "") : <span className="italic text-alma-ink/45">Sin personalizar (usa plantilla por defecto)</span>}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="shrink-0" onClick={() => openEdit(t.key)} aria-label={`Editar plantilla ${t.label}`}>
                  <Pencil size={13} />
                </Button>
              </div>
            );
          })
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editingKey} onOpenChange={(v) => !v && setEditingKey(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar plantilla · {currentTpl?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-alma-ink/70 bg-alma-oat/40 rounded-lg px-3 py-2">{currentTpl?.hint}</p>
            <div className="space-y-1">
              <Label>Asunto (email)</Label>
              <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="Asunto del email..." />
            </div>
            <div className="space-y-1">
              <Label>Cuerpo del mensaje (WhatsApp / Email)</Label>
              <Textarea rows={6} value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="Escribe el mensaje aquí..." />
              <p className="nums text-xs text-alma-ink/55">{editText.length} caracteres</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingKey(null)}>Cancelar</Button>
            <Button
              onClick={() => editingKey && saveTplMutation.mutate({ key: editingKey, subject: editSubject, body: editText })}
              disabled={saveTplMutation.isPending}
              className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep"
            >
              {saveTplMutation.isPending ? <Loader2 className="animate-spin mr-1" size={12} /> : null}Guardar plantilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const VenueMediaSettings = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { data: generalData, isLoading, isError, refetch } = useQuery({
    queryKey: ["settings", "general_settings"],
    queryFn: async () => (await api.get("/settings/general_settings")).data,
    staleTime: Infinity,
  });

  const generalSettings: Record<string, any> = generalData?.data ?? {};
  const mediaUrl = String(generalSettings.venue_media_url || "");
  const mediaType = inferVenueMediaType(mediaUrl, generalSettings.venue_media_type);

  const saveGeneralMutation = useMutation({
    mutationFn: (nextValue: Record<string, any>) => api.put("/settings/general_settings", { value: nextValue }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "general_settings"] });
      toast({ title: "Media del lugar guardada" });
    },
    onError: (err: any) => {
      toast({ title: err?.response?.data?.message || "Error al guardar media", variant: "destructive" });
    },
  });

  const handleRemoveMedia = () => {
    if (!mediaUrl) return;
    saveGeneralMutation.mutate({
      ...generalSettings,
      venue_media_url: "",
      venue_media_type: "",
      venue_media_drive_id: "",
      venue_media_name: "",
      venue_media_updated_at: "",
    });
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      toast({ title: "Solo se permiten archivos de imagen o video.", variant: "destructive" });
      return;
    }
    if (file.size > VENUE_MEDIA_MAX_MB * 1024 * 1024) {
      toast({ title: `El archivo excede ${VENUE_MEDIA_MAX_MB} MB.`, variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    try {
      const initResp = await api.post("/drive/init-upload", {
        fileName: `venue_media_${Date.now()}_${file.name}`,
        mimeType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
        fileSize: file.size,
      });
      const sessionId = initResp?.data?.data?.sessionId ?? initResp?.data?.sessionId;
      if (!sessionId) throw new Error("No se obtuvo sesión de subida");

      let offset = 0;
      let driveFileId = "";
      while (offset < file.size) {
        const end = Math.min(offset + DRIVE_CHUNK_SIZE, file.size);
        const chunk = file.slice(offset, end);
        const contentRange = `bytes ${offset}-${end - 1}/${file.size}`;
        const resp = await api.put(`/drive/upload-chunk/${sessionId}`, chunk, {
          headers: {
            "Content-Type": file.type || (isVideo ? "video/mp4" : "image/jpeg"),
            "Content-Range": contentRange,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        if (resp.data?.done) {
          driveFileId = resp.data?.data?.id;
          break;
        }
        if (resp.data?.range) {
          const nextOffset = parseInt(String(resp.data.range).split("-")[1], 10) + 1;
          offset = Number.isFinite(nextOffset) ? nextOffset : end;
        } else {
          offset = end;
        }
        setUploadProgress(Math.round((offset / file.size) * 95));
      }

      if (!driveFileId) throw new Error("No se obtuvo el ID del archivo en Drive");
      setUploadProgress(97);
      await api.post(`/drive/make-public/${driveFileId}`);

      const nextMediaType = isVideo ? "video" : "image";
      const nextMediaUrl = nextMediaType === "video" ? `/api/drive/video/${driveFileId}` : `/api/drive/image/${driveFileId}`;
      await api.put("/settings/general_settings", {
        value: {
          ...generalSettings,
          venue_media_url: nextMediaUrl,
          venue_media_type: nextMediaType,
          venue_media_drive_id: driveFileId,
          venue_media_name: file.name,
          venue_media_updated_at: new Date().toISOString(),
        },
      });

      setUploadProgress(100);
      qc.invalidateQueries({ queryKey: ["settings", "general_settings"] });
      toast({ title: "Archivo subido correctamente" });
    } catch (err: any) {
      toast({ title: err?.response?.data?.message || err?.message || "Error al subir archivo", variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (isError) {
    return (
      <div className="max-w-2xl">
        <ErrorState
          description="No pudimos cargar la media del lugar. Revisa tu conexión y vuelve a intentarlo."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-40 w-full max-w-2xl rounded-xl" />;
  }

  return (
    <div className="rounded-xl border border-alma-hairline bg-alma-mist p-4 space-y-4 max-w-2xl">
      <div className="space-y-1">
        <p className={sectionLabelClass}>Media del lugar</p>
        <p className="text-xs text-alma-ink/60">
          Sube una imagen o video para mostrar el estudio desde el admin.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || saveGeneralMutation.isPending}
          className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep"
        >
          {isUploading ? <Loader2 className="animate-spin mr-2" size={14} /> : <Upload size={14} className="mr-2" />}
          Subir imagen o video
        </Button>
        {mediaUrl ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleRemoveMedia}
            disabled={isUploading || saveGeneralMutation.isPending}
          >
            <Trash2 size={14} className="mr-2" />
            Quitar archivo
          </Button>
        ) : null}
      </div>

      {isUploading ? (
        <div className="space-y-2">
          <Progress value={uploadProgress} />
          <p className="nums text-xs text-alma-ink/55">{uploadProgress}% subido</p>
        </div>
      ) : null}

      {mediaUrl ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-alma-hairline overflow-hidden bg-alma-ink-deep">
            {mediaType === "video" ? (
              <video src={mediaUrl} controls className="w-full max-h-[360px] object-cover bg-alma-ink-deep" />
            ) : (
              <img src={mediaUrl} alt="Media del lugar" className="w-full max-h-[360px] object-cover" />
            )}
          </div>
          <p className="text-xs text-alma-ink/60 flex items-center gap-2">
            {mediaType === "video" ? <Video size={13} /> : <ImageIcon size={13} />}
            {generalSettings.venue_media_name || "Archivo cargado"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-alma-hairline p-4 text-xs text-alma-ink/55">
          Aún no hay media cargada.
        </div>
      )}
    </div>
  );
};

const SettingsPage = () => (
  <AuthGuard>
    <AdminLayout>
      <div className="admin-page max-w-3xl">
        <SectionTabs
          tabs={[
            { label: "Ajustes", to: "/admin/settings" },
            { label: "Instructoras", to: "/admin/staff" },
            { label: "Templates WA", to: "/admin/whatsapp-templates" },
          ]}
        />
        <h1 className="admin-title font-semibold text-alma-ink mb-6">Configuración</h1>
        <Tabs defaultValue="general">
          <TabsList className="flex-wrap h-auto gap-1 mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="payments">Pagos</TabsTrigger>
            <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
            <TabsTrigger value="policies">Políticas</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="security">Seguridad</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="space-y-6">
              <SettingsSection
                settingKey="general_settings"
                fields={[
                  { key: "studio_name", label: "Nombre del estudio" },
                  { key: "address", label: "Dirección" },
                  { key: "phone", label: "Teléfono de contacto" },
                  { key: "instagram", label: "Instagram (@usuario)" },
                  { key: "facebook", label: "Facebook (URL o usuario)" },
                  { key: "timezone", label: "Zona horaria (ej: America/Mexico_City)" },
                  { key: "currency", label: "Moneda (ej: MXN)" },
                  { key: "opening_pricing_active", label: "Precios de apertura activos", type: "boolean" },
                  { key: "maintenance_mode", label: "Modo mantenimiento", type: "boolean" },
                ]}
              />
              <VenueMediaSettings />
            </div>
          </TabsContent>

          <TabsContent value="payments">
            <BankInfoSettings />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationTemplates />
          </TabsContent>

          <TabsContent value="policies">
            <SettingsSection
              settingKey="policies_settings"
              fields={[
                { key: "cancellation_policy", label: "Política de cancelación", multiline: true },
                { key: "terms_of_service", label: "Términos de servicio", multiline: true },
                { key: "privacy_policy", label: "Política de privacidad", multiline: true },
              ]}
            />
          </TabsContent>

          <TabsContent value="whatsapp">
            <WhatsAppSettings />
          </TabsContent>

          <TabsContent value="security">
            <div className="max-w-md">
              <h2 className="text-lg font-semibold text-alma-ink mb-1">Cambiar mi contraseña</h2>
              <p className="text-sm text-alma-ink/70 mb-6">
                Cambia la contraseña de tu cuenta de administradora. Por seguridad cerraremos tu sesión al terminar.
              </p>
              <ChangePassword logoutAfter />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  </AuthGuard>
);

export default SettingsPage;
