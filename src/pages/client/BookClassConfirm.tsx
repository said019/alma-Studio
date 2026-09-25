import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { differenceInMinutes, format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  PrimaryButton,
  SkeletonRow,
  ErrorState,
} from "@/components/app/AppShell";
import { BackLink, InfoBanner, StatusPill, StickyCta } from "@/components/app/widgets";
import { HexPedestal } from "@/components/brand/HexPedestal";
import { useToast } from "@/hooks/use-toast";
import { ResponsivaDialog } from "@/components/app/ResponsivaDialog";

const KNOW_BEFORE = [
  "Llega 10 minutos antes para acomodarte.",
  "Cupos limitados. Si está llena entras a lista de espera.",
  "Trae ropa cómoda y algo para hidratarte.",
];

const BookClassConfirm = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const [waiverOpen, setWaiverOpen] = useState(false);

  const { data: classData, isLoading, isError, refetch } = useQuery({
    queryKey: ["class-detail", classId],
    queryFn: async () => (await api.get(`/classes/${classId}`)).data,
  });

  const {
    data: membershipData,
    isLoading: membershipLoading,
    isError: membershipError,
    refetch: refetchMembership,
  } = useQuery({
    queryKey: ["my-membership"],
    queryFn: async () => (await api.get("/memberships/my")).data,
  });

  const cls = classData?.data ?? classData ?? null;

  const bookMutation = useMutation({
    mutationFn: () => api.post("/bookings", { classId }),
    onSuccess: (res) => {
      const data = res.data;
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["my-membership"] });
      qc.invalidateQueries({ queryKey: ["public-classes"] });
      if (data?.booking?.status === "waitlist") {
        toast({ title: "Quedaste en lista de espera", description: "Te avisamos si se libera un lugar." });
      } else {
        toast({ title: "Reserva confirmada." });
      }
      navigate("/app/bookings");
    },
    onError: (err: any) => {
      if (err?.response?.status === 403 && err?.response?.data?.code === "WAIVER_REQUIRED") {
        setWaiverOpen(true);
        return;
      }
      toast({
        title: "No se pudo reservar",
        description: err.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const remaining = cls
    ? Math.max(0, Number(cls.max_capacity ?? 0) - Number(cls.current_bookings ?? 0))
    : 0;
  const isFull = Boolean(cls) && remaining === 0;

  const membership = membershipData?.data ?? membershipData ?? null;
  const hasActivePkg = membership?.status === "active";
  const pkgRemaining = membership?.classesRemaining ?? membership?.classes_remaining ?? null;
  const pkgUnlimited = pkgRemaining === null || pkgRemaining === undefined || pkgRemaining === 9999;
  const planName = membership?.planName ?? membership?.plan_name ?? "tu paquete";
  const remainingAfter = Math.max(0, Number(pkgRemaining ?? 0) - 1);

  const defaultName =
    user?.displayName ?? user?.display_name ?? user?.full_name ?? "";
  const defaultEmail = user?.email ?? "";
  const defaultPhone = (user as any)?.phone ?? "";

  const dateLabel = cls?.start_time ? format(safeParse(cls.start_time), "EEEE d 'de' MMMM", { locale: es }) : null;
  const startLabel = cls?.start_time ? format(safeParse(cls.start_time), "HH:mm") : null;
  const endLabel = cls?.end_time ? format(safeParse(cls.end_time), "HH:mm") : null;
  const durationMin =
    cls?.start_time && cls?.end_time
      ? differenceInMinutes(safeParse(cls.end_time), safeParse(cls.start_time))
      : null;
  const subtitle = startLabel
    ? [dateLabel, endLabel ? `${startLabel} a ${endLabel}` : startLabel, durationMin ? `${durationMin} min` : null]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ResponsivaDialog
        open={waiverOpen}
        onClose={() => setWaiverOpen(false)}
        onSigned={() => {
          setWaiverOpen(false);
          bookMutation.mutate();
        }}
        defaultName={defaultName}
        defaultEmail={defaultEmail}
        defaultPhone={defaultPhone}
      />
      <AppShell hideGreeting>
        <BackLink to="/app/classes" label="Volver al calendario" />
        <PageHeader
          eyebrow={cls ? cls.instructor_name ?? "Por confirmar" : "Confirmar reserva"}
          title={cls ? <>{cls.class_type_name}</> : <>Tu reserva</>}
          subtitle={subtitle}
          actions={
            cls ? (
              <StatusPill
                label={isFull ? "Lista de espera" : `${remaining} ${remaining === 1 ? "lugar" : "lugares"}`}
                tone={isFull ? "accent" : "success"}
              />
            ) : undefined
          }
        />

        {isLoading ? (
          <>
            <SkeletonRow height={200} />
            <div className="mt-8">
              <SkeletonRow height={88} />
            </div>
            <div className="mt-8">
              <SkeletonRow height={140} />
            </div>
            <div className="mt-8 rounded-full overflow-hidden">
              <SkeletonRow height={54} />
            </div>
          </>
        ) : isError ? (
          <ErrorState
            title="No pudimos cargar la clase"
            description="Revisa tu conexión y vuelve a intentarlo."
            onRetry={() => refetch()}
          />
        ) : cls ? (
          <>
            <div className="flex justify-center py-2">
              <HexPedestal size="lg" />
            </div>

            <Section title="Al confirmar">
              {membershipLoading ? (
                <SkeletonRow height={72} />
              ) : membershipError ? (
                <ErrorState
                  title="No pudimos revisar tu paquete"
                  description="No sabemos cuántas clases te quedan. Revisa tu conexión y vuelve a intentarlo."
                  onRetry={() => refetchMembership()}
                />
              ) : hasActivePkg ? (
                pkgUnlimited ? (
                  <div className="flex flex-col gap-3 py-4 border-t border-b border-line">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[1.05rem] font-semibold text-ink">Clases ilimitadas</span>
                      <StatusPill label="Activo" tone="success" />
                    </div>
                    <p className="m-0 text-[0.84rem] leading-[1.5] text-ink-muted">
                      Reserva tranquila, {planName} te cubre.
                    </p>
                  </div>
                ) : Number(pkgRemaining) <= 0 ? (
                  <div className="flex flex-col items-start gap-3 py-4 border-t border-b border-line">
                    <div>
                      <p className="m-0 text-[0.95rem] font-medium leading-snug text-ink">
                        Ya usaste todas las clases de tu paquete.
                      </p>
                      <p className="m-0 mt-1 text-[0.84rem] leading-[1.5] text-ink-muted">
                        Renueva para confirmar tu lugar en esta clase.
                      </p>
                    </div>
                    <PrimaryButton size="sm" to="/app/checkout">Ver paquetes</PrimaryButton>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 py-4 border-t border-b border-line">
                    <div className="flex items-center gap-2">
                      <span className="nums font-display text-[1.05rem] font-semibold text-ink">
                        {pkgRemaining} {Number(pkgRemaining) === 1 ? "clase" : "clases"}
                      </span>
                      <StatusPill label="Activo" tone="success" />
                    </div>
                    <p className="m-0 text-[0.95rem] font-medium leading-snug text-ink">
                      {isFull
                        ? <>Se usará <span className="nums">1</span> clase de tu paquete al liberarse tu lugar</>
                        : <>Se usa <span className="nums">1</span> clase de tu paquete</>}
                    </p>
                    <p className="m-0 text-[0.84rem] leading-[1.5] text-ink-muted">
                      Te {remainingAfter === 1 ? "quedará" : "quedarán"}{" "}
                      <span className="nums">{remainingAfter}</span>{" "}
                      {remainingAfter === 1 ? "clase" : "clases"} de {planName}.
                    </p>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-start gap-3 py-4 border-t border-b border-line">
                  <div>
                    <p className="m-0 text-[0.95rem] font-medium leading-snug text-ink">
                      Aún no tienes un paquete activo.
                    </p>
                    <p className="m-0 mt-1 text-[0.84rem] leading-[1.5] text-ink-muted">
                      Elige uno para confirmar tu lugar en esta clase.
                    </p>
                  </div>
                  <PrimaryButton size="sm" to="/app/checkout">Ver paquetes</PrimaryButton>
                </div>
              )}
            </Section>

            <Section title="Lo que tienes que saber">
              <ul className="list-none m-0 p-0">
                {KNOW_BEFORE.map((text, i, arr) => (
                  <li
                    key={i}
                    className={"grid grid-cols-[auto_1fr] items-baseline gap-4 py-3.5 border-t border-line " + (i === arr.length - 1 ? "border-b" : "")}
                  >
                    <span className="nums text-[0.75rem] font-medium tracking-[0.18em] text-accent-strong">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[0.92rem] leading-[1.55] text-ink-muted">
                      {text}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section>
              <InfoBanner
                title="Cancela hasta 12 horas antes y no cuenta como falta."
                description="Las cancelaciones tardías cuentan como falta; al juntar 5 se descuentan puntos."
              />
            </Section>

            <StickyCta>
              <PrimaryButton
                className="w-full"
                loading={bookMutation.isPending}
                loadingLabel="Reservando…"
                onClick={() => bookMutation.mutate()}
              >
                {isFull ? "Unirme a la lista de espera" : "Reservar"}
              </PrimaryButton>
            </StickyCta>
          </>
        ) : (
          <ErrorState
            title="No encontramos esa clase."
            description="Puede que ya no esté disponible. En el calendario están todas las que vienen."
            onRetry={() => navigate("/app/classes")}
            retryLabel="Volver al calendario"
          />
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default BookClassConfirm;
