import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState } from "@/components/app/AppShell";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Send, Eye, Loader2, CheckCircle2, XCircle, MinusCircle, History } from "lucide-react";

type SegmentInfo = { label: string; count: number; error?: string };
type SegmentsMap = Record<string, SegmentInfo>;

type PreviewData = {
  segment: string;
  label: string;
  total: number;
  sendable: number;
  opted_out: number;
  no_phone: number;
  first_names: string[];
};

type Campaign = {
  id: string;
  name: string;
  segment: string;
  status: "queued" | "sending" | "completed" | "failed";
  total_targets: number;
  total_sent: number;
  total_failed: number;
  total_skipped: number;
  created_at: string;
  completed_at: string | null;
};

type CampaignLog = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  phone: string | null;
  status: "pending" | "sent" | "skipped" | "failed";
  reason: string | null;
  rendered: string | null;
  sent_at: string | null;
};

const STATUS_PILL: Record<Campaign["status"], { label: string; className: string }> = {
  queued: { label: "En cola", className: "border-alma-hairline bg-alma-mist text-alma-ink/70" },
  sending: { label: "Enviando", className: "border-alma-sandstone bg-alma-oat text-alma-ink" },
  completed: { label: "Completada", className: "border-alma-olive/40 bg-alma-olive/10 text-alma-olive" },
  failed: { label: "Falló", className: "border-destructive/40 bg-destructive/10 text-destructive" },
};

const LOG_PILL: Record<CampaignLog["status"], { label: string; className: string; Icon: any }> = {
  pending: { label: "Pendiente", className: "text-alma-ink/40", Icon: Loader2 },
  sent: { label: "Enviado", className: "text-alma-olive", Icon: CheckCircle2 },
  skipped: { label: "Omitido", className: "text-alma-ink/55", Icon: MinusCircle },
  failed: { label: "Falló", className: "text-destructive", Icon: XCircle },
};

const CampaignsPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [name, setName] = useState("");
  const [segment, setSegment] = useState<string>("");
  const [message, setMessage] = useState("");
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [openCampaign, setOpenCampaign] = useState<Campaign | null>(null);

  const {
    data: segmentsData, isError: segmentsError, refetch: refetchSegments,
  } = useQuery<{ data: SegmentsMap }>({
    queryKey: ["campaign-segments"],
    queryFn: async () => (await api.get("/admin/campaigns/segments")).data,
  });
  const segments = segmentsData?.data || {};

  const {
    data: campaignsData, isLoading: campaignsLoading, isError: campaignsError, refetch: refetchCampaigns,
  } = useQuery<{ data: Campaign[] }>({
    queryKey: ["campaigns"],
    queryFn: async () => (await api.get("/admin/campaigns")).data,
    refetchInterval: 5000,
  });
  const campaigns = Array.isArray(campaignsData?.data) ? campaignsData.data : [];

  const previewMutation = useMutation({
    mutationFn: async () => (await api.post("/admin/campaigns/preview", { segment })).data,
    onSuccess: (res: { data: PreviewData }) => setPreviewData(res.data),
    onError: () => toast({ title: "Error", description: "No se pudo previsualizar", variant: "destructive" }),
  });

  const sendMutation = useMutation({
    // confirm:true se manda solo tras la confirmación explícita del admin
    // cuando el server responde 409 (campaña por encima del tope blando).
    mutationFn: async (confirmFlag: boolean = false) =>
      (await api.post("/admin/campaigns/send", { name, segment, message, confirm: confirmFlag })).data,
    onSuccess: (res) => {
      toast({
        title: "Campaña en cola",
        description: `Enviando a ${res.data?.total_targets || 0} alumnas. Tarda ~${Math.ceil((res.data?.total_targets || 0) * 1.3 / 60)} min.`,
      });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setName("");
      setSegment("");
      setMessage("");
      setPreviewData(null);
    },
    onError: async (err: any) => {
      const data = err?.response?.data;
      // 409: el server pide confirmación porque supera el tope blando.
      if (err?.response?.status === 409 && data?.requiresConfirm) {
        const ok = await confirm({
          title: `¿Enviar a ${data.count} personas?`,
          description: "Esta campaña supera el tope habitual. Es un envío masivo de WhatsApp y no se puede deshacer una vez en cola.",
          confirmLabel: "Sí, enviar",
          destructive: true,
        });
        if (ok) sendMutation.mutate(true);
        return;
      }
      // 403: por encima del tope duro, requiere super admin.
      if (err?.response?.status === 403 && data?.requiresSuperAdmin) {
        toast({ title: "Envío bloqueado", description: data.message, variant: "destructive" });
        return;
      }
      toast({ title: "Error", description: data?.message || "No se pudo enviar", variant: "destructive" });
    },
  });

  const {
    data: logsData, isError: logsError, refetch: refetchLogs,
  } = useQuery<{ data: CampaignLog[] }>({
    queryKey: ["campaign-logs", openCampaign?.id],
    queryFn: async () => (await api.get(`/admin/campaigns/${openCampaign?.id}/logs`)).data,
    enabled: !!openCampaign?.id,
    refetchInterval: openCampaign?.status === "sending" ? 3000 : false,
  });
  const logs = Array.isArray(logsData?.data) ? logsData.data : [];

  const canPreview = !!segment;
  const canSend = !!name.trim() && !!segment && !!message.trim() && !!previewData;

  const handleSend = async () => {
    // Primer intento sin confirm. Si supera el tope, el server
    // responde 409 y onError pide la confirmación con el conteo real.
    const ok = await confirm({
      title: "¿Enviar esta campaña por WhatsApp?",
      description: `Se mandará el mensaje a ${previewData?.sendable ?? 0} alumnas del segmento "${segments[segment]?.label || segment}". Una vez en cola no se puede deshacer.`,
      confirmLabel: "Enviar ahora",
      destructive: true,
    });
    if (ok) sendMutation.mutate(false);
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl space-y-6">
          {/* ── Header ── */}
          <div>
            <h1 className="admin-title font-display leading-none text-alma-ink">Campañas WhatsApp</h1>
            <p className="mt-1.5 text-sm text-alma-ink/55">
              Manda promos a un segmento de alumnas. Respeta opt-out y tarda ~1.3s por mensaje.
            </p>
          </div>

          {/* ── Compose ── */}
          <div className="space-y-4 rounded-2xl border border-alma-hairline bg-alma-mist p-5">
            {segmentsError ? (
              <ErrorState
                title="No pudimos cargar los segmentos"
                description="Sin segmentos no se puede componer una campaña."
                onRetry={() => refetchSegments()}
              />
            ) : (
              <>
                <div>
                  <Label className="mb-1.5 block text-[0.72rem] uppercase tracking-widest text-alma-ink/70">
                    Nombre interno
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Reactivación mayo"
                    className="bg-alma-canvas"
                  />
                </div>

                <div>
                  <Label className="mb-1.5 block text-[0.72rem] uppercase tracking-widest text-alma-ink/70">
                    Segmento
                  </Label>
                  <Select value={segment} onValueChange={(v) => { setSegment(v); setPreviewData(null); }}>
                    <SelectTrigger className="bg-alma-canvas">
                      <SelectValue placeholder="Elige a quién mandar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(segments).map(([key, info]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <span>{info.label}</span>
                            <Badge variant="outline" className="nums border-alma-sandstone text-[10px] text-alma-ink/60">
                              {info.count}
                            </Badge>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {segment && segments[segment] && (
                    <p className="nums mt-1.5 text-[11px] text-alma-ink/55">
                      {segments[segment].count} alumna{segments[segment].count === 1 ? "" : "s"} en este segmento
                    </p>
                  )}
                </div>

                <div>
                  <Label className="mb-1.5 block text-[0.72rem] uppercase tracking-widest text-alma-ink/70">
                    Mensaje
                  </Label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Hola {firstName}, esta semana te tenemos…"
                    rows={4}
                    className="resize-none bg-alma-canvas"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="text-alma-ink/55">Variables:</span>
                    {["{firstName}", "{days}"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setMessage((m) => m + v)}
                        className="rounded border border-alma-hairline bg-alma-canvas px-1.5 py-0.5 text-alma-ink/70 transition-colors hover:bg-alma-oat/50 hover:text-alma-ink"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Preview result ── */}
                {previewData && (
                  <div className="rounded-xl border border-alma-sandstone bg-alma-oat/40 p-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-alma-ink">
                        <strong className="nums">{previewData.sendable}</strong> alumnas recibirán el mensaje
                      </span>
                      <span className="nums text-xs text-alma-ink/55">
                        · {previewData.opted_out} opt-out · {previewData.no_phone} sin tel
                      </span>
                    </div>
                    {previewData.first_names.length > 0 && (
                      <p className="mt-2 text-[11px] text-alma-ink/60">
                        Empezando por: {previewData.first_names.join(", ")}
                        {previewData.total > previewData.first_names.length && "…"}
                      </p>
                    )}
                    <p className="nums mt-2 text-[11px] text-alma-ink/55">
                      Tiempo estimado: ~{Math.ceil(previewData.sendable * 1.3 / 60)} min
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    onClick={() => previewMutation.mutate()}
                    disabled={!canPreview || previewMutation.isPending}
                    variant="outline"
                    className="border-alma-sandstone"
                    data-press
                  >
                    {previewMutation.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Eye size={14} className="mr-2" />}
                    Previsualizar
                  </Button>
                  <Button onClick={handleSend} disabled={!canSend || sendMutation.isPending} data-press>
                    {sendMutation.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Send size={14} className="mr-2" />}
                    Enviar ahora
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* ── History ── */}
          <div className="rounded-2xl border border-alma-hairline bg-alma-mist p-5">
            <div className="mb-4 flex items-center gap-2">
              <History size={16} className="text-alma-ink/55" />
              <h2 className="font-display text-base font-semibold text-alma-ink">Historial</h2>
            </div>
            {campaignsError ? (
              <ErrorState
                title="No pudimos cargar el historial"
                onRetry={() => refetchCampaigns()}
              />
            ) : campaignsLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : campaigns.length === 0 ? (
              <div className="py-6 text-center">
                <Send size={24} className="mx-auto mb-2 text-alma-ink/35" />
                <p className="text-sm font-medium text-alma-ink">Aún no has mandado ninguna campaña</p>
                <p className="mt-1 text-xs text-alma-ink/55">
                  Compón la primera arriba: elige segmento, escribe el mensaje y previsualiza.
                </p>
              </div>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[0.72rem] uppercase tracking-widest text-alma-ink/50">
                      <th className="px-2 py-2 text-left font-normal">Nombre</th>
                      <th className="px-2 py-2 text-left font-normal">Segmento</th>
                      <th className="px-2 py-2 text-right font-normal">Total</th>
                      <th className="px-2 py-2 text-right font-normal">Enviadas</th>
                      <th className="px-2 py-2 text-right font-normal">Estado</th>
                      <th className="px-2 py-2 text-right font-normal">Cuándo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setOpenCampaign(c)}
                        className="cursor-pointer border-t border-alma-hairline transition-colors hover:bg-alma-oat/30"
                      >
                        <td className="max-w-[200px] truncate px-2 py-3 text-alma-ink">{c.name}</td>
                        <td className="max-w-[160px] truncate px-2 py-3 text-xs text-alma-ink/60">
                          {segments[c.segment]?.label || c.segment}
                        </td>
                        <td className="nums px-2 py-3 text-right text-alma-ink/70">{c.total_targets}</td>
                        <td className="nums px-2 py-3 text-right">
                          <span className="text-alma-olive">{c.total_sent}</span>
                          {c.total_failed > 0 && <span className="ml-1 text-destructive">+{c.total_failed}f</span>}
                          {c.total_skipped > 0 && <span className="ml-1 text-alma-ink/50">+{c.total_skipped}s</span>}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium", STATUS_PILL[c.status].className)}>
                            {STATUS_PILL[c.status].label}
                          </span>
                        </td>
                        <td className="nums whitespace-nowrap px-2 py-3 text-right text-[11px] text-alma-ink/50">
                          {formatDateTime(c.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Detail dialog ── */}
        <Dialog open={!!openCampaign} onOpenChange={(o) => !o && setOpenCampaign(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-alma-ink">{openCampaign?.name}</DialogTitle>
            </DialogHeader>
            {openCampaign && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg border border-alma-hairline bg-alma-mist p-2">
                    <p className="text-[0.68rem] uppercase tracking-wide text-alma-ink/55">Total</p>
                    <p className="font-display nums text-lg text-alma-ink">{openCampaign.total_targets}</p>
                  </div>
                  <div className="rounded-lg border border-alma-olive/30 bg-alma-olive/10 p-2">
                    <p className="text-[0.68rem] uppercase tracking-wide text-alma-olive">Enviadas</p>
                    <p className="font-display nums text-lg text-alma-olive">{openCampaign.total_sent}</p>
                  </div>
                  <div className="rounded-lg border border-alma-hairline bg-alma-mist p-2">
                    <p className="text-[0.68rem] uppercase tracking-wide text-alma-ink/55">Omitidas</p>
                    <p className="font-display nums text-lg text-alma-ink/70">{openCampaign.total_skipped}</p>
                  </div>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2">
                    <p className="text-[0.68rem] uppercase tracking-wide text-destructive">Fallidas</p>
                    <p className="font-display nums text-lg text-destructive">{openCampaign.total_failed}</p>
                  </div>
                </div>
                {logsError ? (
                  <ErrorState
                    title="No pudimos cargar el detalle"
                    onRetry={() => refetchLogs()}
                  />
                ) : (
                  <div className="max-h-[400px] overflow-y-auto rounded-lg border border-alma-hairline">
                    <table className="w-full text-xs">
                      <tbody>
                        {logs.map((log) => {
                          const pill = LOG_PILL[log.status];
                          const Icon = pill.Icon;
                          return (
                            <tr key={log.id} className="border-t border-alma-hairline first:border-t-0">
                              <td className="w-7 px-3 py-2">
                                <Icon size={12} className={cn(pill.className, log.status === "pending" && "animate-spin")} />
                              </td>
                              <td className="max-w-[140px] truncate px-2 py-2 text-alma-ink">
                                {log.display_name || "—"}
                              </td>
                              <td className="nums px-2 py-2 text-[10px] text-alma-ink/50">{log.phone || "—"}</td>
                              <td className="px-2 py-2 text-[10px] text-alma-ink/55">{log.reason || ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
        {dialog}
      </AdminLayout>
    </AuthGuard>
  );
};

export default CampaignsPage;
