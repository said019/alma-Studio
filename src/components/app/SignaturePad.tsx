import { useRef, useEffect, useCallback } from "react";
import { DARK } from "@/design/tokens";

/* El lienzo de firma pinta con Canvas2D, que no lee variables CSS: usa el
   hex fijo de DARK (excepción de librería, como el QR de Wallet). La
   baldosa es bg-inverse (clase, por tema) para que el trazo oscuro se vea
   siempre, incluso en la app oscura. */

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
}

export const SignaturePad = ({ onChange }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const hasStrokes = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);

  const getCtx = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  };

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = DARK.onInverse;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawPlaceholder(ctx, rect.width, rect.height);
  }, []);

  const drawPlaceholder = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ) => {
    // baseline
    ctx.save();
    ctx.strokeStyle = DARK.onInverseMuted;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(16, h - 24);
    ctx.lineTo(w - 16, h - 24);
    ctx.stroke();
    ctx.restore();

    // placeholder text
    ctx.save();
    ctx.fillStyle = DARK.onInverseMuted;
    ctx.font = "13px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Firma aquí", w / 2, h / 2 + 5);
    ctx.restore();
  };

  useEffect(() => {
    setupCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      if (!hasStrokes.current) setupCanvas();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [setupCanvas]);

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    const { x, y } = getCoords(e);
    lastX.current = x;
    lastY.current = y;

    // Clear placeholder on first stroke
    if (!hasStrokes.current) {
      const ctx = getCtx();
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        ctx.strokeStyle = DARK.onInverse;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
      hasStrokes.current = true;
    }

    const ctx = getCtx();
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(x, y, 1, 0, Math.PI * 2);
    ctx.fillStyle = DARK.onInverse;
    ctx.fill();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const ctx = getCtx();
    if (!ctx) return;

    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.strokeStyle = DARK.onInverse;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(lastX.current, lastY.current);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastX.current = x;
    lastY.current = y;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    isDrawing.current = false;

    const canvas = canvasRef.current;
    if (canvas && hasStrokes.current) {
      onChange(canvas.toDataURL("image/png"));
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = getCtx();
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    hasStrokes.current = false;
    drawPlaceholder(ctx, canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="block w-full h-[140px] rounded-2xl border border-line bg-inverse touch-none cursor-crosshair"
      />
      <button
        type="button"
        onClick={handleClear}
        className="self-end min-h-[44px] px-1 flex items-center bg-transparent border-0 cursor-pointer text-[0.75rem] uppercase tracking-[0.18em] text-ink-muted transition-colors hover:text-ink"
      >
        Borrar
      </button>
    </div>
  );
};
