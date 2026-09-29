import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Check, Clock, Loader2, Users } from "lucide-react";
import api from "@/lib/api";
import { StaffGuard } from "@/components/staff/StaffGuard";
import { StaffLayout } from "@/components/staff/StaffLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface StaffClass {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  classTypeName: string;
  instructorName?: string | null;
  maxCapacity: number;
  currentBookings: number;
  confirmedCount: number;
  checkedInCount: number;
  waitlistCount: number;
}

interface RosterEntry {
  bookingId: string;
  displayName: string;
  status: string;
  checkedInAt?: string | null;
  guestName?: string | null;
  attentionRequired: boolean;
  attentionNote?: string | null;
}

interface RosterResponse {
  data: {
    class: StaffClass;
    roster: RosterEntry[];
  };
}

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const statusLabel: Record<string, string> = {
  confirmed: "Confirmada",
  checked_in: "Presente",
  waitlist: "En espera",
  no_show: "No asistió",
};

interface StaffOperationsProps {
  role: "instructor" | "reception";
}

export default function StaffOperations({ role }: StaffOperationsProps) {
  const allowedRoles = role === "reception" ? ["reception" as const] : ["instructor" as const];
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const today = todayKey();
  const classesPath = role === "reception"
    ? "/staff/reception/classes"
    : `/staff/instructor/classes?from=${today}&to=${addDays(today, 14)}`;

  const classesQuery = useQuery<{ data: StaffClass[] }>({
    queryKey: ["staff-classes", role, today],
    queryFn: async () => (await api.get(classesPath)).data,
  });
  const classes = useMemo(
    () => (Array.isArray(classesQuery.data?.data) ? classesQuery.data.data : []),
    [classesQuery.data],
  );

  useEffect(() => {
    if (!selectedClassId && classes.length) setSelectedClassId(classes[0].id);
    if (selectedClassId && !classes.some((item) => item.id === selectedClassId)) {
      setSelectedClassId(classes[0]?.id ?? null);
    }
  }, [classes, selectedClassId]);

  const rosterPath = selectedClassId
    ? `/staff/${role}/classes/${selectedClassId}/roster`
    : null;
  const rosterQuery = useQuery<RosterResponse>({
    queryKey: ["staff-roster", role, selectedClassId],
    enabled: Boolean(rosterPath),
    queryFn: async () => (await api.get(rosterPath!)).data,
  });
  const roster = rosterQuery.data?.data?.roster ?? [];

  const checkinMutation = useMutation({
    mutationFn: async (bookingId: string) => (await api.put(`/staff/bookings/${bookingId}/check-in`)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff-roster", role, selectedClassId] });
      void queryClient.invalidateQueries({ queryKey: ["staff-classes", role, today] });
      toast({ title: "Asistencia registrada" });
    },
    onError: () => toast({ title: "No se pudo registrar", variant: "destructive" }),
  });

  const heading = role === "reception" ? "Operación de hoy" : "Mis próximas clases";
  const description = role === "reception"
    ? "Check-in y ocupación del día, sin acceso a pagos, configuración ni expedientes."
    : "Solo aparecen las clases asignadas a tu perfil y su lista operativa.";

  return (
    <StaffGuard allowedRoles={allowedRoles}>
      <StaffLayout>
        <header className="mb-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-muted">HIVE Pilates Studio · Operación</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">{heading}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{description}</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="border-b border-line px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={17} /> Clases</h2>
            </div>
            {classesQuery.isLoading ? (
              <p className="p-5 text-sm text-ink-muted">Cargando agenda…</p>
            ) : classesQuery.isError ? (
              <p className="p-5 text-sm text-ink-muted">No pudimos cargar la agenda.</p>
            ) : classes.length === 0 ? (
              <p className="p-5 text-sm text-ink-muted">No hay clases dentro de este periodo.</p>
            ) : (
              <div className="divide-y divide-sunken">
                {classes.map((item) => {
                  const active = item.id === selectedClassId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedClassId(item.id)}
                      className={`w-full px-5 py-4 text-left transition-colors ${active ? "bg-sunken" : "hover:bg-canvas"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink">{item.classTypeName}</p>
                          <p className="mt-1 text-xs capitalize text-ink-muted">
                            {dateFormatter.format(new Date(`${item.date}T00:00:00Z`))} · {item.startTime}
                          </p>
                          {role === "reception" && item.instructorName && (
                            <p className="mt-1 text-xs text-ink-muted">{item.instructorName}</p>
                          )}
                        </div>
                        <span className="rounded-full bg-ink-muted/10 px-2 py-1 text-[11px] font-semibold text-ink-muted">
                          {item.checkedInCount}/{item.confirmedCount + item.checkedInCount}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Users size={17} /> Lista operativa</h2>
                {rosterQuery.data?.data?.class && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                    <Clock size={12} /> {rosterQuery.data.data.class.startTime}–{rosterQuery.data.data.class.endTime}
                  </p>
                )}
              </div>
            </div>

            {!selectedClassId ? (
              <p className="p-5 text-sm text-ink-muted">Selecciona una clase.</p>
            ) : rosterQuery.isLoading ? (
              <p className="p-5 text-sm text-ink-muted">Cargando lista…</p>
            ) : rosterQuery.isError ? (
              <p className="p-5 text-sm text-ink-muted">No tienes acceso a esta lista.</p>
            ) : roster.length === 0 ? (
              <p className="p-5 text-sm text-ink-muted">Todavía no hay reservas.</p>
            ) : (
              <div className="divide-y divide-sunken">
                {roster.map((entry) => (
                  <div key={entry.bookingId} className="flex items-center gap-3 px-5 py-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line text-sm font-semibold text-ink-muted">
                      {entry.displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{entry.displayName}</p>
                        {entry.attentionRequired && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                            <AlertTriangle size={10} />
                            {role === "instructor" && entry.attentionNote
                              ? entry.attentionNote
                              : "Atención"}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">{statusLabel[entry.status] ?? entry.status}</p>
                      {entry.guestName && <p className="mt-0.5 text-xs text-ink-muted">Invitada: {entry.guestName}</p>}
                    </div>
                    {entry.status === "confirmed" ? (
                      <Button
                        size="sm"
                        onClick={() => checkinMutation.mutate(entry.bookingId)}
                        disabled={checkinMutation.isPending}
                        className="rounded-xl bg-ink-muted hover:bg-ink"
                      >
                        {checkinMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} className="mr-1" /> Presente</>}
                      </Button>
                    ) : entry.status === "checked_in" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted"><Check size={14} /> Listo</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </StaffLayout>
    </StaffGuard>
  );
}
