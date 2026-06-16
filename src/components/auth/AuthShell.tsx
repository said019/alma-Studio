import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, ArrowRight, Check, AlertCircle, ChevronDown } from "lucide-react";
import { ALMA } from "@/components/app/tokens";
import almaMarkLight from "@/assets/alma/alma-mark-light.png";

/* Paleta canónica re-exportada: las páginas de auth y ChangePassword
   importan ALMA desde aquí. Única fuente de verdad: app/tokens. */
export { ALMA };

type Tint = "berry" | "coral" | "olive";

/* ── Micro-sistema de campos: label uppercase ≥0.72rem en berry (AA),
   input cream con hairline y focus ring de marca. ── */
const LABEL_CLASS = "text-[0.72rem] font-medium uppercase tracking-[0.22em]";

const INPUT_CLASS =
  "w-full rounded-2xl px-4 py-3.5 text-[0.95rem] outline-none transition-all duration-200 placeholder:text-[color:rgba(67,57,47,0.38)] focus-visible:ring-2 focus-visible:ring-alma-berry";

const inputStyle = (error?: string) => ({
  backgroundColor: ALMA.cream,
  color: ALMA.ink,
  border: `1px solid ${error ? ALMA.destructive : ALMA.border}`,
});

type FieldFeedbackProps = {
  errorId: string;
  error?: string;
  success?: string;
  hint?: string;
};

