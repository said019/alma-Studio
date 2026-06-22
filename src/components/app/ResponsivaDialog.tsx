import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import api from "@/lib/api";
import { ALMA } from "@/components/app/tokens";
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

const fieldStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
  padding: "0.75rem 0.9rem",
  fontSize: "0.95rem",
  color: ALMA.ink,
  backgroundColor: "#ffffff",
  border: `1px solid ${ALMA.border}`,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.66rem",
  fontWeight: 500,
  textTransform: "uppercase" as const,
  letterSpacing: "0.22em",
  color: ALMA.ink,
  opacity: 0.62,
  marginBottom: 6,
  display: "block",
};

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
      toast({ title: "Responsiva firmada. ¡Bienvenida a Alma Movement!" });
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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        backgroundColor: "rgba(36,27,26,0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "0",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 600,
          maxHeight: "92vh",
          backgroundColor: ALMA.cream,
          borderRadius: "24px 24px 0 0",
          overflowY: "auto",
          boxShadow: "0 -12px 48px rgba(36,27,26,0.14)",
          // Center on desktop
        }}
        // Prevent click propagation so clicking inside doesn't close
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            backgroundColor: `${ALMA.cream}f5`,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom: `1px solid ${ALMA.border}`,
            padding: "1.1rem 1.4rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <p
              style={{
                fontSize: "0.62rem",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.28em",
                color: ALMA.berry,
                margin: 0,
              }}
            >
              Antes de reservar
            </p>
            <h2
              className="font-bebas"
              style={{
                color: ALMA.inkDeep,
                fontSize: "clamp(1.25rem, 2.5vw, 1.65rem)",
                lineHeight: 1,
                margin: "4px 0 0",
              }}
            >
              {RESPONSIVA_TITLE}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: ALMA.ink,
              opacity: 0.5,
              padding: 6,
              borderRadius: 8,
              flexShrink: 0,
            }}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ padding: "1.4rem 1.4rem 2rem" }}>
          {/* Document sections */}
          <div style={{ marginBottom: "2rem" }}>
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
          </div>

          {/* Form */}
          <div
            style={{
              borderTop: `2px solid ${ALMA.border}`,
              paddingTop: "1.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <p
              className="font-bebas"
              style={{ color: ALMA.inkDeep, fontSize: "1.2rem", margin: 0 }}
            >
              Tus datos
            </p>

            {/* Nombre */}
            <div>
              <label style={labelStyle}>Nombre completo *</label>
              <input
                style={fieldStyle}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre completo"
                autoComplete="name"
              />
            </div>

            {/* Phone + Email row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input
                  style={fieldStyle}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+52 000 000 0000"
                  type="tel"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label style={labelStyle}>Correo</label>
                <input
                  style={fieldStyle}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  type="email"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Uso de imagen */}
            <div>
              <label style={{ ...labelStyle, marginBottom: 10 }}>
                Uso de imagen (sección 4) *
              </label>
              <div style={{ display: "flex", gap: 10 }}>
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
                      style={{
                        flex: 1,
                        padding: "0.6rem 0.8rem",
                        borderRadius: 12,
                        border: `1px solid ${isSelected ? ALMA.berry : ALMA.border}`,
                        backgroundColor: isSelected ? `${ALMA.berry}18` : "#ffffff",
                        color: isSelected ? ALMA.berry : ALMA.ink,
                        fontSize: "0.82rem",
                        fontWeight: isSelected ? 600 : 400,
                        cursor: "pointer",
                        transition: "all 0.15s",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Signature pad */}
            <div>
              <label style={{ ...labelStyle, marginBottom: 10 }}>
                Tu firma *
              </label>
              <SignaturePad onChange={setSignatureData} />
            </div>

            {/* Acceptance checkbox */}
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                cursor: "pointer",
                padding: "0.8rem",
                borderRadius: 12,
                border: `1px solid ${accepted ? ALMA.berry : ALMA.border}`,
                backgroundColor: accepted ? `${ALMA.berry}0d` : "transparent",
                transition: "all 0.15s",
              }}
            >
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                style={{
                  marginTop: 2,
                  accentColor: ALMA.berry,
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  cursor: "pointer",
                }}
              />
              <span style={{ fontSize: "0.84rem", color: ALMA.ink, lineHeight: 1.5 }}>
                He leído y acepto la responsiva y consentimiento informado en su totalidad.
              </span>
            </label>

            {/* Submit */}
            <button
              type="button"
              disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate()}
              style={{
                width: "100%",
                padding: "1rem",
                borderRadius: 99,
                border: 0,
                backgroundColor: canSubmit && !mutation.isPending ? ALMA.inkDeep : ALMA.border,
                color: ALMA.cream,
                fontSize: "0.82rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                cursor: canSubmit && !mutation.isPending ? "pointer" : "not-allowed",
                transition: "background-color 0.2s, transform 0.15s",
                marginTop: 4,
              }}
            >
              {mutation.isPending ? "Firmando…" : "Firmar y continuar"}
            </button>

            <p
              style={{
                fontSize: "0.72rem",
                color: ALMA.ink,
                opacity: 0.45,
                textAlign: "center",
                margin: 0,
              }}
            >
              Tu firma y datos quedan guardados de forma segura.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
