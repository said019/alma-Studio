import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState, EmptyState } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Plus, Palette, Loader2 } from "lucide-react";
import {
  CLASS_PALETTE,
  DEFAULT_CLASS_COLOR,
  resolveClassColor,
  CATEGORY_OPTIONS,
  normalizeCategory,
  categoryLabel,
  CLASSES_SECTION_TABS,
  type ClassCategory,
} from "./palette";

const typeSchema = z.object({
  name: z.string().min(1),
  color: z.string().default(DEFAULT_CLASS_COLOR),
  category: z.enum(["studio", "reformer_tower", "mixto"]).default("studio"),
  defaultDuration: z.coerce.number().min(1),
  maxCapacity: z.coerce.number().min(1),
  isActive: z.boolean().default(true),
});

type TypeFormData = z.infer<typeof typeSchema>;
interface ClassType {
  id: string;
  name: string;
  color: string;
  category?: string;
  defaultDuration?: number;
  durationMin?: number;
  maxCapacity?: number;
  capacity?: number;
  isActive?: boolean;
}

const ClassTypesList = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassType | null>(null);

  const typesQuery = useQuery<{ data: ClassType[] }>({
    queryKey: ["class-types"],
    queryFn: async () => (await api.get("/class-types")).data,
  });
  const types = Array.isArray(typesQuery.data?.data) ? typesQuery.data.data : [];
  const isLoading = typesQuery.isLoading;

  const form = useForm<TypeFormData>({
    resolver: zodResolver(typeSchema),
    defaultValues: { color: DEFAULT_CLASS_COLOR, category: "studio", defaultDuration: 50, maxCapacity: 5, isActive: true },
  });

  const createMutation = useMutation({
    mutationFn: (d: TypeFormData) => api.post("/class-types", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-types"] });
      toast({ title: "Tipo creado" });
      setOpen(false);
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? "No se pudo crear el tipo",
      variant: "destructive",
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: TypeFormData & { id: string }) => api.put(`/class-types/${id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-types"] });
      toast({ title: "Tipo actualizado" });
      setOpen(false);
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? "No se pudo actualizar el tipo",
      variant: "destructive",
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/class-types/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-types"] });
      toast({ title: "Tipo eliminado" });
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? "No se pudo eliminar el tipo",
      variant: "destructive",
    }),
  });

  const handleDelete = async (t: ClassType) => {
    const ok = await confirm({
      title: `¿Eliminar el tipo "${t.name}"?`,
      description: "Se eliminará del catálogo de tipos de clase. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar tipo",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(t.id);
  };

  const openEdit = (t: ClassType) => {
    form.reset({
      name: t.name,
      // Colores legacy se migran a la paleta al guardar.
      color: resolveClassColor(t.color),
      category: (normalizeCategory(t.category) ?? "studio") as ClassCategory,
      defaultDuration: t.defaultDuration ?? t.durationMin ?? 50,
      maxCapacity: t.maxCapacity ?? t.capacity ?? 5,
      isActive: t.isActive ?? true,
    });
    setEditing(t);
    setOpen(true);
  };

  const openCreate = () => {
    form.reset({ color: DEFAULT_CLASS_COLOR, category: "studio", defaultDuration: 50, maxCapacity: 5, isActive: true });
    setEditing(null);
    setOpen(true);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const renderStatusBadge = (t: ClassType) => (
    t.isActive !== false ? (
      <Badge className="border border-alma-sandstone/50 bg-alma-oat/60 text-alma-ink hover:bg-alma-oat/60">Activo</Badge>
    ) : (
      <Badge variant="outline" className="border-alma-hairline text-alma-ink/50">Inactivo</Badge>
    )
  );

  const renderCategoryBadge = (t: ClassType) => {
    const label = categoryLabel(t.category);
    return label === "Sin categoría" ? (
      <Badge variant="outline" className="border-alma-hairline text-alma-ink/50">Sin categoría</Badge>
    ) : (
      <Badge variant="outline" className="border-alma-sandstone/60 bg-alma-mist text-alma-berry">{label}</Badge>
    );
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-4xl">
          <SectionTabs tabs={CLASSES_SECTION_TABS} />
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="admin-title text-alma-ink">Tipos de clase</h1>
              <p className="mt-1 text-sm text-alma-ink/55">
                {types.length === 1 ? "1 tipo registrado" : `${types.length} tipos registrados`} · color y categoría que ven las clientas.
              </p>
            </div>
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1" />Nuevo tipo</Button>
          </div>

          {typesQuery.isError ? (
            <ErrorState
              description="No pudimos cargar los tipos de clase. Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => typesQuery.refetch()}
            />
          ) : !isLoading && types.length === 0 ? (
            <EmptyState
              icon={<Palette size={20} strokeWidth={1.8} />}
              title="Aún no hay tipos de clase"
              description="Crea el primer tipo (por ejemplo Reformer o Mat) para poder programar clases en el calendario."
              ctaLabel="Nuevo tipo"
              onCta={openCreate}
            />
          ) : isMobile ? (
            <div className="space-y-2">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
                : types.map((t) => {
                    const color = resolveClassColor(t.color);
                    return (
                      <div key={t.id} className="rounded-xl border border-alma-hairline bg-alma-mist p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-alma-hairline" style={{ backgroundColor: color }} />
                              <p className="truncate text-sm font-semibold text-alma-ink">{t.name}</p>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {renderCategoryBadge(t)}
                              <Badge variant="outline" className="nums border-alma-hairline text-alma-ink/70">
                                {(t.defaultDuration ?? t.durationMin ?? "?") + " min"}
                              </Badge>
                              <Badge variant="outline" className="nums border-alma-hairline text-alma-ink/70">
                                {(t.maxCapacity ?? t.capacity ?? "?") + " cupos"}
                              </Badge>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px] min-w-[44px]">
                                <MoreHorizontal size={14} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => openEdit(t)}>Editar</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(t)}>Eliminar</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="mt-2">{renderStatusBadge(t)}</div>
                      </div>
                    );
                  })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-alma-hairline">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Color</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Capacidad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 7 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    : types.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>
                            <div
                              className="h-6 w-6 rounded-full ring-1 ring-alma-hairline"
                              style={{ backgroundColor: resolveClassColor(t.color) }}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-alma-ink">{t.name}</TableCell>
                          <TableCell>{renderCategoryBadge(t)}</TableCell>
                          <TableCell className="nums text-alma-ink/70">{(t.defaultDuration ?? t.durationMin ?? "?") + " min"}</TableCell>
                          <TableCell className="nums text-alma-ink/70">{t.maxCapacity ?? t.capacity ?? "?"}</TableCell>
                          <TableCell>{renderStatusBadge(t)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => openEdit(t)}>Editar</DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(t)}>Eliminar</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* CRUD dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing ? "Editar tipo" : "Nuevo tipo de clase"}</DialogTitle></DialogHeader>
            <form
              onSubmit={form.handleSubmit((d) =>
                editing ? updateMutation.mutate({ ...d, id: editing.id }) : createMutation.mutate(d)
              )}
              className="space-y-4"
            >
              <div className="space-y-1"><Label>Nombre</Label><Input {...form.register("name")} /></div>
              <div className="space-y-1">
                <Label>Categoría</Label>
                <Select
                  value={form.watch("category")}
                  onValueChange={(v) => form.setValue("category", v as ClassCategory)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-3">
                  {CLASS_PALETTE.map((c) => {
                    const selected = form.watch("color") === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => form.setValue("color", c.value)}
                        className="flex flex-col items-center gap-1"
                        title={c.label}
                        aria-pressed={selected}
                      >
                        <span
                          className={cn(
                            "h-8 w-8 rounded-full ring-1 ring-alma-hairline transition-all",
                            selected ? "scale-110 ring-2 ring-alma-ink ring-offset-2 ring-offset-alma-canvas" : "opacity-80 hover:opacity-100",
                          )}
                          style={{ backgroundColor: c.value }}
                        />
                        <span className={cn("text-[10px]", selected ? "font-semibold text-alma-ink" : "text-alma-ink/55")}>
                          {c.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Duración (min)</Label><Input type="number" className="nums" {...form.register("defaultDuration")} /></div>
                <div className="space-y-1"><Label>Capacidad máx.</Label><Input type="number" className="nums" {...form.register("maxCapacity")} /></div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} />
                <Label>Activo</Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
                  {editing ? "Actualizar" : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {dialog}
      </AdminLayout>
    </AuthGuard>
  );
};

export default ClassTypesList;
