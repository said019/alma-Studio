import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { FileSignature, Printer } from "lucide-react";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  EmptyState,
  ErrorState,
  SkeletonRow,
  GhostButton,
  ALMA,
} from "@/components/app/AppShell";
import { BackLink, DataRow } from "@/components/app/widgets";
import { RESPONSIVA_TITLE, RESPONSIVA_SECTIONS } from "@/components/app/responsivaContent";

interface WaiverRow {
  full_name: string;
  phone: string | null;
  email: string | null;
  image_consent: boolean;
  signature_data: string;
  signed_at: string;
}

const Responsiva = () => {
  const { data, isLoading, isError, refetch } = useQuery<{ data: WaiverRow | null }>({
    queryKey: ["my-waiver"],
    queryFn: async () => (await api.get("/me/waiver")).data,
  });

  const waiver = data?.data ?? null;

  const signedDate = waiver?.signed_at
    ? format(parseISO(waiver.signed_at), "d 'de' MMMM, yyyy", { locale: es })
    : null;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/profile" label="Perfil" />
        <PageHeader
          eyebrow="Documentos"
          title="Mi responsiva."
          subtitle="Responsiva y consentimiento informado firmado con Alma Movement."
          actions={
            waiver ? (
              <GhostButton onClick={() => window.print()}>
                <Printer size={14} />
                Imprimir
              </GhostButton>
            ) : undefined
          }
        />

        {isLoading ? (
          <SkeletonRow height={200} />
        ) : isError ? (
          <ErrorState
            title="No pudimos cargar tu responsiva"
            description="Revisa tu conexión y vuelve a intentarlo."
            onRetry={() => refetch()}
          />
        ) : !waiver ? (
          <EmptyState
            icon={<FileSignature size={22} />}
            title="Aún no has firmado tu responsiva"
            description="La firmarás al reservar tu primera clase. Es un proceso rápido y solo se realiza una vez."
          />
        ) : (
          <>
            {/* Summary card */}
            <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: ALMA.blush }}>
              <p
                className="text-[0.72rem] font-medium uppercase tracking-[0.24em] mb-1.5"
                style={{ color: ALMA.berry }}
              >
                Firmada
              </p>
              <p
                className="font-display text-[1.45rem] leading-none mb-3"
                style={{ color: ALMA.inkDeep }}
              >
                {RESPONSIVA_TITLE}
              </p>

              <DataRow label="Nombre" value={waiver.full_name} />
              {waiver.email && <DataRow label="Correo" value={waiver.email} />}
              {waiver.phone && <DataRow label="Teléfono" value={<span className="nums">{waiver.phone}</span>} />}
              <DataRow
                label="Uso de imagen"
                value={
                  <span
                    className="font-medium"
                    style={{ color: waiver.image_consent ? ALMA.berry : ALMA.ink }}
                  >
                    {waiver.image_consent ? "Sí autorizado" : "No autorizado"}
                  </span>
                }
              />
              {signedDate && <DataRow label="Firmada el" value={<span className="nums">{signedDate}</span>} />}
            </div>

            {/* Signature */}
            <Section title="Tu firma">
              <div
                className="inline-block max-w-full rounded-2xl p-4"
                style={{ backgroundColor: ALMA.cream, border: `1px solid ${ALMA.border}` }}
              >
                <img
                  src={waiver.signature_data}
                  alt="Tu firma"
                  className="block h-auto max-w-full max-h-[140px]"
                />
              </div>
            </Section>

            {/* Full document */}
            <Section title="Documento completo">
              {RESPONSIVA_SECTIONS.map((section) => (
                <div
                  key={section.n}
                  className="pt-4 pb-4"
                  style={{ borderTop: `1px solid ${ALMA.border}` }}
                >
                  <h3
                    className="font-display text-[1.05rem] leading-snug mb-1.5"
                    style={{ color: ALMA.ink }}
                  >
                    <span className="nums mr-1.5" style={{ color: ALMA.berry }}>
                      {section.n}.
                    </span>
                    {section.title}
                  </h3>
                  <p
                    className="m-0 text-[0.875rem] leading-[1.65]"
                    style={{ color: ALMA.ink, opacity: 0.75 }}
                  >
                    {section.body}
                  </p>
                </div>
              ))}
              <div className="pt-3" style={{ borderTop: `1px solid ${ALMA.border}` }} />
            </Section>
          </>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Responsiva;
