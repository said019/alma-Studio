import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Check, AlertCircle, ChevronDown } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { HexPedestal } from "@/components/brand/HexPedestal";
import { PrimaryButton } from "@/components/app/AppShell";
import { controlClass } from "@/components/app/fields";


type Tint = "berry" | "coral" | "olive";

/* ── Campos alineados con src/components/app/fields.tsx (Tarea 9, ruling
   F6): fondo surface (hundido en oscuro), borde 1.5px lineStrong (3:1),
   radio 12px, alto ≥48px, foco ink + halo accent-soft, etiqueta 12px/
   inkMuted, placeholder inkMuted, error en danger. Spec §4.4 y §6.10. ── */
const LABEL_CLASS = "text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted";

type FieldFeedbackProps = {
  errorId: string;
  error?: string;
  success?: string;
  hint?: string;
};

const FieldFeedback = ({ errorId, error, success, hint }: FieldFeedbackProps) => {
  if (error) {
    return (
      <p id={errorId} className="mt-0.5 flex items-center gap-1.5 text-[0.78rem] text-danger">
        <AlertCircle size={13} className="shrink-0" />
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="mt-0.5 flex items-center gap-1.5 text-[0.78rem] text-success">
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success text-canvas">
          <Check size={9} strokeWidth={3.5} />
        </span>
        {success}
      </p>
    );
  }
  if (hint) {
    return <p className="text-[0.78rem] text-ink-muted">{hint}</p>;
  }
  return null;
};

