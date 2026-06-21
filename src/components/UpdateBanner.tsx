import { useEffect, useRef, useState } from "react";

// Aviso "nueva versión disponible". Consulta /api/version (que cambia en cada
// deploy); si difiere de la versión cargada, muestra un botón Actualizar que
// recarga la página para traer el bundle nuevo. Usa solo clases CSS (sin estilos
// inline) para respetar el Content-Security-Policy.
const POLL_MS = 60_000;

export default function UpdateBanner() {
  const loaded = useRef<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok || !alive) return;
        const { version } = await r.json();
        if (!version) return;
        if (loaded.current === null) {
          loaded.current = version; // primera carga: versión base
        } else if (version !== loaded.current) {
          setStale(true); // hay un deploy nuevo
        }
      } catch {
        /* sin red: ignorar */
      }
    };
    check();
    const id = window.setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!stale) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[9999] flex justify-center px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pointer-events-none"
    >
      <div className="pointer-events-auto flex w-full max-w-[440px] items-center gap-3 rounded-2xl bg-[#43392F] px-4 py-3 text-[#FAF7F1] shadow-[0_12px_34px_rgba(0,0,0,0.28)]">
        <span className="flex-1 text-[13px] leading-snug">
          Hay una nueva versión de Alma disponible.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-full bg-[#FAF7F1] px-4 py-2 text-[13px] font-semibold text-[#43392F]"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
