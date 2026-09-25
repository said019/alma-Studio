import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { COLOR } from "@/design/tokens";

/* F1 — superficie clara (fondo surface, borde line, spec §4.7). Color por
   variante: destructive → danger (6.3:1 sobre surface), success → success,
   por defecto → ink. Nunca coral (regla 5: success/danger son funcionales,
   no decorativos; el coral no es color de error). */
export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const isError = variant === "destructive";
        const isSuccess = variant === "success";
        const tone = isError ? COLOR.danger : isSuccess ? COLOR.success : COLOR.ink;
        return (
          <Toast key={id} variant={variant} {...props}>
            {/* Franja izquierda */}
            <div
              className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
              style={{ background: tone }}
            />
            {/* Ícono */}
            <div
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base ml-2"
              style={{ background: `${tone}1a`, color: tone }}
            >
              {isError ? "⚠" : isSuccess ? "✓" : "●"}
            </div>
            <div className="grid gap-0.5 flex-1 min-w-0">
              {title && (
                <ToastTitle className="text-[13px] font-semibold leading-tight" style={{ color: tone }}>
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
