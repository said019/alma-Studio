import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

/* F1 — superficie clara (fondo surface, borde line, spec §4.7). Color por
   variante: destructive → danger (6.3:1 sobre surface), success → success,
   por defecto → ink. Nunca coral (regla 5: success/danger son funcionales,
   no decorativos; el coral no es color de error). */
const TONO = {
  error: { text: "text-danger", bar: "bg-danger", chip: "bg-danger/10 text-danger" },
  success: { text: "text-success", bar: "bg-success", chip: "bg-success/10 text-success" },
  info: { text: "text-ink", bar: "bg-ink", chip: "bg-ink/10 text-ink" },
} as const;

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const isError = variant === "destructive";
        const isSuccess = variant === "success";
        const t = TONO[isError ? "error" : isSuccess ? "success" : "info"];
        return (
          <Toast key={id} variant={variant} {...props}>
            {/* Franja izquierda */}
            <div className={"absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl " + t.bar} />
            {/* Ícono */}
            <div className={"shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base ml-2 " + t.chip}>
              {isError ? "⚠" : isSuccess ? "✓" : "●"}
            </div>
            <div className="grid gap-0.5 flex-1 min-w-0">
              {title && (
                <ToastTitle className={"text-[13px] font-semibold leading-tight " + t.text}>
                  {title}
                </ToastTitle>
              )}
              {description && (
                <ToastDescription className="text-[12px] text-ink-muted leading-snug">
                  {description}
                </ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
