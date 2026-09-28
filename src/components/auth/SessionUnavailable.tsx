interface SessionUnavailableProps {
  onRetry: () => void;
}

/**
 * Pantalla compartida por AuthGuard (panel) y ClientAuthGuard (app) cuando
 * no se pudo verificar la sesión (429/5xx/red) y no hay usuaria guardada:
 * nunca manda al login por un problema del servidor, porque le borraría una
 * sesión que podría seguir siendo válida (auditoría 2026-09-27, riesgo 3).
 */
export const SessionUnavailable = ({ onRetry }: SessionUnavailableProps) => (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-foreground p-6 text-center">
    <p>No pudimos verificar tu sesión. El servidor está ocupado.</p>
    <button type="button" className="min-h-[44px] rounded-full border px-5 font-bold" onClick={onRetry}>
      Reintentar
    </button>
  </div>
);
