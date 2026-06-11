import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState, EmptyState } from "@/components/app/AppShell";
import { formatDateTime } from "@/lib/format";
import { MessageSquare, MoreHorizontal, Pencil, Plus, Star, Tag, X } from "lucide-react";

const tagSchema = z.object({ name: z.string().min(1), color: z.string().default("#6E5A46") });
type TagFormData = z.infer<typeof tagSchema>;
interface ReviewTag extends TagFormData { id: string }

const ReviewTagsManager = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ReviewTag | null>(null);

  const { data, isError, refetch } = useQuery<{ data: ReviewTag[] }>({ queryKey: ["review-tags"], queryFn: async () => (await api.get("/review-tags")).data });
  const tags = Array.isArray(data?.data) ? data.data : [];

  const form = useForm<TagFormData>({ resolver: zodResolver(tagSchema), defaultValues: { color: "#6E5A46" } });

  const createMutation = useMutation({ mutationFn: (d: TagFormData) => api.post("/review-tags", d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-tags"] }); toast({ title: "Tag creado" }); setOpen(false); } });
  const updateMutation = useMutation({ mutationFn: ({ id, ...d }: ReviewTag) => api.put(`/review-tags/${id}`, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-tags"] }); toast({ title: "Tag actualizado" }); setOpen(false); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.delete(`/review-tags/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-tags"] }); toast({ title: "Tag eliminado" }); } });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h2 className="text-lg font-semibold text-alma-ink">Tags de reseñas</h2>
        <Button size="sm" onClick={() => { form.reset({ color: "#6E5A46" }); setEditing(null); setOpen(true); }}><Plus size={14} className="mr-1" />Nuevo tag</Button>
      </div>
      {isError ? (
        <ErrorState
          title="No pudimos cargar los tags"
          onRetry={() => refetch()}
        />
      ) : tags.length === 0 ? (
        <EmptyState
          icon={<Tag size={20} />}
          title="Aún no hay tags"
          description="Sirven para clasificar reseñas (limpieza, instructoras, equipo) y detectar patrones."
          ctaLabel="Nuevo tag"
          onCta={() => { form.reset({ color: "#6E5A46" }); setEditing(null); setOpen(true); }}
        />
      ) : (
        <div className="flex flex-wrap gap-2 mb-4">
          {tags.map((t) => (
            <div key={t.id} className="flex items-center gap-1">
              <Badge style={{ backgroundColor: `${t.color}22`, color: t.color, borderColor: `${t.color}44` }} variant="outline">{t.name}</Badge>
              <Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Editar tag ${t.name}`} onClick={() => { form.reset(t); setEditing(t); setOpen(true); }}>
                <Pencil size={11} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-destructive"
                aria-label={`Eliminar tag ${t.name}`}
                onClick={async () => {
                  const ok = await confirm({
                    title: `¿Eliminar el tag "${t.name}"?`,
                    description: "Se quita de todas las reseñas que lo usan. Las reseñas no se borran.",
                    confirmLabel: "Eliminar",
                    destructive: true,
                  });
                  if (ok) deleteMutation.mutate(t.id);
                }}
              >
                <X size={11} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{editing ? "Editar tag" : "Nuevo tag"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => editing ? updateMutation.mutate({ ...d, id: editing.id }) : createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1"><Label>Nombre</Label><Input {...form.register("name")} /></div>
            <div className="space-y-1"><Label>Color</Label><Input type="color" {...form.register("color")} className="h-10 cursor-pointer" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">{editing ? "Actualizar" : "Crear"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
};

interface AdminReview {
  id: string;
  user_name?: string;
  user_id?: string;
  email?: string;
  instructor_name?: string;
  instructor_id?: string;
  class_type_name?: string;
  class_date?: string;
  class_start_time?: string;
  rating?: number;
  overall_rating?: number;
  comment?: string;
  is_approved?: boolean;
  created_at?: string;
}

/* Stat compacto sobre hairline superior (mismo lenguaje que Reportes) */
const StripStat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="border-t border-alma-hairline pb-1 pt-2.5">
    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-alma-ink/60">{label}</p>
    <p className="font-display nums mt-1.5 leading-none text-alma-ink" style={{ fontSize: "1.5rem" }}>{value}</p>
  </div>
);

const AdminReviewsDashboard = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data: reviewsData, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: async () => (await api.get("/admin/reviews")).data,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/admin/reviews/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      toast({ title: "Reseña aprobada" });
    },
    onError: () => toast({ title: "No se pudo aprobar la reseña", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/reviews/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      toast({ title: "Reseña eliminada" });
    },
    onError: () => toast({ title: "No se pudo eliminar la reseña", variant: "destructive" }),
  });

  const reviews: AdminReview[] = Array.isArray(reviewsData?.data) ? reviewsData.data : [];

  const stats = useMemo(() => {
    const ratings = reviews
      .map((r) => Number(r.rating ?? r.overall_rating ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    const average = ratings.length ? (ratings.reduce((acc, n) => acc + n, 0) / ratings.length).toFixed(1) : "—";
    const pending = reviews.filter((r) => !r.is_approved).length;
    return {
      total: reviews.length,
      average,
      pending,
    };
  }, [reviews]);

  const renderStars = (n: number) => Array(5).fill(0).map((_, i) => (
    <Star
      key={i}
      size={12}
      fill={i < n ? "currentColor" : "none"}
      className={i < n ? "text-alma-berry" : "text-alma-ink/25"}
    />
  ));

  const renderClassLabel = (r: AdminReview) => {
    const classLabel = r.class_type_name || "Clase";
    if (!r.class_date) return classLabel;
    const date = new Date(r.class_date);
    const dateLabel = Number.isNaN(date.getTime()) ? r.class_date : date.toLocaleDateString("es-MX");
    const timeLabel = r.class_start_time ? String(r.class_start_time).slice(0, 5) : "";
    return `${classLabel} · ${dateLabel}${timeLabel ? ` ${timeLabel}` : ""}`;
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          <h1 className="admin-title font-display leading-none text-alma-ink mb-6">Reseñas</h1>

          {!isError && (
            <div className="mb-8 grid max-w-lg grid-cols-3 gap-x-6">
              <StripStat label="Total" value={stats.total} />
              <StripStat
                label="Promedio"
                value={
                  <span className="inline-flex items-center gap-1">
                    {stats.average}
                    <Star size={14} className="text-alma-berry" fill="currentColor" strokeWidth={0} />
                  </span>
                }
              />
              <StripStat label="Pendientes" value={stats.pending} />
            </div>
          )}

          <Tabs defaultValue="list">
            <TabsList>
              <TabsTrigger value="list">Reseñas</TabsTrigger>
              <TabsTrigger value="tags">Tags</TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="mt-4">
              {isError ? (
                <ErrorState
                  title="No pudimos cargar las reseñas"
                  onRetry={() => refetch()}
                />
              ) : isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : reviews.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare size={20} />}
                  title="Aún no hay reseñas"
                  description="Cuando las alumnas califiquen sus clases, aquí las apruebas antes de publicarlas."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clienta</TableHead>
                      <TableHead>Clase</TableHead>
                      <TableHead>Instructora</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Estatus</TableHead>
                      <TableHead>Comentario</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="w-[56px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviews.map((r) => {
                      const numericRating = Number(r.rating ?? r.overall_rating ?? 0);
                      const safeRating = Number.isFinite(numericRating) && numericRating > 0
                        ? Math.max(1, Math.min(5, Math.round(numericRating)))
                        : null;

                      return (
                        <TableRow key={r.id}>
                          <TableCell>{r.user_name || r.email || r.user_id || "—"}</TableCell>
                          <TableCell className="nums">{renderClassLabel(r)}</TableCell>
                          <TableCell>{r.instructor_name || r.instructor_id || "—"}</TableCell>
                          <TableCell>
                            {safeRating ? <div className="flex">{renderStars(safeRating)}</div> : "—"}
                          </TableCell>
                          <TableCell>
                            {r.is_approved ? (
                              <Badge variant="outline" className="border-alma-olive/40 bg-alma-olive/10 text-alma-olive">Aprobada</Badge>
                            ) : (
                              <Badge variant="outline" className="border-alma-sandstone bg-alma-oat/60 text-alma-berry">Pendiente</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-xs truncate">{r.comment || "—"}</TableCell>
                          <TableCell className="nums text-sm">
                            {r.created_at ? formatDateTime(r.created_at) : "—"}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal size={16} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {!r.is_approved && (
                                  <DropdownMenuItem onClick={() => approveMutation.mutate(r.id)}>
                                    Aprobar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: "¿Eliminar esta reseña?",
                                      description: "Se borra de forma permanente y deja de contar para el promedio del studio.",
                                      confirmLabel: "Eliminar",
                                      destructive: true,
                                    });
                                    if (ok) deleteMutation.mutate(r.id);
                                  }}
                                >
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            <TabsContent value="tags" className="mt-4"><ReviewTagsManager /></TabsContent>
          </Tabs>
        </div>
        {dialog}
      </AdminLayout>
    </AuthGuard>
  );
};

export default AdminReviewsDashboard;
