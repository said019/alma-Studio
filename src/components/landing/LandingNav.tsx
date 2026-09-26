import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAuthStore } from "@/stores/authStore";
import { accountLink } from "./landingData";

type NavLinkItem = { href: string; label: string };

export function LandingNav({ links }: { links: NavLinkItem[] }) {
  const { isAuthenticated, user } = useAuthStore();
  const account = accountLink(user, isAuthenticated);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-3 px-5 sm:px-8">
        <Link to="/" aria-label="HIVE Pilates Studio" className="text-ink no-underline [&_svg]:text-accent">
          <BrandLogo variant="lockup" size={30} />
        </Link>
        <nav aria-label="Secciones" className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[0.85rem] font-bold text-ink-muted no-underline transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to={account.to}
            className="inline-flex min-h-[44px] items-center rounded-full border border-line-strong px-4 text-[0.8rem] font-extrabold text-ink no-underline"
          >
            {account.label}
          </Link>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full border border-line-strong text-ink-muted lg:hidden"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            aria-controls="landing-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="landing-menu" aria-label="Secciones" className="border-t border-line px-5 pb-3 lg:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex min-h-[44px] items-center text-[0.95rem] font-bold text-ink no-underline">
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
