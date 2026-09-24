// Referencia viva del sistema HIVE. Sólo existe en desarrollo (spec §7).
import { COLOR, TONES } from "@/design/tokens";
import { contrast } from "@/design/contrast";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PageHeader, Section, ListGroup, ListRow, Tag, Stat, EmptyState, ErrorState, SkeletonRow, PrimaryButton, GhostButton } from "@/components/app/AppShell";
import { StatusPill, InfoBanner, SegmentedTabs } from "@/components/app/widgets";
import { Field } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import FigureCard from "@/components/admin/FigureCard";
import { CalendarDays } from "lucide-react";

export default function SistemaPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink px-5 py-8 lg:px-12 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <BrandLogo variant="lockup" size={44} />
        <span className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Sistema · sólo desarrollo</span>
      </div>

      <PageHeader eyebrow="Sistema HIVE" title="Tokens y piezas" subtitle="Referencia viva: lo que ves aquí es lo que usan las pantallas." />

      <Section title="Color">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(COLOR).map(([nombre, valor]) => (
            <div key={nombre} className="rounded-xl overflow-hidden bg-surface shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)]">
              <div className="h-14" style={{ backgroundColor: valor }} />
              <div className="p-2.5">
                <p className="text-[0.8125rem] font-bold">{nombre}</p>
                <p className="font-mono text-[0.75rem] text-ink-muted">{valor}</p>
                <p className="nums text-[0.75rem] text-ink-muted">sobre canvas {contrast(valor, COLOR.canvas).toFixed(2)}:1</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografía">
        <p className="font-display font-extrabold uppercase text-[2.5rem] leading-none">Clase reservada</p>
        <p className="font-display font-extrabold uppercase text-[1.75rem] mt-3">Reserva tu clase</p>
        <p className="font-display font-semibold text-[1.25rem] mt-3">Martes 24 · 18:00</p>
        <p className="text-[1.0625rem] mt-3">Te quedan 5 clases en tu paquete, vence el 18 de octubre.</p>
        <p className="text-[0.9375rem] mt-2">Puedes cancelar sin costo hasta 12 horas antes de tu clase.</p>
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted mt-2">Por verificar</p>
        <p className="nums text-[0.9375rem] font-semibold mt-2">07:00 · 08:00 · 18:00 · $1,760 · $920</p>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap gap-3">
          <PrimaryButton>Reservar</PrimaryButton>
          <PrimaryButton variant="accent">Comprar paquete</PrimaryButton>
          <GhostButton>Ver mis clases</GhostButton>
          <PrimaryButton disabled>Sin lugares</PrimaryButton>
          <Button>Panel · primary</Button>
          <Button disabled>Panel · deshabilitado</Button>
          <Button variant="outline">Panel · outline</Button>
          <Button variant="destructive">Panel · destructive</Button>
        </div>
      </Section>

      <Section title="Pills y estados">
        <div className="flex flex-wrap gap-2">
          <Tag tint="accent" variant="solid">4 lugares</Tag>
          <Tag tint="accent">Últimos 2</Tag>
          <Tag tint="ink" variant="solid">Llena</Tag>
          {TONES.map((t) => <StatusPill key={t} label={`tono ${t}`} tone={t} />)}
          <Badge variant="attention">3 por verificar</Badge>
          <Badge variant="success">Pagado</Badge>
        </div>
        <div className="mt-4"><InfoBanner title="Tu paquete vence en 3 días" description="Renueva para no perder tu lugar." /></div>
      </Section>

      <Section title="Listas y cifras">
        <SegmentedTabs options={[{ value: "a", label: "Próximas" }, { value: "b", label: "Pasadas" }]} value="a" onChange={() => {}} />
        <div className="mt-4"><ListGroup>
          <ListRow title="Reformer · Ana" description="Martes 24 · 07:00" icon={<CalendarDays size={17} />} to="/sistema" />
          <ListRow title="Cerrar sesión" destructive onClick={() => {}} />
        </ListGroup></div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <Stat value="12" label="Clases hoy" />
          <Stat value="3" label="Por verificar" tint="accent" />
          <Stat value="87%" label="Ocupación" />
        </div>
      </Section>

      <Section title="Panel · tarjetas de cifra">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FigureCard label="Clases hoy" value="12" />
          <FigureCard label="Por verificar" value="3" hint="Transferencias sin revisar" attention />
          <FigureCard label="Ocupación" value="87%" />
          <FigureCard label="Ingresos del mes" value="$48,200" />
        </div>
      </Section>

      <Section title="Campos">
        <div className="grid gap-3 max-w-md">
          <Field label="Nombre" defaultValue="Mariana Ruiz" />
          <Field label="Correo" defaultValue="mariana@" error="Falta el dominio del correo." />
        </div>
      </Section>

      <Section title="Estados">
        <EmptyState title="Aún no tienes clases" description="Cuando reserves, aparecen aquí." ctaLabel="Reservar" ctaTo="/sistema" />
        <ErrorState onRetry={() => {}} />
        <div className="grid gap-2"><SkeletonRow /><SkeletonRow height={40} /></div>
      </Section>
    </div>
  );
}
