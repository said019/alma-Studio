import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState } from "@/components/app/AppShell";
import { formatMXN } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Users, CheckCircle2,
  RotateCcw, ArrowLeft, UserCheck, UserX, Calendar, Plus, Search, XCircle, Ban, UserPlus,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import VisitAssignDialog from "@/components/admin/VisitAssignDialog";

// ── Types ──────────────────────────────────────────────────────────────────────
interface RosterEntry {
  bookingId: string;
  status: string;
  checkedInAt: string | null;
  userId: string;
  displayName: string;
  email: string;
  phone: string | null;
  planName: string | null;
  classesRemaining: number | null;
}

interface ClientOption {
  id: string;
  displayName: string;
  email?: string;
  phone?: string | null;
}

// ── Status config ──────────────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; className: string }> = {
  confirmed:  { label: "Confirmada",      className: "text-alma-berry border-alma-sandstone/60 bg-alma-oat/40" },
  checked_in: { label: "Asistió",         className: "text-alma-olive border-alma-olive/40 bg-alma-olive/10 font-semibold" },
  waitlist:   { label: "Lista de espera", className: "text-alma-ink/55 border-alma-hairline bg-alma-canvas" },
  no_show:    { label: "No asistió",      className: "text-destructive border-destructive/30 bg-destructive/5" },
  cancelled:  { label: "Cancelada",       className: "text-alma-ink/40 border-alma-hairline bg-transparent" },
};

