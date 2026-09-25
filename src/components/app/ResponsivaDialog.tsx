import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import api from "@/lib/api";

import { PrimaryButton } from "@/components/app/AppShell";
import { Field } from "@/components/app/fields";
import { SignaturePad } from "@/components/app/SignaturePad";
import { RESPONSIVA_TITLE, RESPONSIVA_SECTIONS } from "@/components/app/responsivaContent";
import { useToast } from "@/hooks/use-toast";

interface ResponsivaDialogProps {
  open: boolean;
  onClose: () => void;
  onSigned: () => void;
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
}

/* Etiqueta pequeña de las dos secciones sin campo dedicado (uso de imagen, firma). */
const LABEL_CLASS = "block mb-2.5 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted";

export const ResponsivaDialog = ({
  open,
  onClose,
  onSigned,
  defaultName = "",
  defaultEmail = "",
  defaultPhone = "",
}: ResponsivaDialogProps) => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [fullName, setFullName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState(defaultEmail);
  const [imageConsent, setImageConsent] = useState<boolean | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  // Sync defaults when they change (e.g. auth resolves after dialog mounts)
  useEffect(() => {
    if (defaultName && !fullName) setFullName(defaultName);
  }, [defaultName]);
  useEffect(() => {
    if (defaultEmail && !email) setEmail(defaultEmail);
  }, [defaultEmail]);
  useEffect(() => {
    if (defaultPhone && !phone) setPhone(defaultPhone);
  }, [defaultPhone]);

  const canSubmit =
    fullName.trim().length >= 2 &&
    signatureData !== null &&
    accepted &&
    imageConsent !== null;

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/me/waiver", {
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        image_consent: imageConsent,
        signature_data: signatureData,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-waiver"] });
      toast({ title: "Responsiva firmada. ¡Bienvenida a HIVE!" });
      onSigned();
    },
    onError: () => {
      toast({
        title: "No se pudo guardar la responsiva",
        description: "Inténtalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-canvas/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-[600px] max-h-[92vh] overflow-y-auto rounded-t-[24px] border-t border-line bg-canvas shadow-float"
        // Prevent click propagation so clicking inside doesn't close
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b border-line bg-canvas/95 backdrop-blur-md">
          <div>
            <p className="m-0 text-[0.75rem] font-medium uppercase tracking-[0.28em] text-accent-strong">
              Antes de reservar
            </p>
            <h2
              className="font-display text-ink mt-1"
              style={{ fontSize: "clamp(1.25rem, 2.5vw, 1.65rem)", lineHeight: 1 }}
            >
              {RESPONSIVA_TITLE}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-transparent border-0 cursor-pointer text-ink-muted transition-colors hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="px-6 pt-6 pb-8">
          {/* Document sections */}
          <div className="mb-8">
            {RESPONSIVA_SECTIONS.map((section) => (
              <div key={section.n} className="border-t border-line pt-[1.1rem] pb-4">
                <h3 className="font-display text-ink text-[1.05rem] m-0 mb-1.5 tracking-[0.03em]">
                  <span className="text-accent-strong mr-1.5">{section.n}.</span>
                  {section.title}
                </h3>
                <p className="m-0 text-ink-muted text-[0.875rem] leading-[1.65]">
                  {section.body}
                </p>
              </div>
            ))}
          </div>

          {/* Form */}
          <div className="flex flex-col gap-4 border-t-2 border-line pt-6">
            <p className="font-display text-ink text-[1.2rem] m-0">Tus datos</p>

            {/* Nombre */}
            <Field
              label="Nombre completo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre completo"
              autoComplete="name"
            />

            {/* Phone + Email row */}
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Teléfono"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+52 000 000 0000"
                type="tel"
                autoComplete="tel"
              />
              <Field
                label="Correo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                type="email"
                autoComplete="email"
              />
            </div>

            {/* Uso de imagen */}
            <div>
              <label className={LABEL_CLASS}>Uso de imagen (sección 4)</label>
              <div className="flex gap-2.5">
                {(
                  [
                    { value: true, label: "Sí autorizo" },
                    { value: false, label: "No autorizo" },
                  ] as const
                ).map((opt) => {
                  const isSelected = imageConsent === opt.value;
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setImageConsent(opt.value)}
                      className={
                        "flex-1 min-h-[44px] rounded-xl px-3 text-[0.82rem] tracking-[0.04em] transition-colors border " +
                        (isSelected
                          ? "border-accent-strong bg-ink/10 text-accent-strong font-semibold"
                          : "border-line bg-surface text-ink font-normal")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Signature pad — baldosa clara (bg-inverse), trazo oscuro fijo: ver SignaturePad.tsx. */}
            <div>
              <label className={LABEL_CLASS}>Tu firma</label>
              <SignaturePad onChange={setSignatureData} />
            </div>

            {/* Acceptance checkbox */}
            <label
              className={
                "flex items-start gap-3 cursor-pointer rounded-xl border p-3 transition-colors " +
                (accepted ? "border-accent-strong bg-ink/5" : "border-line bg-transparent")
              }
            >
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent-strong"
              />
              <span className="text-[0.84rem] leading-[1.5] text-ink">
                He leído y acepto la responsiva y consentimiento informado en su totalidad.
              </span>
            </label>

            {/* Submit */}
            <PrimaryButton
              className="w-full"
              disabled={!canSubmit}
              loading={mutation.isPending}
              loadingLabel="Firmando…"
              onClick={() => mutation.mutate()}
            >
              Firmar y continuar
            </PrimaryButton>

            <p className="m-0 text-center text-[0.75rem] text-ink-muted">
              Tu firma y datos quedan guardados de forma segura.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