const FieldFeedback = ({ errorId, error, success, hint }: FieldFeedbackProps) => {
  if (error) {
    return (
      <p id={errorId} className="mt-0.5 flex items-center gap-1.5 text-[0.78rem]" style={{ color: ALMA.destructive }}>
        <AlertCircle size={13} className="shrink-0" />
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="mt-0.5 flex items-center gap-1.5 text-[0.78rem]" style={{ color: ALMA.olive }}>
        <span
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: ALMA.olive, color: ALMA.cream }}
        >
          <Check size={9} strokeWidth={3.5} />
        </span>
        {success}
      </p>
    );
  }
  if (hint) {
    return (
      <p className="text-[0.78rem]" style={{ color: ALMA.ink, opacity: 0.55 }}>
        {hint}
      </p>
    );
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
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2" style={{ backgroundColor: ALMA.cream, color: ALMA.ink }}>
      {/* ── BRAND PANEL — drench oscuro + logo, sin foto ── */}
      <aside
        className="relative overflow-hidden lg:min-h-screen"
        style={{ minHeight: "30vh", backgroundColor: ALMA.inkDeep }}
      >
        <img src={almaMarkLight} alt="" aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 w-[78%] max-w-[480px] opacity-[0.08]" />
        <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(110% 80% at 0% 0%, ${ALMA.berry}59 0%, transparent 55%)` }} />

        <div className="relative z-10 flex h-full min-h-[30vh] lg:min-h-screen flex-col justify-between p-6 sm:p-9 lg:p-12">
          <Link
            to="/"
            className="inline-flex w-fit items-center rounded-md no-underline transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alma-canvas"
            aria-label="Inicio Alma Movement"
          >
            <img src={almaMarkLight} alt="Alma Movement" className="h-16 sm:h-20 w-auto object-contain" />
          </Link>

          <div className="max-w-[440px]">
            <span className="text-[0.72rem] font-medium uppercase tracking-[0.32em]" style={{ color: ALMA.cream, opacity: 0.78 }}>
              {brandEyebrow}
            </span>
            <h2
              className="font-display mt-4 leading-[0.96]"
              style={{ color: ALMA.cream, fontSize: "clamp(2.1rem, 4.4vw, 3.8rem)" }}
            >
              {brandHeadline}
              {brandHeadlineItalic && (
                <span
                  className="block font-display-italic font-normal"
                  style={{ color: ALMA.cream, opacity: 0.92, fontSize: "0.78em" }}
                >
                  {brandHeadlineItalic}
                </span>
              )}
            </h2>
            {brandSubline && (
              <p className="mt-5 text-[0.95rem] leading-[1.7] max-w-[34ch]" style={{ color: ALMA.cream, opacity: 0.85 }}>
                {brandSubline}
              </p>
            )}

            {brandList && brandList.length > 0 && (
              <ul className="mt-7 hidden lg:flex flex-col list-none p-0 m-0">
                {brandList.map((item, i) => (
                  <li
                    key={item.label}
                    className="grid grid-cols-[auto_1fr] items-center gap-4 py-3"
                    style={{
                      borderTop: `1px solid ${ALMA.cream}33`,
                      borderBottom: i === brandList.length - 1 ? `1px solid ${ALMA.cream}33` : undefined,
                    }}
                  >
                    <span
                      className="grid h-7 w-7 place-items-center rounded-full"
                      style={{ backgroundColor: ALMA.cream, color: ALMA.berry }}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="text-[0.88rem] leading-[1.55]" style={{ color: ALMA.cream, opacity: 0.92 }}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {brandQuote && (
              <p className="mt-7 hidden lg:block font-display-italic text-[1.05rem] leading-[1.55] max-w-[32ch]" style={{ color: ALMA.cream, opacity: 0.85 }}>
                «{brandQuote}»
              </p>
            )}
          </div>

          <div className="hidden lg:flex items-center justify-between text-[0.72rem] uppercase tracking-[0.22em]" style={{ color: ALMA.cream, opacity: 0.55 }}>
            <span>Move with intention</span>
            <span>Juriquilla, Querétaro, MX</span>
          </div>
        </div>
      </aside>

      {/* ── FORM PANEL ── */}
      <main className="relative flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-10 lg:py-12">
        <div className="mx-auto w-full max-w-[460px]">
          <div className="mb-9">
            <span className="inline-flex items-center gap-2 text-[0.72rem] font-medium uppercase tracking-[0.32em]" style={{ color: ALMA.berry }}>
              <span className="inline-block h-px w-5" style={{ backgroundColor: ALMA.berry }} />
              {formEyebrow}
            </span>
            <h1
              className="font-display mt-4 leading-[0.96] tracking-[-0.005em]"
              style={{ color: ALMA.ink, fontSize: "clamp(2.3rem, 4vw, 3.2rem)" }}
            >
              {formHeadline}
              {formHeadlineItalic && (
                <span
                  className="block font-display-italic font-normal"
                  style={{ color: ALMA.stone, fontSize: "0.78em" }}
                >
                  {formHeadlineItalic}
                </span>
              )}
            </h1>
            {formIntro && (
              <p className="mt-4 text-[0.95rem] leading-[1.65] max-w-[44ch]" style={{ color: ALMA.ink, opacity: 0.7 }}>
                {formIntro}
              </p>
            )}
          </div>

          {children}

          {footer && <div className="mt-8">{footer}</div>}

          <p className="mt-10 text-[0.72rem] uppercase tracking-[0.2em]" style={{ color: ALMA.ink, opacity: 0.42 }}>
            © <span className="nums">{new Date().getFullYear()}</span> Alma Movement
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
          <label htmlFor={inputId} className={LABEL_CLASS} style={{ color: ALMA.berry }}>
            {label}
          </label>
          {rightSlot}
        </div>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={INPUT_CLASS + " " + (className ?? "")}
          style={inputStyle(error)}
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
          <label htmlFor={inputId} className={LABEL_CLASS} style={{ color: ALMA.berry }}>
            {label}
          </label>
          {forgotLink && (
            <Link
              to={forgotLink}
              className="rounded-md text-[0.74rem] no-underline transition-opacity hover:opacity-75 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alma-berry"
              style={{ color: ALMA.berry }}
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
            className={INPUT_CLASS + " pl-4 pr-14 " + (className ?? "")}
            style={inputStyle(error)}
            {...rest}
          />
          <button
            type="button"
            aria-pressed={show}
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShow((v) => !v)}
            className="absolute right-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full transition-colors hover:bg-alma-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alma-berry"
            style={{ color: ALMA.berry }}
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
        <label htmlFor={inputId} className={LABEL_CLASS} style={{ color: ALMA.berry }}>
          {label}
        </label>
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={INPUT_CLASS + " appearance-none pr-11 " + (className ?? "")}
            style={inputStyle(error)}
            {...rest}
          >
            {children}
          </select>
          <ChevronDown
            size={15}
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
            style={{ color: ALMA.ink }}
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
        <label htmlFor={inputId} className={LABEL_CLASS} style={{ color: ALMA.berry }}>
          {label}
        </label>
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={INPUT_CLASS + " resize-none " + (className ?? "")}
          style={inputStyle(error)}
          {...rest}
        />
        <FieldFeedback errorId={errorId} error={error} hint={hint} />
      </div>
    );
  }
);
AuthTextarea.displayName = "AuthTextarea";

/* ═══════════════════════════════════════════════════════════
   AuthSubmit — CTA primario ink sólido con loading
   ═══════════════════════════════════════════════════════════ */

type AuthSubmitProps = {
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
  disabled?: boolean;
};

export const AuthSubmit = ({ loading, loadingLabel, children, disabled }: AuthSubmitProps) => (
  <button
    type="submit"
    disabled={disabled || loading}
    className="group relative mt-2 inline-flex w-full items-center justify-center gap-3 rounded-full bg-alma-ink px-7 py-4 text-[0.84rem] font-medium uppercase tracking-[0.18em] text-alma-canvas transition-transform duration-200 hover:-translate-y-0.5 hover:bg-alma-ink-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alma-berry focus-visible:ring-offset-2 disabled:opacity-60 disabled:translate-y-0 disabled:cursor-not-allowed"
    style={{ boxShadow: `0 12px 28px ${ALMA.ink}30` }}
  >
    {loading ? (
      <>
        <Loader2 size={15} className="animate-spin" />
        {loadingLabel ?? "Cargando…"}
      </>
    ) : (
      <>
        {children}
        <span
          className="grid h-7 w-7 place-items-center rounded-full transition-transform group-hover:translate-x-0.5"
          style={{ backgroundColor: `${ALMA.cream}26` }}
        >
          <ArrowRight size={13} />
        </span>
      </>
    )}
  </button>
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
    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-alma-hairline px-6 py-3.5 text-[0.78rem] font-medium uppercase tracking-[0.2em] text-alma-ink no-underline transition-colors duration-200 hover:border-alma-sandstone hover:bg-alma-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alma-berry focus-visible:ring-offset-2"
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
    className="mb-6 flex items-start gap-3 rounded-2xl px-4 py-3 text-[0.86rem]"
    style={{
      backgroundColor: `${ALMA.destructive}10`,
      border: `1px solid ${ALMA.destructive}40`,
      color: ALMA.destructive,
    }}
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
    <span className="flex-1 h-px" style={{ backgroundColor: ALMA.border }} />
    {label && (
      <span className="text-[0.72rem] uppercase tracking-[0.22em]" style={{ color: ALMA.ink, opacity: 0.45 }}>
        {label}
      </span>
    )}
    <span className="flex-1 h-px" style={{ backgroundColor: ALMA.border }} />
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
    <label className="flex items-start gap-3 cursor-pointer group">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alma-berry focus-visible:ring-offset-1"
        style={{
          backgroundColor: checked ? ALMA.berry : "transparent",
          border: `1px solid ${checked ? ALMA.berry : ALMA.sandstone}`,
        }}
      >
        {checked && <Check size={12} strokeWidth={3} style={{ color: ALMA.cream }} />}
      </button>
      <span className="text-[0.86rem] leading-[1.5] transition-opacity group-hover:opacity-100" style={{ color: ALMA.ink, opacity: 0.78 }}>
        {children}
      </span>
    </label>
    {error && (
      <p className="flex items-center gap-1.5 pl-8 text-[0.78rem]" style={{ color: ALMA.destructive }}>
        <AlertCircle size={13} />
        {error}
      </p>
    )}
  </div>
);

/* ═══════════════════════════════════════════════════════════
   AuthPasswordRules — live requirements list (olive = éxito)
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
        <li key={r.label} className="flex items-center gap-2 text-[0.74rem]" style={{ color: r.ok ? ALMA.olive : ALMA.ink, opacity: r.ok ? 1 : 0.5 }}>
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