// ── Diálogo de cancelar reserva: muestra la ventana (a tiempo/tarde) y deja
// elegir si devolver el crédito. Default: devolver (la admin desmarca si no). ──
const CancelBookingDialog = ({
  entry, classStartsAt, windowHours, pending, onConfirm, onClose,
}: {
  entry: RosterEntry | null;
  classStartsAt: string | null;
  windowHours: number;
  pending: boolean;
  onConfirm: (args: { reason?: string; refundCredit: boolean }) => void;
  onClose: () => void;
}) => {
  const [reason, setReason] = useState("");
  const [refundCredit, setRefundCredit] = useState(true);

  useEffect(() => {
    if (entry) { setReason(""); setRefundCredit(true); }
  }, [entry?.bookingId]);

  if (!entry) return null;

  const isUnlimited = entry.classesRemaining == null || entry.classesRemaining >= 9999;
  const minutesUntil = classStartsAt ? (new Date(classStartsAt).getTime() - Date.now()) / 60000 : null;
  const isLate = minutesUntil != null && minutesUntil < windowHours * 60;
  const timeLabel = minutesUntil == null ? null
    : minutesUntil < 0 ? "La clase ya pasó"
    : minutesUntil < 60 ? `Faltan ${Math.round(minutesUntil)} min`
    : `Faltan ${Math.round(minutesUntil / 60)} h`;

  return (
    <Dialog open={!!entry} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md bg-alma-canvas border-alma-hairline text-alma-ink">
        <DialogHeader>
          <DialogTitle className="font-display text-alma-ink">Cancelar reserva de {entry.displayName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {timeLabel && (
            <div className={cn(
              "rounded-xl border px-3 py-2 text-sm font-medium",
              isLate ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-alma-olive/40 bg-alma-olive/10 text-alma-olive",
            )}>
              {timeLabel} para la clase — {isLate ? `tarde (dentro de ${windowHours}h)` : "a tiempo"}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-alma-ink/70">Motivo (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. nos pidió moverla por teléfono"
              rows={2}
              className="bg-alma-canvas border-alma-sandstone/60 text-alma-ink placeholder:text-alma-ink/40"
            />
            <p className="text-[11px] text-alma-ink/50">Se incluye en el WhatsApp que le llega a {entry.displayName}.</p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-alma-hairline bg-alma-mist px-4 py-3">
            <div>
              <Label className="text-sm font-medium text-alma-ink">Devolver crédito</Label>
              <p className="text-xs text-alma-ink/55">
                {isUnlimited
                  ? "Plan ilimitado — no usa créditos."
                  : refundCredit
                    ? "La clase regresa a su paquete."
                    : "La clase cuenta como usada (no se devuelve)."}
              </p>
            </div>
            <Switch
              checked={refundCredit && !isUnlimited}
              onCheckedChange={setRefundCredit}
              disabled={isUnlimited}
              className="data-[state=checked]:bg-alma-ink data-[state=unchecked]:bg-alma-sandstone/60"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-alma-sandstone/70 bg-transparent text-alma-ink hover:bg-alma-mist" onClick={onClose} disabled={pending}>
            Volver
          </Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onConfirm({ reason: reason.trim() || undefined, refundCredit: isUnlimited ? false : refundCredit })}
            disabled={pending}
          >
            {pending ? "Cancelando…" : "Cancelar reserva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Class Roster panel ─────────────────────────────────────────────────────────
const ClassRoster = ({ classId, onBack }: { classId: string; onBack: () => void }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, promptText, dialog } = useConfirm();
  const [cancelTarget, setCancelTarget] = useState<RosterEntry | null>(null);
  const { data: loyaltyCfgData } = useQuery<{ data: { faltas_cancel_window_hours?: number } }>({
    queryKey: ["loyalty-config"],
    queryFn: async () => (await api.get("/loyalty/config")).data,
  });
  const creditWindowHours = Number(loyaltyCfgData?.data?.faltas_cancel_window_hours ?? 12) || 12;
  const [assignOpen, setAssignOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const debouncedMemberSearch = useDebounce(memberSearch, 250);

  // ── Asignar socia + acompañante (opcional, descuenta 2 créditos) ──
  const [assignWithGuest, setAssignWithGuest] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClientOption | null>(null);
  const [agGuestPhone, setAgGuestPhone] = useState("");
  const [agGuestName, setAgGuestName] = useState("");
  const [agGuestEmail, setAgGuestEmail] = useState("");
  const [agGuestInjury, setAgGuestInjury] = useState(false);
  const [agGuestInjuryDetails, setAgGuestInjuryDetails] = useState("");
  const [agGuestPracticed, setAgGuestPracticed] = useState(false);
  const [agGuestWaiver, setAgGuestWaiver] = useState(false);
  const [agSearching, setAgSearching] = useState(false);
  const [agFound, setAgFound] = useState(false);

  const resetAssignForm = () => {
    setAssignWithGuest(false);
    setSelectedMember(null);
    setMemberSearch("");
    setAgGuestPhone(""); setAgGuestName(""); setAgGuestEmail("");
    setAgGuestInjury(false); setAgGuestInjuryDetails("");
    setAgGuestPracticed(false); setAgGuestWaiver(false);
    setAgFound(false);
    setGuestChargeMode("host_pack");
    setGuestSalePlanId("");
    setGuestSalePayment("cash");
  };

  const searchAdminGuest = async () => {
    if (!agGuestPhone.trim()) return;
    setAgSearching(true);
    try {
      const r = await api.get(`/admin/guest-profiles/search?phone=${encodeURIComponent(agGuestPhone)}`);
      const data = r.data?.data;
      if (data?.profile) {
        const g = data.profile;
        setAgFound(true);
        setAgGuestName(g.display_name || "");
        setAgGuestEmail(g.email || "");
        setAgGuestInjury(g.has_injury === true);
        setAgGuestInjuryDetails(g.injury_details || "");
        setAgGuestPracticed(g.practiced_barre_before === true);
        toast({ title: "Acompañante encontrada", description: "Cuestionario cargado." });
      } else {
        setAgFound(false);
        toast({ title: "Nueva acompañante", description: "Llena el cuestionario abajo." });
      }
    } catch {
      toast({ title: "Error al buscar", variant: "destructive" });
    } finally {
      setAgSearching(false);
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["roster", classId],
    queryFn: async () => (await api.get(`/classes/${classId}/roster`)).data,
    refetchInterval: 15000,
  });

  const classInfo = data?.data?.class ?? null;
  const roster: RosterEntry[] = data?.data?.roster ?? [];
  const { data: usersData, isFetching: searchingUsers } = useQuery<{ data: ClientOption[] }>({
    queryKey: ["booking-assign-users", classId, debouncedMemberSearch],
    enabled: assignOpen,
    queryFn: async () => (
      await api.get(`/users?role=client${debouncedMemberSearch ? `&search=${encodeURIComponent(debouncedMemberSearch)}` : ""}`)
    ).data,
  });
  const userOptions = Array.isArray(usersData?.data) ? usersData.data : [];

  const checkinMutation = useMutation({
    mutationFn: (id: string) => api.put(`/bookings/${id}/check-in`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      toast({ title: "Check-in registrado" });
    },
    onError: () => toast({ title: "Error al hacer check-in", variant: "destructive" }),
  });

  const noShowMutation = useMutation({
    mutationFn: (id: string) => api.put(`/bookings/${id}/no-show`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      toast({ title: "Marcada como no asistió" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  // Admin cancela reserva (override política 2h, devuelve crédito).
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason, refundCredit }: { id: string; reason?: string; refundCredit: boolean }) =>
      api.delete(`/admin/bookings/${id}`, { data: { reason, refundCredit } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      const restored = res?.data?.data?.credit_restored;
      toast({
        title: "Reserva cancelada",
        description: restored ? "Crédito devuelto a la alumna." : "Cancelada (sin crédito por devolver).",
      });
      setCancelTarget(null);
    },
    onError: (e: any) => toast({
      title: "Error al cancelar",
      description: e?.response?.data?.message || "Inténtalo de nuevo",
      variant: "destructive",
    }),
  });

  // Admin cancela la clase completa (cascada: todos los bookings + créditos + WA).
  const cancelClassMutation = useMutation({
    mutationFn: (reason?: string) =>
      api.put(`/classes/${classId}/cancel`, { reason }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      qc.invalidateQueries({ queryKey: ["classes"] });
      const d = res?.data?.data || {};
      toast({
        title: "Clase cancelada",
        description: `${d.bookings_cancelled ?? 0} reservas canceladas · ${d.credits_restored ?? 0} créditos devueltos · ${d.wa_sent ?? 0} WhatsApps`,
      });
    },
    onError: (e: any) => toast({
      title: "Error",
      description: e?.response?.data?.message || "No se pudo cancelar",
      variant: "destructive",
    }),
  });

  const assignMutation = useMutation({
    mutationFn: (vars: { userId: string; guest?: any; guestSale?: any }) =>
      api.post("/admin/bookings/assign", {
        classId,
        userId: vars.userId,
        guest: vars.guest,
        guestSale: vars.guestSale,
      }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      const msg = res?.data?.message ?? "Reserva asignada";
      toast({ title: msg });
      setAssignOpen(false);
      resetAssignForm();
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al asignar reserva", variant: "destructive" });
    },
  });

  // ── Cobro de la acompañante ──────────────────────────────────────
  // Modo 'host_pack': usa el pack de visitas de la socia (default, comportamiento anterior).
  // Modo 'guest_sale': vende clase suelta (o cualquier plan) directo a la acompañante.
  const [guestChargeMode, setGuestChargeMode] = useState<"host_pack" | "guest_sale">("host_pack");
  const [guestSalePlanId, setGuestSalePlanId] = useState<string>("");
  const [guestSalePayment, setGuestSalePayment] = useState<"cash" | "transfer" | "card">("cash");
  const { data: plansData } = useQuery<{ data: any[] }>({
    queryKey: ["plans-for-guest-sale"],
    queryFn: async () => (await api.get("/plans")).data,
    enabled: assignOpen && assignWithGuest && guestChargeMode === "guest_sale",
  });
  const guestSalePlans = (Array.isArray(plansData?.data) ? plansData!.data : [])
    .filter((p: any) => p.is_active !== false)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price ?? 0),
      classLimit: p.class_limit ?? p.classLimit ?? 1,
      isVisitPack: p.is_visit_pack === true || p.isVisitPack === true,
    }))
    // Ordenar primero los visit-pack (clase suelta, paquetes de visita)
    .sort((a: any, b: any) => (b.isVisitPack ? 1 : 0) - (a.isVisitPack ? 1 : 0));

  const checkedIn = roster.filter((r) => r.status === "checked_in").length;
  const confirmed = roster.filter((r) => r.status === "confirmed").length;
  const waitlist  = roster.filter((r) => r.status === "waitlist").length;
  const noShow    = roster.filter((r) => r.status === "no_show").length;

  const handleCancelClass = async () => {
    const total = confirmed + waitlist;
    const reason = await promptText({
      title: "Motivo de cancelación",
      description: `Se incluye en el WhatsApp a la${total === 1 ? "" : "s"} ${total} alumna${total === 1 ? "" : "s"}. Puedes dejarlo vacío.`,
      placeholder: "Ej. la instructora se enfermó",
      confirmLabel: "Continuar",
    });
    if (reason === null) return;
    const ok = await confirm({
      title: "¿Cancelar la clase completa?",
      description: `Se cancela${total === 1 ? "" : "n"} ${total} reserva${total === 1 ? "" : "s"}, se devuelve${confirmed === 1 ? "" : "n"} ${confirmed} crédito${confirmed === 1 ? "" : "s"} y se avisa por WhatsApp a cada alumna.`,
      destructive: true,
      confirmLabel: "Cancelar clase",
      cancelLabel: "Volver",
    });
    if (!ok) return;
    cancelClassMutation.mutate(reason || undefined);
  };

  const handleCancelBooking = (entry: RosterEntry) => {
    // Abre el diálogo dedicado (ventana de política + elección de crédito).
    setCancelTarget(entry);
  };

  const backButton = (
    <button
      onClick={onBack}
      className="flex items-center gap-2 text-sm text-alma-ink/55 transition-colors hover:text-alma-ink"
    >
      <ArrowLeft size={14} /> Volver al calendario
    </button>
  );

  if (isError) {
    return (
      <div className="space-y-5">
        {backButton}
        <ErrorState
          title="No pudimos cargar la clase"
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {backButton}

      {/* Class header */}
      {isLoading ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : classInfo && (
        <div className="rounded-2xl border border-alma-hairline bg-alma-mist p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: classInfo.color || "#CBB9A4" }}
                />
                <h2 className="font-display text-xl text-alma-ink">{classInfo.classTypeName}</h2>
              </div>
              <p className="nums text-sm capitalize text-alma-ink/60">
                {classInfo.startsAt
                  ? format(new Date(classInfo.startsAt), "EEEE d 'de' MMMM · HH:mm", { locale: es })
                  : classInfo.date ?? "—"}
              </p>
              <p className="mt-0.5 text-xs text-alma-ink/45">Instructora: {classInfo.instructorName}</p>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1 text-xs text-alma-berry/70 transition-colors hover:text-alma-berry"
            >
              <RotateCcw size={11} /> Actualizar
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setAssignOpen(true)}
              data-press
              className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep"
            >
              <Plus size={14} className="mr-1" /> Asignar socia
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVisitOpen(true)}
              data-press
              className="border-alma-sandstone/70 bg-transparent text-alma-ink hover:bg-alma-oat/40 hover:text-alma-ink"
            >
              <UserPlus size={14} className="mr-1" /> Asignar visitante
            </Button>
            {(confirmed > 0 || waitlist > 0) && (
              <Button
                size="sm"
                variant="outline"
                data-press
                onClick={handleCancelClass}
                disabled={cancelClassMutation.isPending}
                className="border-destructive/40 bg-transparent text-destructive hover:bg-destructive/5 hover:text-destructive"
              >
                <Ban size={14} className="mr-1" /> Cancelar clase
              </Button>
            )}
          </div>

          {/* Contadores del roster: fila editorial con hairlines */}
          <dl className="mt-5 grid grid-cols-4 divide-x divide-alma-hairline border-t border-alma-hairline">
            {[
              { label: "Confirmadas", value: confirmed },
              { label: "Asistieron",  value: checkedIn, accent: "text-alma-olive" },
              { label: "En espera",   value: waitlist },
              { label: "Faltas",      value: noShow },
            ].map((s) => (
              <div key={s.label} className="px-3 py-3 first:pl-0">
                <dt className="truncate text-[0.72rem] uppercase tracking-[0.12em] text-alma-ink/55">{s.label}</dt>
                <dd className={cn("nums mt-1 font-display text-xl leading-none", s.accent ?? "text-alma-ink")}>
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Roster list */}
      <div className="space-y-2">
        {isLoading
          ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
          : roster.length === 0
            ? (
              <div className="py-12 text-center text-sm text-alma-ink/55">
                <Users size={28} className="mx-auto mb-2 text-alma-ink/30" />
                No hay reservas para esta clase
              </div>
            )
            : roster.map((entry) => {
              const sc = statusConfig[entry.status] ?? statusConfig.confirmed;
              const canCheckin = entry.status === "confirmed" || entry.status === "waitlist";
              const canNoShow  = entry.status === "confirmed";
              const canCancel  = entry.status === "confirmed" || entry.status === "waitlist";
              return (
                <div
                  key={entry.bookingId}
                  className={cn(
                    "flex items-center gap-4 rounded-xl border p-4 transition-colors",
                    entry.status === "checked_in"
                      ? "border-alma-olive/30 bg-alma-olive/[0.07]"
                      : entry.status === "no_show"
                        ? "border-alma-hairline bg-alma-mist opacity-60"
                        : "border-alma-hairline bg-alma-mist hover:bg-alma-oat/30"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    entry.status === "checked_in"
                      ? "border border-alma-olive/30 bg-alma-olive/15 text-alma-olive"
                      : "border border-alma-sandstone/50 bg-alma-oat text-alma-berry"
                  )}>
                    {entry.status === "checked_in"
                      ? <UserCheck size={16} />
                      : entry.displayName?.[0]?.toUpperCase() ?? "?"}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-alma-ink">{entry.displayName}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="truncate text-xs text-alma-ink/50">{entry.email}</span>
                      {entry.phone && <span className="nums text-xs text-alma-ink/40">{entry.phone}</span>}
                    </div>
                    {entry.planName && (
                      <p className="nums mt-0.5 text-[10px] text-alma-berry/80">
                        {entry.planName}
                        {entry.classesRemaining !== null
                          ? ` · ${entry.classesRemaining} clases restantes`
                          : " · Ilimitado"}
                      </p>
                    )}
                  </div>

                  {/* Status badge */}
                  <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold", sc.className)}>
                    {sc.label}
                  </span>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    {canCheckin && (
                      <button
                        onClick={() => checkinMutation.mutate(entry.bookingId)}
                        disabled={checkinMutation.isPending}
                        title="Check-in"
                        aria-label={`Check-in de ${entry.displayName}`}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-alma-olive/40 bg-alma-olive/10 text-alma-olive transition-colors hover:bg-alma-olive/20 disabled:opacity-40"
                      >
                        <CheckCircle2 size={15} />
                      </button>
                    )}
                    {canNoShow && (
                      <button
                        onClick={() => noShowMutation.mutate(entry.bookingId)}
                        disabled={noShowMutation.isPending}
                        title="No asistió"
                        aria-label={`Marcar a ${entry.displayName} como no asistió`}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-alma-hairline bg-transparent text-alma-ink/50 transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:opacity-40"
                      >
                        <UserX size={15} />
                      </button>
                    )}
                    {canCancel && (
                      <button
                        data-press
                        onClick={() => handleCancelBooking(entry)}
                        disabled={cancelMutation.isPending}
                        title="Cancelar reserva (devuelve crédito)"
                        aria-label={`Cancelar reserva de ${entry.displayName}`}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-alma-sandstone/60 bg-transparent text-alma-ink/55 transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:opacity-40"
                      >
                        <XCircle size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
        }
      </div>

      {/* Asignar socia (+ acompañante): panel lateral */}
      <Sheet
        open={assignOpen}
        onOpenChange={(next) => {
          setAssignOpen(next);
          if (!next) resetAssignForm();
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-display text-alma-ink">Asignar reserva a socia</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {/* Toggle "+ acompañante" */}
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-alma-hairline bg-alma-mist p-2.5">
              <input
                type="checkbox"
                checked={assignWithGuest}
                onChange={(e) => { setAssignWithGuest(e.target.checked); if (!e.target.checked) setSelectedMember(null); }}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium text-alma-ink">Llevará acompañante</span>
                <p className="text-[11px] text-alma-ink/55">
                  Descuenta 2 créditos: 1 del pack regular + 1 del pack de visitas de la socia.
                </p>
              </div>
            </label>

            {/* Paso 1: elegir socia */}
            {(!assignWithGuest || !selectedMember) && (
              <div className="space-y-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-alma-ink/40" />
                  <Input
                    className="pl-8"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Buscar por nombre, email o teléfono"
                  />
                </div>
                <div className="max-h-72 overflow-auto rounded-xl border border-alma-hairline">
                  {searchingUsers ? (
                    <p className="px-3 py-2 text-xs text-alma-ink/55">Buscando…</p>
                  ) : userOptions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-alma-ink/55">Sin resultados</p>
                  ) : (
                    userOptions.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        disabled={assignMutation.isPending}
                        onClick={() => {
                          if (assignWithGuest) {
                            setSelectedMember(u);
                          } else {
                            assignMutation.mutate({ userId: u.id });
                          }
                        }}
                        className="w-full border-b border-alma-hairline px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-alma-oat/40 disabled:opacity-60"
                      >
                        <p className="text-sm font-medium text-alma-ink">{u.displayName}</p>
                        <p className="text-xs text-alma-ink/55">
                          {u.email ?? "—"}
                          {u.phone ? ` · ${u.phone}` : ""}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Paso 2: socia ya elegida + form acompañante */}
            {assignWithGuest && selectedMember && (
              <div className="space-y-3">
                {/* Tarjeta de socia seleccionada */}
                <div className="flex items-start justify-between gap-2 rounded-xl border border-alma-sandstone/60 bg-alma-oat/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[0.72rem] uppercase tracking-[0.12em] text-alma-berry">Socia</p>
                    <p className="truncate text-sm font-medium text-alma-ink">{selectedMember.displayName}</p>
                    <p className="truncate text-[11px] text-alma-ink/55">
                      {selectedMember.email ?? "—"}{selectedMember.phone ? ` · ${selectedMember.phone}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] text-alma-ink/55 transition-colors hover:text-alma-ink"
                    onClick={() => setSelectedMember(null)}
                  >
                    Cambiar
                  </button>
                </div>

                {/* Form acompañante */}
                <div className="space-y-3 rounded-xl border border-alma-hairline bg-alma-mist p-3">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-alma-ink/55">
                    Acompañante
                  </p>

                  <div className="space-y-1">
                    <label className="text-xs text-alma-ink">Teléfono</label>
                    <div className="flex gap-2">
                      <Input
                        value={agGuestPhone}
                        onChange={(e) => { setAgGuestPhone(e.target.value); setAgFound(false); }}
                        placeholder="10 dígitos"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={searchAdminGuest}
                        disabled={!agGuestPhone.trim() || agSearching}
                        className="border-alma-sandstone/70 bg-transparent text-alma-ink hover:bg-alma-oat/40 hover:text-alma-ink"
                      >
                        {agSearching ? "…" : <Search size={14} />}
                      </Button>
                    </div>
                    {agFound && (
                      <p className="text-[11px] text-alma-olive">
                        Ya estuvo antes, cuestionario cargado.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-alma-ink">Nombre</label>
                    <Input
                      value={agGuestName}
                      onChange={(e) => setAgGuestName(e.target.value)}
                      placeholder="Nombre y apellido"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-alma-ink">Email (opcional)</label>
                    <Input
                      type="email"
                      value={agGuestEmail}
                      onChange={(e) => setAgGuestEmail(e.target.value)}
                      placeholder="ej. ana@correo.com"
                    />
                  </div>

                  <div className="space-y-2 border-t border-alma-hairline pt-2.5">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-alma-ink/55">
                      Cuestionario inicial
                    </p>

                    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-alma-ink">
                      <span>¿Tiene lesión o condición física?</span>
                      <input
                        type="checkbox"
                        checked={agGuestInjury}
                        onChange={(e) => setAgGuestInjury(e.target.checked)}
                      />
                    </label>
                    {agGuestInjury && (
                      <textarea
                        rows={2}
                        value={agGuestInjuryDetails}
                        onChange={(e) => setAgGuestInjuryDetails(e.target.value)}
                        placeholder="Cuéntanos qué debemos saber"
                        className="w-full rounded-md border border-alma-sandstone/50 bg-alma-canvas px-3 py-1.5 text-xs text-alma-ink placeholder:text-alma-ink/40"
                      />
                    )}

                    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-alma-ink">
                      <span>¿Practicó pilates antes?</span>
                      <input
                        type="checkbox"
                        checked={agGuestPracticed}
                        onChange={(e) => setAgGuestPracticed(e.target.checked)}
                      />
                    </label>

                    <label className="flex cursor-pointer items-start justify-between gap-2 border-t border-alma-hairline pt-2 text-[11px] text-alma-ink">
                      <span className="leading-relaxed">
                        Confirmo que la acompañante leyó y aceptó los términos y riesgos.
                      </span>
                      <input
                        type="checkbox"
                        checked={agGuestWaiver}
                        onChange={(e) => setAgGuestWaiver(e.target.checked)}
                      />
                    </label>
                  </div>
                </div>

                {/* ── Cobro de la acompañante ───────────────────────────────── */}
                <div className="space-y-2.5 rounded-2xl border border-alma-hairline bg-alma-mist p-3">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-alma-ink/55">
                    Cobro de la acompañante
                  </p>
                  <div className="flex flex-col gap-2 text-xs text-alma-ink">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="guestChargeMode"
                        checked={guestChargeMode === "host_pack"}
                        onChange={() => setGuestChargeMode("host_pack")}
                        className="mt-0.5"
                      />
                      <span>
                        Usar <strong>pack de visitas de la socia</strong>
                        <span className="mt-0.5 block text-[10px] text-alma-ink/55">
                          Descuenta 1 crédito del pack de visitas activo. La socia debe tenerlo.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="guestChargeMode"
                        checked={guestChargeMode === "guest_sale"}
                        onChange={() => setGuestChargeMode("guest_sale")}
                        className="mt-0.5"
                      />
                      <span>
                        Venderle <strong>clase suelta / pack</strong> a la acompañante
                        <span className="mt-0.5 block text-[10px] text-alma-ink/55">
                          La socia no usa su pack de visitas; la acompañante paga su propia clase.
                        </span>
                      </span>
                    </label>
                  </div>

                  {guestChargeMode === "guest_sale" && (
                    <div className="space-y-2 border-t border-alma-hairline pt-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-alma-ink">Plan a vender</label>
                        <select
                          value={guestSalePlanId}
                          onChange={(e) => setGuestSalePlanId(e.target.value)}
                          className="w-full rounded-md border border-alma-sandstone/50 bg-alma-canvas px-2.5 py-1.5 text-xs text-alma-ink"
                        >
                          <option value="">— Seleccionar plan —</option>
                          {guestSalePlans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — {p.classLimit ?? "?"} clase{p.classLimit === 1 ? "" : "s"} · {formatMXN(p.price)}
                            </option>
                          ))}
                        </select>
                        {guestSalePlans.length === 0 && (
                          <p className="text-[10px] text-alma-ink/55">
                            Cargando planes… o marca al menos un plan como activo en Planes.
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-alma-ink">Método de pago</label>
                        <select
                          value={guestSalePayment}
                          onChange={(e) => setGuestSalePayment(e.target.value as any)}
                          className="w-full rounded-md border border-alma-sandstone/50 bg-alma-canvas px-2.5 py-1.5 text-xs text-alma-ink"
                        >
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transferencia</option>
                          <option value="card">Tarjeta</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setAssignOpen(false); resetAssignForm(); }}
                    disabled={assignMutation.isPending}
                    className="flex-1 border-alma-sandstone/70 bg-transparent text-alma-ink hover:bg-alma-oat/40 hover:text-alma-ink"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => assignMutation.mutate({
                      userId: selectedMember.id,
                      guest: {
                        name: agGuestName,
                        phone: agGuestPhone,
                        email: agGuestEmail || undefined,
                        hasInjury: agGuestInjury,
                        injuryDetails: agGuestInjury ? (agGuestInjuryDetails || null) : null,
                        practicedBarreBefore: agGuestPracticed,
                        acceptedWaiver: agGuestWaiver,
                      },
                      guestSale: guestChargeMode === "guest_sale"
                        ? { planId: guestSalePlanId, paymentMethod: guestSalePayment }
                        : undefined,
                    })}
                    disabled={
                      !agGuestName.trim() || !agGuestPhone.trim() || !agGuestWaiver ||
                      (guestChargeMode === "guest_sale" && !guestSalePlanId) ||
                      assignMutation.isPending
                    }
                    className="flex-1 bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep"
                  >
                    {assignMutation.isPending
                      ? "Asignando…"
                      : guestChargeMode === "guest_sale"
                        ? "Confirmar (socia + venta a invitada)"
                        : "Confirmar (2 créditos)"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <VisitAssignDialog
        classId={classId}
        open={visitOpen}
        onOpenChange={setVisitOpen}
        onSuccess={() => refetch()}
      />

      <CancelBookingDialog
        entry={cancelTarget}
        classStartsAt={classInfo?.startsAt ?? null}
        windowHours={creditWindowHours}
        pending={cancelMutation.isPending}
        onConfirm={({ reason, refundCredit }) => {
          if (cancelTarget) cancelMutation.mutate({ id: cancelTarget.bookingId, reason, refundCredit });
        }}
        onClose={() => setCancelTarget(null)}
      />

      {dialog}
    </div>
  );
};

// ── Weekly class picker ────────────────────────────────────────────────────────
const ClassPicker = ({ onSelectClass }: { onSelectClass: (id: string) => void }) => {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-classes-week", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () =>
      (await api.get(`/classes?start=${format(weekStart, "yyyy-MM-dd")}&end=${format(weekEnd, "yyyy-MM-dd")}`)).data,
  });
  const classes: any[] = Array.isArray(data?.data) ? data.data : [];

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-5">
      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setWeekStart((w) => subWeeks(w, 1))}
          aria-label="Semana anterior"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-alma-hairline text-alma-ink/55 transition-colors hover:border-alma-sandstone hover:text-alma-ink"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="nums min-w-[200px] text-center text-sm font-semibold text-alma-ink">
          {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
        </span>
        <button
          onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          aria-label="Semana siguiente"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-alma-hairline text-alma-ink/55 transition-colors hover:border-alma-sandstone hover:text-alma-ink"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          className="ml-2 text-xs text-alma-berry/70 transition-colors hover:text-alma-berry"
        >
          Hoy
        </button>
      </div>

      {isError ? (
        <ErrorState
          title="No pudimos cargar la semana"
          onRetry={() => refetch()}
        />
      ) : (
        <div className="space-y-4">
          {days.map((day) => {
            const dayStr = format(day, "yyyy-MM-dd");
            const dayClasses = classes
              .filter((c) => {
                // date field is always YYYY-MM-DD after server normalisation
                const d = (c.date as string)?.slice(0, 10)
                  ?? (c.start_time as string)?.slice(0, 10);
                return d === dayStr;
              })
              .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

            if (!dayClasses.length && !isLoading) return null;

            const isToday = dayStr === todayStr;

            return (
              <div key={dayStr}>
                <div className="mb-2 flex items-center gap-2">
                  <p className={cn(
                    "text-[0.72rem] font-semibold uppercase tracking-[0.12em]",
                    isToday ? "text-alma-berry" : "text-alma-ink/45"
                  )}>
                    {format(day, "EEEE d", { locale: es })}
                  </p>
                  {isToday && (
                    <span className="rounded-full bg-alma-oat px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-alma-ink">
                      Hoy
                    </span>
                  )}
                </div>

                {isLoading ? (
                  <Skeleton className="h-16 rounded-xl" />
                ) : (
                  <div className="space-y-2">
                    {dayClasses.map((cls) => {
                      const time = cls.start_time
                        ? format(new Date(cls.start_time), "HH:mm")
                        : cls.startTime ?? "—";
                      const capacity = cls.max_capacity ?? 0;
                      const booked   = cls.current_bookings ?? 0;
                      const full     = capacity > 0 && booked >= capacity;
                      const pct      = capacity > 0 ? Math.min(Math.round((booked / capacity) * 100), 100) : 0;

                      return (
                        <button
                          key={cls.id}
                          onClick={() => onSelectClass(cls.id)}
                          className="group flex w-full items-center gap-4 rounded-xl border border-alma-hairline bg-alma-mist p-4 text-left transition-colors hover:border-alma-sandstone hover:bg-alma-oat/30"
                        >
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: cls.class_type_color ?? cls.color ?? "#CBB9A4" }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-alma-ink">
                              {cls.class_type_name ?? cls.className ?? "Clase"}
                            </p>
                            <p className="nums text-xs text-alma-ink/55">{time} · {cls.instructor_name ?? "—"}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="text-right">
                              <p className={cn("nums text-sm font-bold", full ? "text-alma-ink" : "text-alma-ink/80")}>
                                {booked}/{capacity}
                              </p>
                              <p className="text-[10px] text-alma-ink/45">{full ? "llena" : "lugares"}</p>
                            </div>
                            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-alma-oat">
                              <div
                                className={cn("h-full rounded-full transition-all", full ? "bg-alma-ink" : "bg-alma-berry")}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <ChevronRight size={14} className="text-alma-ink/30 transition-colors group-hover:text-alma-berry" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {!isLoading && classes.length === 0 && (
            <div className="py-16 text-center text-sm text-alma-ink/55">
              <Calendar size={28} className="mx-auto mb-2 text-alma-ink/30" />
              No hay clases programadas esta semana
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────────
const BookingsList = () => {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-3xl">
          <SectionTabs
            tabs={[
              { label: "Semana", to: "/admin/bookings" },
              { label: "Hoy · pasar lista", to: "/admin/pasar-lista" },
            ]}
          />
          <div className="mb-7">
            <h1 className="admin-title mb-1 text-alma-ink">Reservas</h1>
            <p className="text-sm text-alma-ink/55">
              {selectedClassId
                ? "Lista de alumnas · check-in y asistencia"
                : "Selecciona una clase para ver su lista de alumnas"}
            </p>
          </div>

          {selectedClassId ? (
            <ClassRoster classId={selectedClassId} onBack={() => setSelectedClassId(null)} />
          ) : (
            <ClassPicker onSelectClass={setSelectedClassId} />
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default BookingsList;
