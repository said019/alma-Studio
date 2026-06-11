import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  EmptyState,
  ErrorState,
  Tag,
  PrimaryButton,
  GhostButton,
  SkeletonRow,
  ALMA,
} from "@/components/app/AppShell";
import { SegmentedTabs } from "@/components/app/widgets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Star, CalendarDays, ChevronDown } from "lucide-react";
import type { BookingClient } from "@/types/booking";

type TabId = "upcoming" | "past";

const STATUS_TINT: Record<string, keyof typeof ALMA> = {
  confirmed: "olive",
  waitlist: "berry",
  checked_in: "olive",
  no_show: "destructive",
  cancelled: "ink",
};
const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmada",
  waitlist: "Lista de espera",
  checked_in: "Asistida",
  no_show: "No asistió",
  cancelled: "Cancelada",
};

const MyBookings = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("upcoming");
  const [showCancelled, setShowCancelled] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reviewBooking, setReviewBooking] = useState<BookingClient | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Reloj ligero: reclasifica próximas/pasadas si la página queda abierta.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { data: bookingsData, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => (await api.get("/bookings/my-bookings")).data,
  });

  const {
    data: tagsData,
    isError: tagsError,
    refetch: refetchTags,
  } = useQuery({
    queryKey: ["public-review-tags"],
    queryFn: async () => (await api.get("/public/review-tags")).data,
    staleTime: 1000 * 60 * 10,
  });
  const reviewTags: { id: string; name: string; color: string }[] = Array.isArray(tagsData?.data) ? tagsData.data : [];

  const bookings: BookingClient[] = Array.isArray(bookingsData?.data) ? bookingsData.data : Array.isArray(bookingsData) ? bookingsData : [];

  const { upcoming, past, cancelled } = useMemo(() => {
    const now = new Date(nowTick);
    const upcoming = bookings.filter((b) =>
      (b.status === "confirmed" || b.status === "waitlist") && new Date(b.start_time) >= now
    );
    const past = bookings.filter((b) =>
      b.status === "checked_in" || b.status === "no_show" || (b.status !== "cancelled" && new Date(b.start_time) < now)
    );
    const cancelled = bookings.filter((b) => b.status === "cancelled");
    return { upcoming, past, cancelled };
  }, [bookings, nowTick]);

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/bookings/${id}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["my-membership"] });
      qc.invalidateQueries({ queryKey: ["public-classes"] });
      const creditRestored = res?.data?.creditRestored;
      toast({
        title: "Reserva cancelada",
        description: creditRestored
          ? "Cancelaste a tiempo, tu clase regresó a tu paquete."
          : "Tu lugar quedó libre. Esta vez contó como falta.",
      });
      setCancelId(null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || "No se pudo cancelar.";
      toast({ title: "No pudimos cancelar", description: msg, variant: "destructive" });
      setCancelId(null);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      api.post("/reviews", {
        bookingId: reviewBooking?.id,
        rating,
        comment,
        tagIds: selectedTags,
      }),
    onSuccess: () => {
      toast({ title: "Gracias por tu reseña." });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      setReviewBooking(null);
      setComment("");
      setSelectedTags([]);
      setRating(5);
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) {
        qc.invalidateQueries({ queryKey: ["my-bookings"] });
        setReviewBooking(null);
      }
      const msg = err?.response?.data?.message || "No se pudo enviar la reseña.";
      toast({ title: "No pudimos enviar tu reseña", description: msg, variant: "destructive" });
    },
  });

  const list = tab === "upcoming" ? upcoming : past;
  const nowDate = new Date(nowTick);

  const renderBookingRow = (b: BookingClient) => {
    const isPast = new Date(b.start_time) < nowDate;
    const hasReview = Boolean(b.has_review);
    const isCancellable = b.status === "confirmed" && !isPast;
    const canReview = isPast && b.status === "checked_in" && !hasReview;
    const hasActions = isCancellable || canReview || hasReview;
    return (
      <div key={b.id} className="px-1 py-4" style={{ borderTop: `1px solid ${ALMA.border}` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[0.95rem] font-medium leading-snug" style={{ color: ALMA.ink }}>
              {b.class_type_name ?? "Clase"}
            </div>
            <div className="nums text-[0.8rem] mt-1" style={{ color: ALMA.ink, opacity: 0.55 }}>
              {b.start_time ? format(safeParse(b.start_time), "EEE d MMM · HH:mm", { locale: es }) : "Por confirmar"}
              {b.instructor_name ? ` · ${b.instructor_name}` : ""}
            </div>
          </div>
          <div className="shrink-0 pt-0.5">
            <Tag tint={STATUS_TINT[b.status] ?? "berry"}>
              {STATUS_LABEL[b.status] ?? b.status}
            </Tag>
          </div>
        </div>
        {hasActions && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isCancellable && (
              <button
                type="button"
                onClick={() => setCancelId(b.id)}
                className="inline-flex min-h-[44px] items-center rounded-full px-5 text-[0.72rem] font-medium uppercase tracking-[0.16em] bg-transparent cursor-pointer transition-colors"
                style={{ border: `1px solid ${ALMA.border}`, color: ALMA.destructive }}
              >
                Cancelar reserva
              </button>
            )}
            {canReview && (
              <button
                type="button"
                onClick={() => setReviewBooking(b)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-[0.72rem] font-medium uppercase tracking-[0.16em] bg-transparent cursor-pointer transition-colors"
                style={{ border: `1px solid ${ALMA.berry}`, color: ALMA.berry }}
              >
                <Star size={12} /> Dejar reseña
              </button>
            )}
            {hasReview && <Tag tint="olive">Reseña enviada</Tag>}
          </div>
        )}
      </div>
    );
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Mis reservas"
          title={<>Tus clases</>}
          titleAccent="en Alma."
        />

        <SegmentedTabs<TabId>
          value={tab}
          onChange={setTab}
          options={[
            { value: "upcoming", label: "Próximas", count: upcoming.length },
            { value: "past", label: "Pasadas", count: past.length },
          ]}
        />

        <Section>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <SkeletonRow key={i} />)}
            </div>
          ) : isError ? (
            <ErrorState
              title="No pudimos cargar tus reservas"
              description="Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetch()}
            />
          ) : (
            <>
              {list.length === 0 ? (
                tab === "upcoming" ? (
                  <EmptyState
                    icon={<CalendarDays size={20} />}
                    title="No tienes clases reservadas."
                    description="Grupos pequeños. Reserva la tuya."
                    ctaLabel="Reservar clase"
                    ctaTo="/app/classes"
                  />
                ) : (
                  <EmptyState
                    title="Todavía no tienes historial."
                    description="Aquí van a aparecer las clases ya tomadas."
                  />
                )
              ) : (
                <ListGroup>
                  {list.map(renderBookingRow)}
                </ListGroup>
              )}

              {tab === "past" && cancelled.length > 0 && (
                <div className="mt-10">
                  <button
                    type="button"
                    onClick={() => setShowCancelled((v) => !v)}
                    aria-expanded={showCancelled}
                    className="flex w-full min-h-[44px] items-center justify-between bg-transparent border-0 cursor-pointer px-1 py-3"
                    style={{ borderTop: `1px solid ${ALMA.border}`, borderBottom: showCancelled ? undefined : `1px solid ${ALMA.border}` }}
                  >
                    <span className="text-[0.72rem] font-medium uppercase tracking-[0.2em]" style={{ color: ALMA.ink, opacity: 0.55 }}>
                      Canceladas <span className="nums">{cancelled.length}</span>
                    </span>
                    <ChevronDown
                      size={15}
                      className="transition-transform"
                      style={{ color: ALMA.ink, opacity: 0.4, transform: showCancelled ? "rotate(180deg)" : "none" }}
                    />
                  </button>
                  {showCancelled && (
                    <ListGroup>
                      {cancelled.map(renderBookingRow)}
                    </ListGroup>
                  )}
                </div>
              )}
            </>
          )}
        </Section>

        {/* Cancel confirm */}
        <AlertDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)}>
          <AlertDialogContent
            className="w-[calc(100%-2rem)] rounded-3xl"
            style={{ backgroundColor: ALMA.cream, borderColor: ALMA.border }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-[1.35rem] font-normal leading-snug" style={{ color: ALMA.ink }}>
                ¿Cancelar tu reserva?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[0.92rem] leading-[1.6]" style={{ color: ALMA.ink, opacity: 0.65 }}>
                Si faltan más de 12 horas, tu clase regresa a tu paquete. Con menos tiempo, cuenta como falta.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel
                className="h-11 rounded-full px-5 text-[0.74rem] font-medium uppercase tracking-[0.18em]"
                style={{ backgroundColor: "transparent", borderColor: ALMA.border, color: ALMA.ink }}
              >
                Volver
              </AlertDialogCancel>
              <AlertDialogAction
                className="h-11 rounded-full px-5 text-[0.74rem] font-medium uppercase tracking-[0.18em]"
                style={{ backgroundColor: ALMA.destructive, color: ALMA.cream }}
                onClick={() => cancelId && cancelMutation.mutate(cancelId)}
              >
                Sí, cancelar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Review dialog */}
        <Dialog
          open={!!reviewBooking}
          onOpenChange={(o) => {
            if (!o) {
              setReviewBooking(null);
              setSelectedTags([]);
              setComment("");
              setRating(5);
            }
          }}
        >
          <DialogContent
            className="rounded-3xl"
            style={{ backgroundColor: ALMA.cream, borderColor: ALMA.border }}
          >
            <DialogHeader>
              <DialogTitle className="font-display text-[1.3rem] font-normal leading-snug" style={{ color: ALMA.ink }}>
                Reseña · {reviewBooking?.class_type_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div>
                <p className="text-[0.72rem] font-medium uppercase tracking-[0.22em] mb-2" style={{ color: ALMA.ink, opacity: 0.6 }}>
                  Calificación
                </p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRating(s)}
                      className="grid h-11 w-11 place-items-center bg-transparent border-0 cursor-pointer"
                      aria-label={`${s} ${s === 1 ? "estrella" : "estrellas"}`}
                      aria-pressed={s === rating}
                    >
                      <Star
                        size={26}
                        strokeWidth={1.5}
                        style={{
                          color: s <= rating ? ALMA.berry : ALMA.sandstone,
                          fill: s <= rating ? ALMA.berry : "transparent",
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
              {tagsError ? (
                <ErrorState
                  title="No pudimos cargar las opciones"
                  description="Puedes enviar tu reseña sin etiquetas, o reintentar."
                  onRetry={() => refetchTags()}
                />
              ) : reviewTags.length > 0 ? (
                <div>
                  <p className="text-[0.72rem] font-medium uppercase tracking-[0.22em] mb-2" style={{ color: ALMA.ink, opacity: 0.6 }}>
                    ¿Qué te gustó?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {reviewTags.map((tag) => {
                      const isSel = selectedTags.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            setSelectedTags((prev) =>
                              isSel ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]
                            )
                          }
                          className="rounded-full px-3 py-1.5 text-[0.74rem] cursor-pointer transition-colors"
                          style={{
                            backgroundColor: isSel ? `${ALMA.berry}1a` : "transparent",
                            border: `1px solid ${isSel ? ALMA.berry : ALMA.border}`,
                            color: isSel ? ALMA.berry : ALMA.ink,
                            fontWeight: isSel ? 600 : 400,
                          }}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div>
                <p className="text-[0.72rem] font-medium uppercase tracking-[0.22em] mb-2" style={{ color: ALMA.ink, opacity: 0.6 }}>
                  Comentario (opcional)
                </p>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Cuéntanos cómo fue tu clase."
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <GhostButton onClick={() => setReviewBooking(null)}>Cancelar</GhostButton>
              <PrimaryButton onClick={() => reviewMutation.mutate()} loading={reviewMutation.isPending} loadingLabel="Enviando…">
                Enviar reseña
              </PrimaryButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default MyBookings;
