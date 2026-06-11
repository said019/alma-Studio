import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Check, Upload } from "lucide-react";
import { ALMA } from "@/components/app/tokens";

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
        className="w-full rounded-3xl p-7 text-center cursor-pointer transition-colors"
        style={{
          backgroundColor: file ? `${ALMA.olive}10` : dragOver ? ALMA.mist : "transparent",
          border: `1px dashed ${file ? ALMA.olive : dragOver ? ALMA.berry : ALMA.border}`,
          color: ALMA.ink,
        }}
      >
        <span
          className="grid h-12 w-12 mx-auto place-items-center rounded-full mb-3"
          style={{
            backgroundColor: file ? ALMA.olive : ALMA.blush,
            color: file ? ALMA.cream : ALMA.berry,
          }}
        >
          {file ? <Check size={20} strokeWidth={3} /> : <Upload size={18} />}
        </span>
        <span className="block text-[0.92rem] font-medium" style={{ color: ALMA.ink }}>
          {file ? file.name : "Toca aquí o arrastra el archivo"}
        </span>
        <span className="mt-1 block text-[0.78rem]" style={{ color: ALMA.ink, opacity: 0.55 }}>
          {hint}
        </span>
      </button>
    </>
  );
};
