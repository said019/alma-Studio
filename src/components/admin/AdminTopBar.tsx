import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ScanLine } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanSeeFinance } from "@/lib/roles";
import ClientSearch from "./ClientSearch";

/* Barra superior de escritorio (spec §4.2): buscador de clientas con ⌘K,
   "Pasar lista" y, para la dueña, "Cobrar". Sin migaja: el encabezado de
   cada pantalla ya dice dónde estás. */
export default function AdminTopBar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const showFinance = useCanSeeFinance();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className={cn("sticky top-0 z-30 h-[72px] shrink-0 items-center gap-4 border-b border-line bg-canvas px-8", className)}>
      <ClientSearch
        inputRef={inputRef}
        shortcutHint
        className="w-full max-w-[520px]"
        onSelect={(c) => navigate(`/admin/clients/${c.id}`)}
      />
      <div className="ml-auto flex items-center gap-2.5">
        <Link to="/admin/pasar-lista" className={cn(buttonVariants({ variant: "outline" }), "no-underline")}>
          <ScanLine size={16} aria-hidden="true" />
          Pasar lista
        </Link>
        {showFinance && (
          <Link to="/admin/payments" className={cn(buttonVariants(), "no-underline")}>
            <Plus size={16} aria-hidden="true" />
            Cobrar
          </Link>
        )}
      </div>
    </header>
  );
}
