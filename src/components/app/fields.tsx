import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertCircle, Check, Eye, EyeOff } from "lucide-react";


/* ═══════════════════════════════════════════════════════════
   Campos de formulario — lenguaje único de la app de clienta.
   Surface + borde lineStrong, foco ring-ink visible (WCAG 2.4.7),
   error en danger con icono. Lo usan ProfileEdit y
   ChangePassword; cualquier form nuevo debe importar de aquí.
   ═══════════════════════════════════════════════════════════ */

/* Campos (spec 2026-09-25 §5): surface en claro y hundido en oscuro, borde
   1.5 px lineStrong (3:1), foco en tinta con halo terracota suave, error en
   danger que dice qué pasa. Todo en clases por tema. */
const CONTROL =
  "w-full min-h-[48px] rounded-xl px-4 py-3 text-[0.95rem] outline-none transition-shadow " +
  "bg-surface dark:bg-sunken text-ink border-[1.5px] " +
  "focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-0 " +
  "focus-visible:shadow-[0_0_0_5px_theme(colors.accent.soft)] " +
  "placeholder:text-ink-faint disabled:opacity-60";

/** Clases de un campo; lo reutiliza AuthShell. */
export const controlClass = (hasError?: boolean) => `${CONTROL} ${hasError ? "border-danger" : "border-line-strong"}`;

const idFromLabel = (label: string) =>
  "field-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export const FieldError = ({ msg }: { msg?: string }) =>
  msg ? (
    <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-danger">
      <AlertCircle size={14} />
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

/* Etiqueta con el rol "label" del spec §3.3: 12 px, mayúsculas, +0.12em. */
const FieldShell = ({ label, htmlFor, error, hint, children }: FieldShellProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={htmlFor} className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">
      {label}
    </label>
    {children}
    {error ? (
      <FieldError msg={error} />
    ) : hint ? (
      <p className="text-[0.8125rem] text-ink-muted">
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
          className={controlClass(!!error) + " " + (className ?? "")}
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
          className={controlClass(!!error) + " " + (className ?? "")}
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
          className={controlClass(!!error) + " min-h-[110px] resize-y " + (className ?? "")}
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
            className={controlClass(!!error) + " pr-14 " + (className ?? "")}
            {...rest}
          />
          <button
            type="button"
            aria-pressed={show}
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShow((v) => !v)}
            className="absolute right-1 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full bg-transparent border-0 cursor-pointer text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
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
          className={"flex items-center gap-2 text-[0.75rem] " + (r.ok ? "text-success" : "text-ink-muted")}
        >
          <span
            className={"grid h-4 w-4 place-items-center rounded-full border text-canvas transition-colors " + (r.ok ? "bg-success border-success" : "bg-transparent border-line")}
          >
            {r.ok && <Check size={9} strokeWidth={3.5} />}
          </span>
          {r.label}
        </li>
      ))}
    </ul>
  );
};
