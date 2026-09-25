import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import StatusDot from "@/components/admin/StatusDot";
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

  const renderCategoryBadge = (t: ClassType) => {
    const label = categoryLabel(t.category);
    return label === "Sin categoría" ? (
      <Badge variant="outline" className="border-line text-ink/50">Sin categoría</Badge>
    ) : (
      <Badge variant="outline" className="border-line-strong/60 bg-sunken text-ink">{label}</Badge>
    );
  };

  const typeForm = (
    <form
      onSubmit={form.handleSubmit((d) =>
        editing ? updateMutation.mutate({ ...d, id: editing.id }) : createMutation.mutate(d)
      )}
      className="space-y-4"
    >
      <div className="space-y-1"><Label htmlFor="type-name">Nombre</Label><Input id="type-name" {...form.register("name")} /></div>
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
                    "h-11 w-11 rounded-full ring-1 ring-line transition-all",
                    selected ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-canvas" : "opacity-80 hover:opacity-100",
                  )}
                  style={{ backgroundColor: c.value }}
                />
                <span className={cn("text-[0.75rem]", selected ? "font-semibold text-ink" : "text-ink/55")}>
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
  );

  return (
    <AuthGuard>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader
            kicker="Clases"
            title="Tipos de clase"
            subtitle={`${types.length === 1 ? "1 tipo registrado" : `${types.length} tipos registrados`} · color y categoría que ven las clientas.`}
            actions={
              <>
                <SectionTabs aria-label="Secciones de Clases" tabs={CLASSES_SECTION_TABS} />
                <Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Nuevo tipo</Button>
              </>
            }
          />

          {typesQuery.isError ? (
            <ErrorState
              description="No pudimos cargar los tipos de clase. Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => typesQuery.refetch()}
            />
          ) : isMobile ? (
            // Celular: el formulario siempre es el Dialog de abajo (no hay
            // aside), así que el vacío no necesita nada especial aquí.
            !isLoading && types.length === 0 ? (
              <EmptyState
                icon={<Palette size={20} strokeWidth={1.8} />}
                title="Aún no hay tipos de clase"
                description="Crea el primer tipo (por ejemplo Reformer o Mat) para poder programar clases en el calendario."
                ctaLabel="Nuevo tipo"
                onCta={openCreate}
              />
            ) : (
              <div className="space-y-2">
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
                  : types.map((t) => {
                      const color = resolveClassColor(t.color);
                      return (
                        <div key={t.id} className="rounded-xl border border-line bg-sunken p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-line" style={{ backgroundColor: color }} />
                                <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {renderCategoryBadge(t)}
                                <Badge variant="outline" className="nums border-line text-ink/70">
                                  {(t.defaultDuration ?? t.durationMin ?? "?") + " min"}
                                </Badge>
                                <Badge variant="outline" className="nums border-line text-ink/70">
                                  {(t.maxCapacity ?? t.capacity ?? "?") + " cupos"}
                                </Badge>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px] min-w-[44px]" aria-label={`Acciones de ${t.name}`}>
                                  <MoreHorizontal size={14} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => openEdit(t)}>Editar</DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(t)}>Eliminar</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="mt-2">
                            {t.isActive !== false ? <StatusDot tone="success">Activo</StatusDot> : <StatusDot tone="muted">Inactivo</StatusDot>}
                          </div>
                        </div>
                      );
                    })}
              </div>
            )
          ) : (
            // Escritorio: el vacío y la tabla comparten el mismo layout de
            // dos columnas, para que "Nuevo tipo" abra el formulario a un
            // lado también con el catálogo vacío (I2) — antes el <aside>
            // sólo vivía en la rama de la tabla, así que con 0 tipos no
            // había dónde mostrarlo.
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              {!isLoading && types.length === 0 ? (
                <EmptyState
                  icon={<Palette size={20} strokeWidth={1.8} />}
                  title="Aún no hay tipos de clase"
                  description="Crea el primer tipo (por ejemplo Reformer o Mat) para poder programar clases en el calendario."
                  ctaLabel="Nuevo tipo"
                  onCta={openCreate}
                />
              ) : (
                <Panel className="overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
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
                              {Array.from({ length: 6 }).map((_, j) => (
                                <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                              ))}
                            </TableRow>
                          ))
                        : types.map((t) => (
                            <TableRow key={t.id}>
                              <TableCell>
                                <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[0.75rem] font-extrabold">
                                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: resolveClassColor(t.color) }} />
                                  {t.name}
                                </span>
                              </TableCell>
                              <TableCell>{renderCategoryBadge(t)}</TableCell>
                              <TableCell className="nums text-ink/70">{(t.defaultDuration ?? t.durationMin ?? "?") + " min"}</TableCell>
                              <TableCell className="nums text-ink/70">{t.maxCapacity ?? t.capacity ?? "?"} lugares</TableCell>
                              <TableCell>
                                {t.isActive !== false ? <StatusDot tone="success">Activo</StatusDot> : <StatusDot tone="muted">Inactivo</StatusDot>}
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" aria-label={`Acciones de ${t.name}`}><MoreHorizontal size={14} /></Button>
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
                </Panel>
              )}
              {open && (
                <aside
                  aria-label={editing ? "Editar tipo" : "Nuevo tipo de clase"}
                  className="rounded-2xl border border-line bg-surface p-6"
                >
                  <h2 className="mb-4 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">
                    {editing ? "Editar tipo" : "Nuevo tipo de clase"}
                  </h2>
                  {typeForm}
                </aside>
              )}
            </div>
          )}
        </AdminPage>

        {/* CRUD dialog: sólo celular */}
        <Dialog open={open && isMobile} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing ? "Editar tipo" : "Nuevo tipo de clase"}</DialogTitle></DialogHeader>
            {typeForm}
          </DialogContent>
        </Dialog>

        {dialog}
      </AdminLayout>
    </AuthGuard>
  );
};

export default ClassTypesList;
