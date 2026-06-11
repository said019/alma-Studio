import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Tag,
  PrimaryButton,
  SkeletonRow,
  ErrorState,
  ALMA,
} from "@/components/app/AppShell";
import { BackLink, DataRow, StickyCta } from "@/components/app/widgets";
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
  const isFull = cls && remaining === 0;

  const membership = membershipData?.data ?? membershipData ?? null;
  const hasActivePkg = membership?.status === "active";
  const pkgRemaining = membership?.classesRemaining ?? membership?.classes_remaining ?? null;
  const pkgUnlimited = pkgRemaining === null || pkgRemaining === undefined || pkgRemaining === 9999;
  const planName = membership?.planName ?? membership?.plan_name ?? "tu paquete";
  const remainingAfter = Math.max(0, Number(pkgRemaining ?? 0) - 1);

  const defaultName =
    user?.displayName ?? user?.display_name ?? user?.full_name ?? "";
  const defaultEmail = user?.email ?? "";

  const hairlines = {
    borderTop: `1px solid ${ALMA.border}`,
    borderBottom: `1px solid ${ALMA.border}`,
  } as const;

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
      />
      <AppShell hideGreeting>
        <BackLink to="/app/classes" label="Volver al calendario" />
        <PageHeader
          eyebrow="Confirmar reserva"
          title={cls ? <>{cls.class_type_name}</> : <>Tu reserva</>}
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
            <Section>
              <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: ALMA.blush }}>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {isFull ? (
                    <Tag tint="berry">Lista de espera</Tag>
                  ) : (
                    <Tag tint="olive">{remaining} {remaining === 1 ? "lugar" : "lugares"}</Tag>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  <DataRow
                    label="Día"
                    value={cls.start_time ? format(safeParse(cls.start_time), "EEEE d 'de' MMMM", { locale: es }) : "Por confirmar"}
                  />
                  <DataRow
                    label="Hora"
                    value={
                      <span className="nums">
                        {cls.start_time ? format(safeParse(cls.start_time), "HH:mm") : "Por confirmar"}
                        {cls.end_time ? ` a ${format(safeParse(cls.end_time), "HH:mm")}` : ""}
                      </span>
                    }
                  />
                  <DataRow label="Coach" value={cls.instructor_name ?? "Por confirmar"} />
                  <DataRow label="Cupo" value={<span className="nums">{`${cls.current_bookings ?? 0} / ${cls.max_capacity}`}</span>} />
                </div>
              </div>
            </Section>

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
                  <div className="py-4" style={hairlines}>
                    <p className="m-0 text-[0.95rem] font-medium leading-snug" style={{ color: ALMA.ink }}>
                      Tu paquete no tiene límite de clases.
                    </p>
                    <p className="m-0 mt-1 text-[0.84rem] leading-[1.5]" style={{ color: ALMA.ink, opacity: 0.6 }}>
                      Reserva tranquila, {planName} te cubre.
                    </p>
                  </div>
                ) : Number(pkgRemaining) <= 0 ? (
                  <div className="flex flex-col items-start gap-3 py-4" style={hairlines}>
                    <div>
                      <p className="m-0 text-[0.95rem] font-medium leading-snug" style={{ color: ALMA.ink }}>
                        Ya usaste todas las clases de tu paquete.
                      </p>
                      <p className="m-0 mt-1 text-[0.84rem] leading-[1.5]" style={{ color: ALMA.ink, opacity: 0.6 }}>
                        Renueva para confirmar tu lugar en esta clase.
                      </p>
                    </div>
                    <PrimaryButton size="sm" to="/app/checkout">Ver paquetes</PrimaryButton>
                  </div>
                ) : (
                  <div className="py-4" style={hairlines}>
                    <p className="m-0 text-[0.95rem] font-medium leading-snug" style={{ color: ALMA.ink }}>
                      {isFull
                        ? <>Se usará <span className="nums">1</span> clase de tu paquete al liberarse tu lugar</>
                        : <>Se usa <span className="nums">1</span> clase de tu paquete</>}
                    </p>
                    <p className="m-0 mt-1 text-[0.84rem] leading-[1.5]" style={{ color: ALMA.ink, opacity: 0.6 }}>
                      Te {remainingAfter === 1 ? "quedará" : "quedarán"}{" "}
                      <span className="nums">{remainingAfter}</span>{" "}
                      {remainingAfter === 1 ? "clase" : "clases"} de {planName}.
                    </p>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-start gap-3 py-4" style={hairlines}>
                  <div>
                    <p className="m-0 text-[0.95rem] font-medium leading-snug" style={{ color: ALMA.ink }}>
                      Aún no tienes un paquete activo.
                    </p>
                    <p className="m-0 mt-1 text-[0.84rem] leading-[1.5]" style={{ color: ALMA.ink, opacity: 0.6 }}>
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
                    className="grid grid-cols-[auto_1fr] items-baseline gap-4 py-3.5"
                    style={{
                      borderTop: `1px solid ${ALMA.border}`,
                      borderBottom: i === arr.length - 1 ? `1px solid ${ALMA.border}` : undefined,
                    }}
                  >
                    <span className="nums text-[0.72rem] font-medium tracking-[0.18em]" style={{ color: ALMA.berry }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[0.92rem] leading-[1.55]" style={{ color: ALMA.ink, opacity: 0.78 }}>
                      {text}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section>
              <div className="rounded-2xl p-4 sm:p-5" style={{ backgroundColor: ALMA.mist }}>
                <p className="m-0 text-[0.72rem] font-medium uppercase tracking-[0.2em]" style={{ color: ALMA.berry }}>
                  Cancelaciones
                </p>
                <p className="m-0 mt-1.5 text-[0.95rem] leading-[1.55]" style={{ color: ALMA.ink }}>
                  Cancela hasta <span className="nums">12</span> horas antes y no cuenta como falta.
                </p>
                <p className="m-0 mt-1 text-[0.84rem] leading-[1.5]" style={{ color: ALMA.ink, opacity: 0.6 }}>
                  Las cancelaciones tardías cuentan como falta; al juntar 5 se descuentan puntos.
                </p>
              </div>
            </Section>

            <StickyCta>
              <button
                type="button"
                disabled={bookMutation.isPending}
                onClick={() => bookMutation.mutate()}
                className="w-full inline-flex items-center justify-center gap-3 rounded-full px-7 py-4 text-[0.84rem] font-medium uppercase tracking-[0.18em] transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0 cursor-pointer"
                style={{ backgroundColor: ALMA.berry, color: ALMA.cream, border: 0 }}
              >
                {bookMutation.isPending
                  ? "Reservando…"
                  : isFull
                    ? "Unirme a la lista de espera"
                    : "Confirmar reserva"}
              </button>
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
