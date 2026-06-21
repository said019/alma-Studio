import { useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

export const Lightbox = ({ src, alt = "", onClose }: { src: string; alt?: string; onClose: () => void }) => (
  <div className="fixed inset-0 z-[200] bg-alma-ink-deep/95 flex items-center justify-center p-4" onClick={onClose}>
    <button aria-label="Cerrar" className="absolute top-4 right-4 text-alma-canvas/80 hover:text-alma-canvas bg-alma-ink/60 rounded-full p-2" onClick={onClose}>
      <X size={20} />
    </button>
    <img src={src} alt={alt} className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
  </div>
);

// Imagen que abre un lightbox al hacer click. Maneja su propio estado.
export const ZoomableImage = ({ src, alt = "", className, overlayLabel = "Ver completo" }: { src: string; alt?: string; className?: string; overlayLabel?: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={cn("relative group cursor-zoom-in", className)} onClick={() => setOpen(true)}>
        <img src={src} alt={alt} className="h-full w-full rounded-xl object-cover" />
        <span className="absolute inset-0 bg-alma-ink-deep/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2 text-alma-canvas text-sm">
          <ZoomIn size={18} /> {overlayLabel}
        </span>
      </button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
};
