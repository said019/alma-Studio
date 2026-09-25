import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Check, Upload } from "lucide-react";


/* ═══════════════════════════════════════════════════════════
   UploadDropzone — selector de comprobante de pago.
   Compartido entre Checkout y OrderDetail. El archivo vive en
   el padre; aquí solo selección por toque o arrastre.
   ═══════════════════════════════════════════════════════════ */
type UploadDropzoneProps = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  hint?: string;
};

export const UploadDropzone = ({
  file,
  onFileChange,
  accept = "image/*,.pdf",
  hint = "JPG, PNG o PDF",
}: UploadDropzoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onFileChange(e.target.files?.[0] ?? null);
    // Permite volver a elegir el mismo archivo después de "Cambiar".
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFileChange(dropped);
  };

  const zoneTone = file
    ? "border-success bg-success/10"
    : dragOver
      ? "border-accent bg-accent-soft"
      : "border-line-strong bg-surface dark:bg-surface/40";

  return (
    <>
      <input
        type="file"
        accept={accept}
        ref={inputRef}
        className="hidden"
        onChange={handleChange}
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={
          "w-full rounded-3xl border-[1.5px] border-dashed p-7 text-center cursor-pointer transition-colors text-ink " +
          zoneTone
        }
      >
        <span
          className={
            "grid h-12 w-12 mx-auto place-items-center rounded-full mb-3 " +
            (file ? "bg-success text-canvas" : "bg-sunken text-accent-strong")
          }
        >
          {file ? <Check size={20} strokeWidth={3} /> : <Upload size={18} />}
        </span>
        <span className="block text-[0.92rem] font-medium text-ink">
          {file ? file.name : "Toca aquí o arrastra el archivo"}
        </span>
        <span className="mt-1 block text-[0.78rem] text-ink-muted">
          {hint}
        </span>
      </button>
    </>
  );
};
