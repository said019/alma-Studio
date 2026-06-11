import {
  forwardRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertCircle, Check, Eye, EyeOff } from "lucide-react";
import { ALMA } from "@/components/app/tokens";

/* ═══════════════════════════════════════════════════════════
   Campos de formulario — lenguaje único de la app de clienta.
   Cream + hairline, focus ring berry visible (WCAG 2.4.7),
   error en destructive con icono. Lo usan ProfileEdit y
   ChangePassword; cualquier form nuevo debe importar de aquí.
   ═══════════════════════════════════════════════════════════ */

const CONTROL =
  "w-full rounded-2xl px-4 py-3 text-[0.95rem] outline-none transition-shadow " +
  "focus-visible:ring-2 focus-visible:ring-alma-berry focus-visible:ring-offset-2 focus-visible:ring-offset-alma-canvas " +
  "placeholder:text-alma-ink/35 disabled:opacity-60";

const controlStyle = (hasError?: boolean): CSSProperties => ({
  backgroundColor: ALMA.cream,
  color: ALMA.ink,
  border: `1px solid ${hasError ? ALMA.destructive : ALMA.border}`,
  minHeight: 48,
});

const idFromLabel = (label: string) =>
  "field-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export const FieldError = ({ msg }: { msg?: string }) =>
  msg ? (
    <p className="flex items-center gap-1.5 text-[0.78rem]" style={{ color: ALMA.destructive }}>
      <AlertCircle size={13} />
      {msg}
    </p>
  ) : null;

type FieldShellProps = {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
};

const FieldShell = ({ label, htmlFor, error, hint, children }: FieldShellProps) => (
  <div className="flex flex-col gap-1.5">
    <label
      htmlFor={htmlFor}
      className="text-[0.72rem] font-medium uppercase tracking-[0.18em]"
      style={{ color: ALMA.ink, opacity: 0.62 }}
    >
      {label}
    </label>
    {children}
    {error ? (
      <FieldError msg={error} />
    ) : hint ? (
      <p className="text-[0.78rem]" style={{ color: ALMA.ink, opacity: 0.55 }}>
        {hint}
      </p>
    ) : null}
  </div>
);

/* ── Field — input de texto / fecha / email ── */
type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, hint, id, className, ...rest }, ref) => {
    const fieldId = id ?? idFromLabel(label);
    return (
      <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint}>
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={CONTROL + " " + (className ?? "")}
          style={controlStyle(!!error)}
          {...rest}
        />
      </FieldShell>
    );
  }
);
Field.displayName = "Field";

/* ── SelectField ── */
type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, hint, id, className, children, ...rest }, ref) => {
    const fieldId = id ?? idFromLabel(label);
    return (
      <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint}>
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={CONTROL + " " + (className ?? "")}
          style={controlStyle(!!error)}
          {...rest}
        >
          {children}
        </select>
      </FieldShell>
    );
  }
);
SelectField.displayName = "SelectField";

/* ── TextAreaField ── */
type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  ({ label, error, hint, id, className, ...rest }, ref) => {
    const fieldId = id ?? idFromLabel(label);
    return (
      <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint}>
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={CONTROL + " min-h-[110px] resize-y " + (className ?? "")}
          style={controlStyle(!!error)}
          {...rest}
        />
      </FieldShell>
    );
  }
);
TextAreaField.displayName = "TextAreaField";

/* ── PasswordField — con toggle de visibilidad (target 44px) ── */
type PasswordFieldProps = Omit<FieldProps, "type">;

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ label, error, hint, id, className, ...rest }, ref) => {
    const [show, setShow] = useState(false);
    const fieldId = id ?? idFromLabel(label);
    return (
      <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint}>
        <div className="relative">
          <input
            ref={ref}
            id={fieldId}
            type={show ? "text" : "password"}
            aria-invalid={error ? true : undefined}
            className={CONTROL + " pr-14 " + (className ?? "")}
            style={controlStyle(!!error)}
            {...rest}
          />
          <button
            type="button"
            aria-pressed={show}
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShow((v) => !v)}
            className="absolute right-1 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full bg-transparent border-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alma-berry"
            style={{ color: ALMA.ink, opacity: 0.55 }}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </FieldShell>
    );
  }
);
PasswordField.displayName = "PasswordField";

/* ── PasswordRules — checklist en vivo; olive SOLO éxito ── */
type Rule = { label: string; ok: boolean };

export const PasswordRules = ({ password = "" }: { password?: string }) => {
  const rules: Rule[] = [
    { label: "Mínimo 8 caracteres", ok: password.length >= 8 },
    { label: "Una mayúscula", ok: /[A-Z]/.test(password) },
    { label: "Un número", ok: /[0-9]/.test(password) },
  ];
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-3 gap-y-1.5 gap-x-4 list-none p-0 m-0">
      {rules.map((r) => (
        <li
          key={r.label}
          className="flex items-center gap-2 text-[0.74rem]"
          style={{ color: r.ok ? ALMA.olive : ALMA.ink, opacity: r.ok ? 1 : 0.55 }}
        >
          <span
            className="grid h-4 w-4 place-items-center rounded-full transition-colors"
            style={{
              backgroundColor: r.ok ? ALMA.olive : "transparent",
              border: `1px solid ${r.ok ? ALMA.olive : ALMA.border}`,
              color: ALMA.cream,
            }}
          >
            {r.ok && <Check size={9} strokeWidth={3.5} />}
          </span>
          {r.label}
        </li>
      ))}
    </ul>
  );
};
