import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/app/AppShell";
import { formatDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { AUDIT_ENTITY_OPTIONS, actionLabel, auditChanges, auditMetaLines, auditSubject, type AuditEntry, type AuditPage } from "@/lib/audit-log";

const LIMIT = 50;
const SELECT_CLS = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink focus:border-2 focus:border-ink focus:outline-none";

type Actor = { id: string; name: string | null; role: string | null };

/* Bitácora (auditoría 2026-09-27, P0-3): sólo la dueña. El guardia va por
   fuera para que recepción no dispare /admin/audit (403). */
export default function AuditLogPage() {
  return (
    <AuthGuard requiredRoles={["admin", "super_admin"]}>
      <AdminLayout>
        <AuditLogContent />
      </AdminLayout>
    </AuthGuard>
  );
}

function AuditLogContent() {
  const [sp, setSp] = useSearchParams();
  const que = sp.get("que") ?? "";
  const quien = sp.get("quien") ?? "";
  const desde = sp.get("desde") ?? "";
  const hasta = sp.get("hasta") ?? "";
  const entidad = sp.get("id") ?? "";
  const page = Math.max(1, Number(sp.get("pagina")) || 1);

  // Un solo cambio de URL por acción: varios setSearchParams seguidos se pisan.
  const update = (patch: Record<string, string | null>) =>
    setSp((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      return p;
    }, { replace: true });

  const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (que) qs.set("entityType", que);
  if (quien) qs.set("actorId", quien);
  if (desde) qs.set("from", desde);
  if (hasta) qs.set("to", hasta);
  if (entidad) qs.set("entityId", entidad);
  const url = `/admin/audit?${qs.toString()}`;

  const list = useQuery<AuditPage>({
    queryKey: ["audit-log", url],
    queryFn: async () => (await api.get(url)).data,
    placeholderData: keepPreviousData,
  });
  const actorsQ = useQuery<{ data: Actor[] }>({
    queryKey: ["audit-actors"],
    queryFn: async () => (await api.get("/admin/audit/actors")).data,
    staleTime: 60_000,
  });
  const actors = Array.isArray(actorsQ.data?.data) ? actorsQ.data!.data : [];
  const rows = Array.isArray(list.data?.data) ? list.data!.data : [];
  const total = Number(list.data?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const hasFilters = Boolean(que || quien || desde || hasta || entidad);
  const errorMsg = (list.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Sistema · sólo dueña"
        title="Bitácora"
        subtitle="Quién cobró, ajustó, canceló, corrigió o dio de baja, cuándo, por qué y qué cambió."
      />

      <Panel aria-label="Filtros de la bitácora" className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end lg:p-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bit-que">Qué</Label>
          <select id="bit-que" className={SELECT_CLS} value={que} onChange={(e) => update({ que: e.target.value || null, pagina: null })}>
            {AUDIT_ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bit-quien">Quién</Label>
          <select id="bit-quien" className={SELECT_CLS} value={quien} onChange={(e) => update({ quien: e.target.value || null, pagina: null })}>
            <option value="">Todo el equipo</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>{`${a.name ?? "Sin nombre"} · ${roleLabel(a.role)}`}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bit-desde">Desde</Label>
          <Input id="bit-desde" type="date" value={desde} onChange={(e) => update({ desde: e.target.value || null, pagina: null })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bit-hasta">Hasta</Label>
          <Input id="bit-hasta" type="date" value={hasta} onChange={(e) => update({ hasta: e.target.value || null, pagina: null })} />
        </div>
        <Button variant="ghost" disabled={!hasFilters} onClick={() => update({ que: null, quien: null, desde: null, hasta: null, id: null, pagina: null })}>
          Quitar filtros
        </Button>
      </Panel>

      {entidad && (
        <p className="text-sm text-ink-muted">
          Mostrando sólo lo relacionado con un registro.{" "}
          <button type="button" className="min-h-[44px] font-bold text-ink underline underline-offset-2" onClick={() => update({ id: null, pagina: null })}>
            Ver todo
          </button>
        </p>
      )}

      {list.isError ? (
        <ErrorState title="No pudimos cargar la bitácora" description={errorMsg ?? "Revisa tu conexión y vuelve a intentarlo."} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] w-full rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={20} strokeWidth={1.8} />}
          title="Sin movimientos"
          description={hasFilters ? "No hay registros con estos filtros." : "Cuando alguien del equipo cobre, ajuste, cancele, corrija una falta o dé de baja a una clienta, aparecerá aquí."}
        />
      ) : (
        <>
          <Panel className="overflow-hidden">
            <ol aria-label="Movimientos" className="divide-y divide-line">
              {rows.map((e) => <AuditRow key={e.id} entry={e} />)}
            </ol>
          </Panel>
          <nav aria-label="Páginas de la bitácora" className="flex flex-wrap items-center justify-between gap-3">
            <p className="nums text-sm text-ink-muted">Página {page} de {pages} · {total} {total === 1 ? "registro" : "registros"}</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => update({ pagina: page - 1 > 1 ? String(page - 1) : null })}>Anterior</Button>
              <Button variant="outline" disabled={page >= pages} onClick={() => update({ pagina: String(page + 1) })}>Siguiente</Button>
            </div>
          </nav>
        </>
      )}
    </AdminPage>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const changes = auditChanges(entry);
  const subject = auditSubject(entry);
  const metaLines = auditMetaLines(entry);
  return (
    <li className="flex flex-col gap-2 px-5 py-4 lg:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[15px] font-extrabold text-ink">{actionLabel(entry)}</p>
        <time dateTime={entry.createdAt} className="nums text-[13px] text-ink-muted">{formatDateTime(entry.createdAt)}</time>
      </div>
      <p className="text-sm text-ink-muted">
        <span className="font-bold text-ink">{entry.actorName ?? "Sistema"}</span>
        {entry.actorRole ? ` · ${roleLabel(entry.actorRole)}` : ""}
        {subject ? <> · sobre <span className="font-bold text-ink">{subject}</span></> : null}
      </p>
      {entry.reason && (
        <p className="text-sm text-ink"><span className="font-bold">Motivo:</span> {entry.reason}</p>
      )}
      {changes.length > 0 && (
        <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
          {changes.map((c) => (
            <div key={c.key} className="flex gap-2">
              <dt className="text-ink-muted">{c.label}:</dt>
              <dd className="nums font-bold text-ink">{c.before !== null ? `${c.before} → ${c.after}` : c.after}</dd>
            </div>
          ))}
        </dl>
      )}
      {metaLines.length > 0 && (
        <p className="nums text-[13px] text-ink-muted">{metaLines.join(" · ")}</p>
      )}
    </li>
  );
}
