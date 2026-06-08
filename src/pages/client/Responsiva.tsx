import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { FileSignature } from "lucide-react";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  EmptyState,
  SkeletonRow,
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
  const { data, isLoading } = useQuery<{ data: WaiverRow | null }>({
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
        />

        {isLoading ? (
          <SkeletonRow height={200} />
        ) : !waiver ? (
          <EmptyState
            icon={<FileSignature size={22} />}
            title="Aún no has firmado tu responsiva"
            description="La firmarás al reservar tu primera clase. Es un proceso rápido y solo se realiza una vez."
          />
        ) : (
          <>
            {/* Summary card */}
            <div
              className="rounded-3xl p-5 sm:p-7"
              style={{ backgroundColor: ALMA.blush }}
            >
              <p
                className="font-bebas"
                style={{
                  color: ALMA.berry,
                  fontSize: "0.68rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.28em",
                  margin: "0 0 6px",
                }}
              >
                Firmada
              </p>
              <p
                className="font-bebas"
                style={{ color: ALMA.inkDeep, fontSize: "1.45rem", margin: "0 0 12px", lineHeight: 1 }}
              >
                {RESPONSIVA_TITLE}
              </p>

              <DataRow label="Nombre" value={waiver.full_name} />
              {waiver.email && <DataRow label="Correo" value={waiver.email} />}
              {waiver.phone && <DataRow label="Teléfono" value={waiver.phone} />}
              <DataRow
                label="Uso de imagen"
                value={
                  <span
                    style={{
                      color: waiver.image_consent ? ALMA.berry : ALMA.ink,
                      fontWeight: 500,
                    }}
                  >
                    {waiver.image_consent ? "Sí autorizado" : "No autorizado"}
                  </span>
                }
              />
              {signedDate && <DataRow label="Firmada el" value={signedDate} />}
            </div>

            {/* Signature */}
            <Section title="Tu firma">
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  border: `1px solid ${ALMA.border}`,
                  backgroundColor: "#ffffff",
                  padding: 16,
                  display: "inline-block",
                  maxWidth: "100%",
                }}
              >
                <img
                  src={waiver.signature_data}
                  alt="Tu firma"
                  style={{ display: "block", maxWidth: "100%", height: "auto", maxHeight: 140 }}
                />
              </div>
            </Section>

            {/* Full document */}
            <Section title="Documento completo">
              {RESPONSIVA_SECTIONS.map((section) => (
                <div
                  key={section.n}
                  style={{
                    borderTop: `1px solid ${ALMA.border}`,
                    paddingTop: "1.1rem",
                    paddingBottom: "1rem",
                  }}
                >
                  <h3
                    className="font-bebas"
                    style={{
                      color: ALMA.ink,
                      fontSize: "1.05rem",
                      margin: "0 0 0.35rem",
                      letterSpacing: "0.03em",
                    }}
                  >
                    <span style={{ color: ALMA.berry, marginRight: 6 }}>{section.n}.</span>
                    {section.title}
                  </h3>
                  <p
                    style={{
                      color: ALMA.ink,
                      opacity: 0.75,
                      fontSize: "0.875rem",
                      lineHeight: 1.65,
                      margin: 0,
                    }}
                  >
                    {section.body}
                  </p>
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${ALMA.border}`, paddingTop: "0.8rem" }} />
            </Section>
          </>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Responsiva;
