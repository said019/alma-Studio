import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { EmptyState, ErrorState } from "@/components/app/AppShell";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, MoreHorizontal } from "lucide-react";

const STATUS_OPTIONS = ["active", "pending_payment", "pending_activation", "expired", "cancelled"] as const;
type MembershipStatus = (typeof STATUS_OPTIONS)[number];

const STATUS_LABELS: Record<MembershipStatus, string> = {
  active: "Activa",
  pending_payment: "Pendiente pago",
  pending_activation: "Pendiente activación",
  expired: "Expirada",
  cancelled: "Cancelada",
};

const STATUS_VARIANTS: Record<MembershipStatus, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  pending_payment: "outline",
  pending_activation: "outline",
  expired: "secondary",
  cancelled: "destructive",
};

// Taxonomía única de categorías (sin color-coding: solo texto).
const CATEGORY_LABELS: Record<string, string> = {
  studio: "Studio",
  reformer_tower: "Reformer/Tower",
  mixto: "Mixto",
};

interface Membership {
  id: string;
  userId: string;
  userName?: string;
  planId: string;
  planName?: string;
  classCategory?: string;
  status: MembershipStatus;
  paymentMethod?: string;
  startDate?: string;
  endDate?: string;
  classesRemaining?: number | null;
  classLimit?: number | null;
}

// Misma regla que ClientDetail: null/9999+ significa ilimitado (∞).
function formatRemaining(m: Membership): string {
  if (m.classesRemaining == null) return m.classLimit == null ? "∞" : "—";
  if (Number(m.classesRemaining) >= 9999) return "∞";
  return m.classLimit ? `${m.classesRemaining} / ${m.classLimit}` : String(m.classesRemaining);
}

const MembershipTable = ({
  status,
  emptyTitle,
  emptyDescription,
}: {
  status?: string;
  emptyTitle: string;
  emptyDescription: string;
}) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const url = status ? `/memberships?status=${status}` : "/memberships";
  const { data, isLoading, isError, refetch } = useQuery<{ data: Membership[] }>({
    queryKey: ["memberships", status],
    queryFn: async () => (await api.get(url)).data,
  });
  const memberships = Array.isArray(data?.data) ? data.data : [];

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.put(`/memberships/${id}/activate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memberships"] }); toast({ title: "Membresía activada" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al activar la membresía", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.put(`/memberships/${id}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memberships"] }); toast({ title: "Membresía cancelada" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al cancelar la membresía", variant: "destructive" }),
  });

  const requestActivate = async (m: Membership) => {
    const who = m.userName ?? "La clienta";
    const ok = await confirm({
      title: "¿Activar esta membresía?",
      description: `${who} podrá reservar de inmediato y se le avisa por correo y WhatsApp.`,
      confirmLabel: "Activar",
    });
    if (ok) activateMutation.mutate(m.id);
  };

  const requestCancel = async (m: Membership) => {
    const who = m.userName ?? "la clienta";
    const ok = await confirm({
      title: "¿Cancelar esta membresía?",
      description: `Se cancelan las reservas futuras de ${who} con este plan y pierde el acceso. Los créditos restantes no se devuelven.`,
      confirmLabel: "Cancelar membresía",
      cancelLabel: "Volver",
      destructive: true,
    });
    if (ok) cancelMutation.mutate(m.id);
  };

  if (isError) {
    return (
      <ErrorState
        description="No pudimos cargar las membresías. Revisa tu conexión y vuelve a intentarlo."
        onRetry={() => refetch()}
      />
    );
  }

  if (!isLoading && memberships.length === 0) {
    return (
      <div className="rounded-xl border border-alma-hairline bg-alma-mist px-6">
        <EmptyState
          icon={<CreditCard size={20} strokeWidth={1.8} />}
          title={emptyTitle}
          description={emptyDescription}
        />
      </div>
    );
  }

  return (
    <div>
      {dialog}
      <div className="rounded-xl border border-alma-hairline bg-alma-mist overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Clases</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array(4).fill(0).map((_, i) => (
                <TableRow key={i}>{Array(6).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
              : memberships.map((m) => {
                const cat = m.classCategory ?? "";
                const catLabel = cat && cat !== "all" ? (CATEGORY_LABELS[cat] ?? cat) : null;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium text-alma-ink">{m.userName ?? m.userId}</TableCell>
                    <TableCell>
                      <div className="flex items-baseline gap-2">
                        <span className="text-alma-ink">{m.planName ?? m.planId}</span>
                        {catLabel && (
                          <span className="text-xs text-alma-ink/55">{catLabel}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[m.status]}>{STATUS_LABELS[m.status]}</Badge>
                    </TableCell>
                    <TableCell className="nums text-sm text-alma-ink/70">
                      {m.endDate ? formatDate(m.endDate) : "—"}
                    </TableCell>
                    <TableCell className="nums text-alma-ink">{formatRemaining(m)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {m.status !== "active" && (
                            <DropdownMenuItem onClick={() => requestActivate(m)}>Activar</DropdownMenuItem>
                          )}
                          {m.status !== "cancelled" && (
                            <DropdownMenuItem className="text-destructive" onClick={() => requestCancel(m)}>Cancelar</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            }
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

const MembershipsList = () => {
  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <h1 className="admin-title font-semibold text-alma-ink">Membresías</h1>
          </div>

          <Tabs defaultValue="all">
            <TabsList className="mb-6">
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="active">Activas</TabsTrigger>
              <TabsTrigger value="expiring">Por vencer</TabsTrigger>
              <TabsTrigger value="pending">Pendientes</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <MembershipTable
                emptyTitle="Aún no hay membresías"
                emptyDescription="Cuando una clienta compre un plan, su membresía aparece aquí para activarla y darle seguimiento."
              />
            </TabsContent>
            <TabsContent value="active">
              <MembershipTable
                status="active"
                emptyTitle="No hay membresías activas"
                emptyDescription="Activa las que están pendientes de pago o vende un plan para ver movimiento aquí."
              />
            </TabsContent>
            <TabsContent value="expiring">
              <MembershipTable
                status="expiring"
                emptyTitle="Nada por vencer"
                emptyDescription="Ninguna membresía vence en los próximos 7 días."
              />
            </TabsContent>
            <TabsContent value="pending">
              <MembershipTable
                status="pending_payment"
                emptyTitle="Sin pendientes de pago"
                emptyDescription="Cuando una clienta aparte un plan sin pagar, aparecerá aquí para activarla al recibir el pago."
              />
            </TabsContent>
          </Tabs>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default MembershipsList;
