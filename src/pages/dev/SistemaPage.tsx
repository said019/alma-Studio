// Referencia viva del sistema HIVE. Sólo existe en desarrollo (spec §7 y
// 2026-09-25-hive-app-oscura-design.md §9). Muestra los dos temas —claro
// (panel) y oscuro (app, acceso, 404)— lado a lado: cada `<section
// data-theme>` fija su propio tema (spec §4), así las clases `dark:` y las
// variables CSS por tema se resuelven igual que en las pantallas reales.
import { THEMES, TONES, type Theme } from "@/design/tokens";
import { contrast } from "@/design/contrast";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { HexPedestal } from "@/components/brand/HexPedestal";
import { PageHeader, Section, ListGroup, ListRow, Tag, Stat, EmptyState, ErrorState, SkeletonRow, PrimaryButton, GhostButton } from "@/components/app/AppShell";
import { StatusPill, InfoBanner, SegmentedTabs } from "@/components/app/widgets";
import { Field } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import FigureCard from "@/components/admin/FigureCard";
import { CalendarDays } from "lucide-react";

const NOMBRE_TEMA: Record<Theme, string> = {
  light: "Claro · panel, landing y legales",
  dark: "Oscuro · app de clienta, acceso y 404",
};

function ColumnaTema({ tema }: { tema: Theme }) {
  const tokens = THEMES[tema];
  return (
    <section
      data-theme={tema}
      className={
        "relative isolate overflow-hidden rounded-[28px] border border-line bg-canvas text-ink p-5 sm:p-7" +
        (tema === "dark" ? " bg-app-glow" : "")
      }
    >
      <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted mb-6">{NOMBRE_TEMA[tema]}</p>

      <Section title="Color" className="mt-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(tokens).map(([nombre, valor]) => (
            <div key={nombre} className="rounded-xl overflow-hidden bg-surface dark:bg-surface/70 shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)]">
              <div className="h-14" style={{ backgroundColor: valor }} />
              <div className="p-2.5">
                <p className="text-[0.8125rem] font-bold">{nombre}</p>
                <p className="font-mono text-[0.75rem] text-ink-muted">{valor}</p>
                <p className="nums text-[0.75rem] text-ink-muted">sobre canvas {contrast(valor, tokens.canvas).toFixed(2)}:1</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap gap-3">
          <PrimaryButton>Reservar</PrimaryButton>
          <PrimaryButton variant="accent">Comprar paquete</PrimaryButton>
          <GhostButton>Ver mis clases</GhostButton>
          <GhostButton tone="danger">Cancelar reserva</GhostButton>
          <PrimaryButton disabled>Sin lugares</PrimaryButton>
        </div>
      </Section>

      <Section title="Pills y estados">
        <div className="flex flex-wrap gap-2">
          <Tag tint="accent" variant="solid">4 lugares</Tag>
          <Tag tint="accent">Últimos 2</Tag>
          <Tag tint="ink" variant="solid">Llena</Tag>
          {TONES.map((t) => <StatusPill key={t} label={`tono ${t}`} tone={t} />)}
        </div>
        <div className="mt-4"><InfoBanner title="Tu paquete vence en 3 días" description="Renueva para no perder tu lugar." /></div>
      </Section>

      <Section title="Listas">
        <SegmentedTabs options={[{ value: "a", label: "Próximas" }, { value: "b", label: "Pasadas" }]} value="a" onChange={() => {}} />
        <div className="mt-4">
          <ListGroup>
            <ListRow title="Reformer · Ana" description="Martes 24 · 07:00" icon={<CalendarDays size={17} />} to="/sistema" />
            <ListRow title="Cerrar sesión" destructive onClick={() => {}} />
          </ListGroup>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <Stat value="12" label="Clases hoy" />
          <Stat value="3" label="Por verificar" tint="accent" />
          <Stat value="87%" label="Ocupación" />
        </div>
      </Section>

      <Section title="Campos">
        <div className="grid gap-3 max-w-md">
          <Field id={`campo-nombre-${tema}`} label="Nombre" defaultValue="Mariana Ruiz" />
          <Field id={`campo-correo-${tema}`} label="Correo" defaultValue="mariana@" error="Falta el dominio del correo." />
        </div>
      </Section>

      <Section title="Estados">
        <div className="flex flex-wrap items-start gap-8">
          <HexPedestal size="lg" />
          <EmptyState title="Aún no tienes clases" description="Cuando reserves, aparecen aquí." ctaLabel="Reservar" ctaTo="/sistema" />
        </div>
        <ErrorState onRetry={() => {}} />
        <div className="grid gap-2 mt-4"><SkeletonRow /><SkeletonRow height={40} /></div>
      </Section>
    </section>
  );
}

export default function SistemaPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink px-5 py-8 lg:px-12 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <BrandLogo variant="lockup" size={44} />
        <span className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Sistema · sólo desarrollo</span>
      </div>

      <PageHeader
        eyebrow="Sistema HIVE"
        title="Tokens y piezas"
        subtitle="Referencia viva: los dos temas lado a lado, tal como los usan las pantallas."
      />

      <Section title="Tipografía">
        <p className="font-display font-extrabold uppercase text-[2.5rem] leading-none">Clase reservada</p>
        <p className="font-display font-extrabold uppercase text-[1.75rem] mt-3">Reserva tu clase</p>
        <p className="font-display font-semibold text-[1.25rem] mt-3">Martes 24 · 18:00</p>
        <p className="text-[1.0625rem] mt-3">Te quedan 5 clases en tu paquete, vence el 18 de octubre.</p>
        <p className="text-[0.9375rem] mt-2">Puedes cancelar sin costo hasta 12 horas antes de tu clase.</p>
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted mt-2">Por verificar</p>
        <p className="nums text-[0.9375rem] font-semibold mt-2">07:00 · 08:00 · 18:00 · $1,760 · $920</p>
      </Section>

      {/* El panel es claro, sin réplica en oscuro (spec §7): sus piezas se
          muestran una sola vez, fuera de las dos columnas. `Badge`
          variant="attention" usa `bg-accent text-ink` a propósito: en claro
          `ink` es `onAccent` (mismo hex), pero en oscuro `ink` es claro sobre
          terracota — mostrarlo dentro de la columna oscura violaría la regla 1. */}
      <Section title="Panel · tarjetas de cifra">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FigureCard label="Clases hoy" value="12" />
          <FigureCard label="Por verificar" value="3" hint="Transferencias sin revisar" attention />
          <FigureCard label="Ocupación" value="87%" />
          <FigureCard label="Ingresos del mes" value="$48,200" />
        </div>
      </Section>

      <Section title="Panel · botones y badges">
        <div className="flex flex-wrap gap-3">
          <Button>Panel · primary</Button>
          <Button disabled>Panel · deshabilitado</Button>
          <Button variant="outline">Panel · outline</Button>
          <Button variant="destructive">Panel · destructive</Button>
          <Badge variant="attention">3 por verificar</Badge>
          <Badge variant="success">Pagado</Badge>
        </div>
      </Section>

      <Section title="Los dos temas">
        <div className="grid lg:grid-cols-2 gap-6">
          <ColumnaTema tema="light" />
          <ColumnaTema tema="dark" />
        </div>
      </Section>
    </div>
  );
}