export type AuthShellProps = {
  brandPhoto?: string;
  brandPhotoAlt?: string;
  brandTint?: Tint;
  brandEyebrow: string;
  brandHeadline: ReactNode;
  brandHeadlineItalic?: string;
  brandSubline?: string;
  brandList?: { label: string }[];
  brandQuote?: string;

  formEyebrow: string;
  formHeadline: ReactNode;
  formHeadlineItalic?: string;
  formIntro?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/* ═══════════════════════════════════════════════════════════
   AuthShell — split layout shared by Login, Register, Forgot, Reset
   Mobile: photo collapses to 30vh header banner with title overlay.
   Desktop: 50/50 split, brand left, form right.
   Oscuro (spec 2026-09-25 §6.10): fondo canvas con el resplandor fijo de
   AppShell; el panel de marca deja de ser inverse (en oscuro es claro) y
   pasa a surface/40 transparente sobre el resplandor.
   ═══════════════════════════════════════════════════════════ */
export const AuthShell = ({
  brandPhoto,
  brandPhotoAlt,
  brandTint = "berry",
  brandEyebrow,
  brandHeadline,
  brandHeadlineItalic,
  brandSubline,
  brandList,
  brandQuote,
  formEyebrow,
  formHeadline,
  formHeadlineItalic,
  formIntro,
  children,
  footer,
}: AuthShellProps) => {
  return (
    <div className="relative isolate min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-canvas text-ink">
      {/* Resplandor cálido del fondo: capa fija, como en AppShell (regla 5). */}
      <div aria-hidden="true" data-app-glow className="pointer-events-none fixed inset-0 -z-10 hidden dark:block bg-app-glow" />

      {/* ── BRAND PANEL — transparente sobre el resplandor, sin foto ── */}
      <aside
        className="relative overflow-hidden lg:min-h-screen bg-surface/40 border-b border-line lg:border-b-0 lg:border-r"
        style={{ minHeight: "30vh" }}
      >
        <span aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-24 opacity-[0.06] text-accent">
          <BrandLogo size={480} />
        </span>

        <div className="relative z-10 flex h-full min-h-[30vh] lg:min-h-screen flex-col justify-between p-6 sm:p-9 lg:p-12">
          <Link
            to="/"
            className="inline-flex w-fit items-center rounded-md no-underline transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
            aria-label="Inicio HIVE Pilates Studio"
          >
            <BrandLogo variant="lockup" size={56} className="text-accent" />
          </Link>

          <div className="hidden lg:flex lg:justify-center" aria-hidden="true">
            <HexPedestal size="lg" />
          </div>

          <div className="max-w-[440px]">
            <span className="text-[0.75rem] font-medium uppercase tracking-[0.32em] text-ink-muted">
              {brandEyebrow}
            </span>
            <h2
              className="font-display mt-4 leading-[0.96] text-ink"
              style={{ fontSize: "clamp(2.1rem, 4.4vw, 3.8rem)" }}
            >
              {brandHeadline}
              {brandHeadlineItalic && (
                <span
                  className="block font-display font-normal text-ink"
                  style={{ fontSize: "0.78em" }}
                >
                  {brandHeadlineItalic}
                </span>
              )}
            </h2>
            {brandSubline && (
              <p className="mt-5 text-[0.95rem] leading-[1.7] max-w-[34ch] text-ink-muted">
                {brandSubline}
              </p>
            )}

            {brandList && brandList.length > 0 && (
              <ul className="mt-7 hidden lg:flex flex-col list-none p-0 m-0">
                {brandList.map((item, i) => (
                  <li
                    key={item.label}
                    className={
                      "grid grid-cols-[auto_1fr] items-center gap-4 py-3 border-t border-line " +
                      (i === brandList.length - 1 ? "border-b" : "")
                    }
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-inverse text-inverse-foreground">
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="text-[0.88rem] leading-[1.55] text-ink">
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {brandQuote && (
              <p className="mt-7 hidden lg:block font-display text-[1.05rem] leading-[1.55] max-w-[32ch] text-ink-muted">
                «{brandQuote}»
              </p>
            )}
          </div>

          <div className="hidden lg:flex items-center justify-between text-[0.75rem] uppercase tracking-[0.22em] text-ink-muted">
            <span>Move with intention</span>
            <span>Juriquilla, Querétaro, MX</span>
          </div>
        </div>
      </aside>

      {/* ── FORM PANEL ── */}
      <main className="relative flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-10 lg:py-12">
        <div className="mx-auto w-full max-w-[460px]">
          <div className="mb-9">
            <span className="inline-flex items-center gap-2 text-[0.75rem] font-medium uppercase tracking-[0.32em] text-accent-strong">
              <span className="inline-block h-px w-5 bg-ink" />
              {formEyebrow}
            </span>
            <h1
              className="font-display mt-4 leading-[0.96] tracking-[-0.005em] text-ink"
              style={{ fontSize: "clamp(2.3rem, 4vw, 3.2rem)" }}
            >
              {formHeadline}
              {formHeadlineItalic && (
                <span
                  className="block font-display font-normal text-ink-muted"
                  style={{ fontSize: "0.78em" }}
                >
                  {formHeadlineItalic}
                </span>
              )}
            </h1>
            {formIntro && (
              <p className="mt-4 text-[0.95rem] leading-[1.65] max-w-[44ch] text-ink-muted">
                {formIntro}
              </p>
            )}
          </div>

          {children}

          {footer && <div className="mt-8">{footer}</div>}

          <p className="mt-10 text-[0.75rem] uppercase tracking-[0.2em] text-ink-muted">
            © <span className="nums">{new Date().getFullYear()}</span> HIVE Pilates Studio
          </p>
        </div>
      </main>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   AuthField — input with label + error/success/hint
   ═══════════════════════════════════════════════════════════ */

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  success?: string;
  hint?: string;
  rightSlot?: ReactNode;
};

export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(
  ({ label, error, success, hint, rightSlot, className, id, ...rest }, ref) => {
    const inputId = id ?? `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
    const errorId = `${inputId}-error`;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={inputId} className={LABEL_CLASS}>
            {label}
          </label>
          {rightSlot}
        </div>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={controlClass(!!error) + " " + (className ?? "")}
          {...rest}
        />
        <FieldFeedback errorId={errorId} error={error} success={success} hint={hint} />
      </div>
    );
  }
);
AuthField.displayName = "AuthField";

/* ═══════════════════════════════════════════════════════════
   AuthPasswordField — with eye toggle
   ═══════════════════════════════════════════════════════════ */

type AuthPasswordFieldProps = Omit<AuthFieldProps, "type" | "rightSlot"> & {
  forgotLink?: string;
};

export const AuthPasswordField = forwardRef<HTMLInputElement, AuthPasswordFieldProps>(
  ({ label, error, success, hint, forgotLink, className, id, ...rest }, ref) => {
    const [show, setShow] = useState(false);
    const inputId = id ?? `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
    const errorId = `${inputId}-error`;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={inputId} className={LABEL_CLASS}>
            {label}
          </label>
          {forgotLink && (
            <Link
              to={forgotLink}
              className="rounded-md text-[0.75rem] no-underline transition-opacity hover:opacity-75 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong text-accent-strong"
            >
              ¿Olvidaste?
            </Link>
          )}
        </div>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={show ? "text" : "password"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={controlClass(!!error) + " pr-14 " + (className ?? "")}
            {...rest}
          />
          <button
            type="button"
            aria-pressed={show}
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShow((v) => !v)}
            className="absolute right-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong text-accent-strong"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <FieldFeedback errorId={errorId} error={error} success={success} hint={hint} />
      </div>
    );
  }
);
AuthPasswordField.displayName = "AuthPasswordField";

/* ═══════════════════════════════════════════════════════════
   AuthSelect — select nativo con chevron ink y label del sistema
   ═══════════════════════════════════════════════════════════ */

type AuthSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
};

export const AuthSelect = forwardRef<HTMLSelectElement, AuthSelectProps>(
  ({ label, error, hint, className, id, children, ...rest }, ref) => {
    const inputId = id ?? `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
    const errorId = `${inputId}-error`;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className={LABEL_CLASS}>
          {label}
        </label>
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={controlClass(!!error) + " appearance-none pr-11 " + (className ?? "")}
            {...rest}
          >
            {children}
          </select>
          <ChevronDown
            size={15}
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink"
          />
        </div>
        <FieldFeedback errorId={errorId} error={error} hint={hint} />
      </div>
    );
  }
);
AuthSelect.displayName = "AuthSelect";

/* ═══════════════════════════════════════════════════════════
   AuthTextarea — textarea con label del sistema + aria de error
   ═══════════════════════════════════════════════════════════ */

type AuthTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const AuthTextarea = forwardRef<HTMLTextAreaElement, AuthTextareaProps>(
  ({ label, error, hint, className, id, ...rest }, ref) => {
    const inputId = id ?? `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
    const errorId = `${inputId}-error`;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className={LABEL_CLASS}>
          {label}
        </label>
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={controlClass(!!error) + " resize-none " + (className ?? "")}
          {...rest}
        />
        <FieldFeedback errorId={errorId} error={error} hint={hint} />
      </div>
    );
  }
);
AuthTextarea.displayName = "AuthTextarea";

/* ═══════════════════════════════════════════════════════════
   AuthSubmit — CTA primario; envuelve PrimaryButton (degradado en
   oscuro) para no duplicar estilos de botón (spec §6.10).
   ═══════════════════════════════════════════════════════════ */

type AuthSubmitProps = {
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
  disabled?: boolean;
};

export const AuthSubmit = ({ loading, loadingLabel, children, disabled }: AuthSubmitProps) => (
  <PrimaryButton type="submit" loading={loading} loadingLabel={loadingLabel} disabled={disabled} className="mt-2 w-full">
    {children}
  </PrimaryButton>
);

/* ═══════════════════════════════════════════════════════════
   AuthSecondaryLink — full-width ghost link styled as button
   ═══════════════════════════════════════════════════════════ */

type AuthSecondaryLinkProps = {
  to: string;
  children: ReactNode;
};

export const AuthSecondaryLink = ({ to, children }: AuthSecondaryLinkProps) => (
  <Link
    to={to}
    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line px-6 py-3.5 text-[0.78rem] font-medium uppercase tracking-[0.2em] text-ink no-underline transition-colors duration-200 hover:border-line-strong hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
  >
    {children}
  </Link>
);

/* ═══════════════════════════════════════════════════════════
   AuthErrorBanner — único canal de error global del formulario
   ═══════════════════════════════════════════════════════════ */

export const AuthErrorBanner = ({ message }: { message: string }) => (
  <div
    role="alert"
    className="mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-[0.86rem] bg-danger/10 border-danger/25 text-danger"
  >
    <AlertCircle size={16} className="mt-0.5 shrink-0" />
    <span className="leading-[1.5]">{message}</span>
  </div>
);

/* ═══════════════════════════════════════════════════════════
   AuthDivider — hairline with optional center label
   ═══════════════════════════════════════════════════════════ */

export const AuthDivider = ({ label }: { label?: string }) => (
  <div className="my-7 flex items-center gap-4">
    <span className="flex-1 h-px bg-line" />
    {label && (
      <span className="text-[0.75rem] uppercase tracking-[0.22em] text-ink-muted">
        {label}
      </span>
    )}
    <span className="flex-1 h-px bg-line" />
  </div>
);

/* ═══════════════════════════════════════════════════════════
   AuthCheckbox — controlled custom checkbox row
   ═══════════════════════════════════════════════════════════ */

type AuthCheckboxProps = {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  error?: string;
};

export const AuthCheckbox = ({ checked, onChange, children, error }: AuthCheckboxProps) => (
  <div className="flex flex-col gap-1">
    <label className="flex min-h-[44px] items-start gap-3 cursor-pointer group">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-1 focus-visible:ring-offset-canvas " +
          (checked ? "bg-ink border-accent-strong" : "bg-transparent border-line-strong")
        }
      >
        {checked && <Check size={12} strokeWidth={3} className="text-canvas" />}
      </button>
      <span className="text-[0.86rem] leading-[1.5] transition-opacity group-hover:opacity-100 text-ink-muted">
        {children}
      </span>
    </label>
    {error && (
      <p className="flex items-center gap-1.5 pl-8 text-[0.78rem] text-danger">
        <AlertCircle size={13} />
        {error}
      </p>
    )}
  </div>
);

/* ═══════════════════════════════════════════════════════════
   AuthPasswordRules — live requirements list (success sólo en éxito)
   ═══════════════════════════════════════════════════════════ */

type Rule = { label: string; ok: boolean };
export const AuthPasswordRules = ({ password = "" }: { password?: string }) => {
  const rules: Rule[] = [
    { label: "Mínimo 8 caracteres", ok: password.length >= 8 },
    { label: "Una mayúscula", ok: /[A-Z]/.test(password) },
    { label: "Un número", ok: /[0-9]/.test(password) },
  ];
  return (
    <ul className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-y-1 gap-x-4 list-none p-0 m-0">
      {rules.map((r) => (
        <li key={r.label} className={"flex items-center gap-2 text-[0.75rem] " + (r.ok ? "text-success" : "text-ink-muted")}>
          <span
            className={
              "grid h-4 w-4 place-items-center rounded-full border text-canvas transition-colors " +
              (r.ok ? "bg-success border-success" : "bg-transparent border-line")
            }
          >
            {r.ok && <Check size={9} strokeWidth={3.5} />}
          </span>
          {r.label}
        </li>
      ))}
    </ul>
  );
};
