import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import {
  AuthShell,
  AuthSubmit,
  AuthTextarea,
  AuthErrorBanner,
  ALMA,
} from "@/components/auth/AuthShell";
import type { User } from "@/types/auth";

type YesNo = "yes" | "no" | null;

const YesNoField = ({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: YesNo;
  onChange: (v: "yes" | "no") => void;
  error?: string;
}) => (
  <div className="flex flex-col gap-2.5">
    <span
      id={`${id}-label`}
      className="text-[0.72rem] font-medium uppercase tracking-[0.18em] leading-[1.8]"
      style={{ color: ALMA.berry }}
    >
      {label}
    </span>
    <div
      role="radiogroup"
      aria-labelledby={`${id}-label`}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className="grid grid-cols-2 gap-3"
    >
      {(["yes", "no"] as const).map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={
              "min-h-[44px] rounded-full border px-4 py-3 text-[0.9rem] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alma-berry focus-visible:ring-offset-2 " +
              (active
                ? "border-alma-ink bg-alma-ink text-alma-canvas"
                : "border-alma-hairline bg-alma-canvas text-alma-ink hover:border-alma-sandstone hover:bg-alma-mist")
            }
          >
            {opt === "yes" ? "Sí" : "No"}
          </button>
        );
      })}
    </div>
    {error && (
      <p id={`${id}-error`} className="flex items-center gap-1.5 text-[0.78rem]" style={{ color: ALMA.destructive }}>
        <AlertCircle size={13} className="shrink-0" />
        {error}
      </p>
    )}
  </div>
);

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();

  const [hasInjury, setHasInjury] = useState<YesNo>(null);
  const [practicedBarre, setPracticedBarre] = useState<YesNo>(null);
  const [injuryDetails, setInjuryDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const injuryReported = hasInjury === "yes";
  const detailsMissing = injuryReported && injuryDetails.trim().length === 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (hasInjury === null || practicedBarre === null) {
      setError("Responde ambas preguntas para continuar.");
      return;
    }
    if (detailsMissing) {
      setError("Cuéntanos qué lesión o condición debemos tener en cuenta.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ user: User }>("/auth/onboarding", {
        hasInjury: injuryReported,
        practicedBarreBefore: practicedBarre === "yes",
        injuryDetails: injuryReported ? injuryDetails.trim() : null,
      });
      if (res.data?.user && user) {
        updateUser({ ...user, ...res.data.user });
      }
      navigate("/app");
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "No pudimos guardar tus respuestas.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      brandTint="berry"
      brandEyebrow="Casi listas"
      brandHeadline={<>Antes de tu</>}
      brandHeadlineItalic="primera clase."
      brandSubline="Estas respuestas nos ayudan a cuidarte. Tu instructora las verá para adaptar los ejercicios a ti."
      brandList={[
        { label: "Atención personalizada" },
        { label: "Ejercicios adaptados a tu cuerpo" },
        { label: "Grupos pequeños por clase" },
      ]}
      formEyebrow="Un último paso"
      formHeadline="Cuéntanos sobre"
      formHeadlineItalic="ti."
    >
      <p
        className="mb-6 text-[0.88rem] leading-relaxed"
        style={{ color: ALMA.ink, opacity: 0.6 }}
      >
        Necesitamos saber esto antes de que entres. Solo toma un momento.
      </p>

      {error && <AuthErrorBanner message={error} />}

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col">
          <YesNoField
            id="q-injury"
            label="¿Tienes alguna lesión o condición física actual?"
            value={hasInjury}
            onChange={(v) => setHasInjury(v)}
            error={touched && hasInjury === null ? "Selecciona una opción" : undefined}
          />

          {/* Reveal del textarea: transición de grid-template-rows */}
          <div
            className="grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none"
            style={{
              gridTemplateRows: injuryReported ? "1fr" : "0fr",
              transitionTimingFunction: "var(--ease-alma-out)",
            }}
          >
            <div
              className="min-h-0 overflow-hidden"
              style={{
                visibility: injuryReported ? "visible" : "hidden",
                transition: "visibility 300ms",
              }}
            >
              <div className="pt-5">
                <AuthTextarea
                  id="injury-details"
                  label="Cuéntanos qué debemos saber"
                  rows={4}
                  value={injuryDetails}
                  onChange={(e) => setInjuryDetails(e.target.value)}
                  placeholder="Ej: Lesión de rodilla derecha hace 3 meses, evito impacto."
                  error={touched && detailsMissing ? "Este dato es importante para cuidarte." : undefined}
                  hint="Lesión, cirugía o molestia reciente. Solo tu coach lo ve."
                />
              </div>
            </div>
          </div>
        </div>

        <YesNoField
          id="q-barre"
          label="¿Habías practicado Pilates antes?"
          value={practicedBarre}
          onChange={(v) => setPracticedBarre(v)}
          error={touched && practicedBarre === null ? "Selecciona una opción" : undefined}
        />

        <AuthSubmit loading={submitting} loadingLabel="Guardando…">
          Entrar a Alma
        </AuthSubmit>
      </form>
    </AuthShell>
  );
};

export default Onboarding;
