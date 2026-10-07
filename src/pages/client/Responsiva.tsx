import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { FileSignature, Printer } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  EmptyState,
  ErrorState,
  SkeletonRow,
  GhostButton,
} from "@/components/app/AppShell";
import { BackLink, DataRow } from "@/components/app/widgets";
import { ResponsivaDialog, WAIVER_DETAILS_FIELDS } from "@/components/app/ResponsivaDialog";
import { responsivaDocument, RESPONSIVA_PDF_URL } from "@/components/app/responsivaContent";

interface WaiverRow {
  [key: string]: string | boolean | null | undefined;
  full_name: string;
  phone: string | null;
  email: string | null;
  image_consent: boolean;
  signature_data: string;
  signed_at: string;
  waiver_version?: string | null;
}

const Responsiva = () => {
  const [signOpen, setSignOpen] = useState(false);
  const { user } = useAuthStore();
  const { data, isLoading, isError, refetch } = useQuery<{ data: WaiverRow | null }>({
    queryKey: ["my-waiver"],
    queryFn: async () => (await api.get("/me/waiver")).data,
  });

  const waiver = data?.data ?? null;

  // La responsiva se muestra con el texto de la versión que firmó (punto 7).
  const documento = responsivaDocument(waiver?.waiver_version);

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
          subtitle={waiver
            ? `Tu responsiva y consentimiento informado, en la versión que firmaste (${waiver.waiver_version ?? "v1"}).`
            : "Tu responsiva y consentimiento informado."}
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
          <>
            <EmptyState
              icon={<FileSignature size={22} />}
              title="Aún no has firmado tu responsiva"
              description="Debes firmarla al inscribirte o antes de reservar tus clases."
              ctaLabel="Firmar responsiva ahora"
              onCta={() => setSignOpen(true)}
            />
            <ResponsivaDialog
              open={signOpen}
              onClose={() => setSignOpen(false)}
              onSigned={() => {
                setSignOpen(false);
                refetch();
              }}
              defaultName={user?.displayName ?? user?.display_name ?? ""}
              defaultEmail={user?.email ?? ""}
              defaultPhone={(user as any)?.phone ?? ""}
            />
          </>
        ) : (
          <>
            {/* Summary card */}
            <div className="rounded-3xl p-5 sm:p-7 border border-line bg-sunken">
              <p className="text-[0.75rem] font-medium uppercase tracking-[0.24em] mb-1.5 text-accent-strong">
                Firmada
              </p>
              <p className="font-display text-[1.45rem] leading-none mb-3 text-ink">
                {documento.title}
              </p>

              <DataRow label="Nombre" value={waiver.full_name} />
              {waiver.email && <DataRow label="Correo" value={waiver.email} />}
              {waiver.phone && <DataRow label="Teléfono" value={<span className="nums">{waiver.phone}</span>} />}
              <DataRow
                label="Uso de imagen"
                value={
                  <span className={"font-medium " + (waiver.image_consent ? "text-accent-strong" : "text-ink")}>
                    {waiver.image_consent ? "Sí autorizado" : "No autorizado"}
                  </span>
                }
              />
              {waiver.waiver_version === "v3" && WAIVER_DETAILS_FIELDS.map(([key, label]) => waiver[key] ? <DataRow key={key} label={label.replace(" *", "")} value={String(waiver[key])} /> : null)}
              {signedDate && <DataRow label="Firmada el" value={<span className="nums">{signedDate}</span>} />}
            </div>

            {/* Signature — baldosa clara (bg-inverse) para que el trazo oscuro se vea en la app oscura. */}
            <Section title="Tu firma">
              <div className="inline-block max-w-full rounded-2xl p-4 border border-line bg-inverse">
                <img
                  src={waiver.signature_data}
                  alt="Tu firma"
                  className="block h-auto max-w-full max-h-[140px]"
                />
              </div>
            </Section>

            {/* Full document */}
            <Section title="Documento completo">
              {waiver.waiver_version === "v3" && <a href={RESPONSIVA_PDF_URL} target="_blank" rel="noopener noreferrer" className="underline text-sm text-accent-strong">Documento original del estudio (PDF)</a>}
              {documento.sections.map((section) => (
                <div key={section.n} className="pt-4 pb-4 border-t border-line">
                  <h3 className="font-display text-[1.05rem] leading-snug mb-1.5 text-ink">
                    <span className="nums mr-1.5 text-accent-strong">
                      {section.n}.
                    </span>
                    {section.title}
                  </h3>
                  <p className="m-0 text-[0.875rem] leading-[1.65] text-ink-muted">
                    {section.body}
                  </p>
                </div>
              ))}
              <div className="pt-3 border-t border-line" />
            </Section>
          </>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Responsiva;
