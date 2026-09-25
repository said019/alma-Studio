import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { initials } from "@/components/admin/PersonCell";
import StatusDot from "@/components/admin/StatusDot";
import PersonasTabs from "../clients/PersonasTabs";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { EmptyState, ErrorState } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Copy, Loader2, MoreHorizontal, Plus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

const instructorSchema = z.object({
  displayName: z.string().min(1),
  email: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().email().optional()),
  bio: z.string().optional(),
  specialties: z.string().optional(),
  isActive: z.boolean().default(true),
  photoFocusX: z.coerce.number().min(0).max(100).default(50),
  photoFocusY: z.coerce.number().min(0).max(100).default(50),
});

type InstructorFormData = z.infer<typeof instructorSchema>;
interface Instructor extends Omit<InstructorFormData, "specialties"> {
  id: string;
  specialties?: string[] | string | null;
  photoUrl?: string;
  photoUrl_2?: string;
  photoFocusX?: number;
  photoFocusY?: number;
}

function clampFocus(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeSpecialties(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
    } catch (_) {
      // fallback to comma-separated text
    }
    return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function getFocusFromPointerEvent(event: React.PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const nextX = ((event.clientX - rect.left) / rect.width) * 100;
  const nextY = ((event.clientY - rect.top) / rect.height) * 100;
  return {
    x: clampFocus(nextX),
    y: clampFocus(nextY),
  };
}

const InstructorsList = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Instructor | null>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [uploadSlot, setUploadSlot] = useState<1 | 2>(1);
  const [magicLink, setMagicLink] = useState<{ name: string; link: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, refetch } = useQuery<{ data: Instructor[] }>({
    queryKey: ["instructors"],
    queryFn: async () => (await api.get("/instructors")).data,
  });
  const instructors = Array.isArray(data?.data) ? data.data : [];

  const form = useForm<InstructorFormData>({
    resolver: zodResolver(instructorSchema),
    defaultValues: { isActive: true, photoFocusX: 50, photoFocusY: 50 },
  });

  const createMutation = useMutation({
    mutationFn: (d: InstructorFormData) => api.post("/instructors", {
      ...d,
      specialties: d.specialties?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
      photoFocusX: clampFocus(d.photoFocusX),
      photoFocusY: clampFocus(d.photoFocusY),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: "Instructora creada" }); setOpen(false); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al crear", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; displayName: string; email?: string; bio?: string; specialties?: string; isActive: boolean; photoFocusX: number; photoFocusY: number }) => {
      const { id, specialties, ...rest } = payload;
      return api.put(`/instructors/${id}`, {
        ...rest,
        specialties: specialties ? specialties.split(",").map((s) => s.trim()).filter(Boolean) : [],
        photoFocusX: clampFocus(rest.photoFocusX),
        photoFocusY: clampFocus(rest.photoFocusY),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: "Instructora actualizada" }); setOpen(false); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/instructors/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: "Instructora eliminada" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al eliminar", variant: "destructive" }),
  });

  const copyMagicLink = (link: string) => {
    navigator.clipboard?.writeText(link).then(
      () => toast({ title: "Magic link copiado al portapapeles" }),
      () => toast({ title: "No se pudo copiar", description: "Copia el link manualmente desde el recuadro.", variant: "destructive" }),
    );
  };

  const magicLinkMutation = useMutation({
    mutationFn: async (ins: Instructor) => {
      const res = await api.post(`/instructors/${ins.id}/magic-link`);
      return { link: res.data?.data?.link as string | undefined, name: ins.displayName };
    },
    onSuccess: ({ link, name }) => {
      if (!link) {
        toast({ title: "Error al generar link", variant: "destructive" });
        return;
      }
      setMagicLink({ link, name });
      copyMagicLink(link);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al generar link", variant: "destructive" }),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: ({ id, file, slot = 1 }: { id: string; file: File; slot?: 1 | 2 }) => {
      const fd = new FormData();
      fd.append("photo", file);
      return api.post(`/instructors/${id}/photo${slot === 2 ? "?slot=2" : ""}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: vars.slot === 2 ? "2ª foto actualizada" : "Foto actualizada" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al subir foto", variant: "destructive" }),
  });

  const openEdit = (i: Instructor) => {
    form.reset({
      ...i,
      specialties: normalizeSpecialties(i.specialties).join(", "),
      photoFocusX: clampFocus(i.photoFocusX),
      photoFocusY: clampFocus(i.photoFocusY),
    });
    setEditing(i);
    setOpen(true);
  };

  const openCreate = () => {
    form.reset({ isActive: true, photoFocusX: 50, photoFocusY: 50 });
    setEditing(null);
    setOpen(true);
  };

  const handleDelete = async (ins: Instructor) => {
    const ok = await confirm({
      title: `¿Eliminar a ${ins.displayName}?`,
      description: "Su perfil se borra definitivamente (foto, bio y especialidades) y dejará de aparecer al programar clases. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(ins.id);
  };

  const focusX = clampFocus(form.watch("photoFocusX"));
  const focusY = clampFocus(form.watch("photoFocusY"));
  const applyPreviewFocus = (event: React.PointerEvent<HTMLElement>) => {
    const next = getFocusFromPointerEvent(event);
    form.setValue("photoFocusX", next.x, { shouldDirty: true, shouldTouch: true });
    form.setValue("photoFocusY", next.y, { shouldDirty: true, shouldTouch: true });
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader
            kicker="Personas"
            title="Coaches"
            actions={
              <>
                <PersonasTabs />
                <Button onClick={openCreate}>
                  <Plus size={16} aria-hidden="true" />
                  Nueva coach
                </Button>
              </>
            }
          />

          {magicLink && (
            <div className="rounded-2xl border border-line bg-surface px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink/60">
                    Magic link · {magicLink.name}
                  </p>
                  <p className="mt-1 break-all text-xs text-ink/80">{magicLink.link}</p>
                  <p className="mt-1 text-[11px] text-ink/55">Caduca en 24 horas. Compártelo solo con ella.</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => copyMagicLink(magicLink.link)}>
                    <Copy size={12} className="mr-1.5" /> Copiar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-ink/55 hover:text-ink"
                    onClick={() => setMagicLink(null)}
                    aria-label="Ocultar magic link"
                  >
                    <X size={14} />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileRef}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && uploadTargetId) uploadPhotoMutation.mutate({ id: uploadTargetId, file: f, slot: uploadSlot });
              e.target.value = "";
              setUploadTargetId(null);
              setUploadSlot(1);
            }}
          />

          {isError ? (
            <ErrorState
              description="No pudimos cargar a las instructoras. Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetch()}
            />
          ) : !isLoading && instructors.length === 0 ? (
            <EmptyState
              icon={<Users size={20} strokeWidth={1.8} />}
              title="Crea tu primera instructora"
              description="Su perfil con foto y especialidades aparece al programar clases y en la página del estudio."
              ctaLabel="Nueva instructora"
              onCta={openCreate}
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[300px] rounded-2xl" />)
                : instructors.map((ins: Instructor) => {
                    const specs = normalizeSpecialties(ins.specialties);
                    return (
                      <article key={ins.id} className={cn("overflow-hidden rounded-2xl border border-line bg-surface", ins.isActive === false && "opacity-70")}>
                        <div className="relative h-[200px] bg-sunken">
                          {ins.photoUrl ? (
                            <img src={ins.photoUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${clampFocus(ins.photoFocusX)}% ${clampFocus(ins.photoFocusY)}%` }} />
                          ) : (
                            <span aria-hidden="true" className="grid h-full place-items-center font-display text-[2.75rem] font-extrabold text-line-strong">
                              {initials(ins.displayName)}
                            </span>
                          )}
                          <div className="absolute right-2 top-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" className="bg-surface" aria-label={`Acciones de ${ins.displayName}`}>
                                  <MoreHorizontal size={18} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(ins)}>Editar</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setUploadSlot(1); setUploadTargetId(ins.id); setTimeout(() => fileRef.current?.click(), 0); }}>Subir foto principal</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setUploadSlot(2); setUploadTargetId(ins.id); setTimeout(() => fileRef.current?.click(), 0); }}>Subir 2ª foto (hover)</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => magicLinkMutation.mutate(ins)}>Magic link</DropdownMenuItem>
                                <DropdownMenuItem className="text-danger focus:text-danger" onClick={() => handleDelete(ins)}>Eliminar</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2.5 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <h2 className="truncate text-base font-extrabold">{ins.displayName}</h2>
                            {ins.isActive === false ? <StatusDot tone="muted">Inactiva</StatusDot> : <StatusDot tone="success">Activa</StatusDot>}
                          </div>
                          <p className="truncate text-[13px] text-ink-muted">{ins.email || "Sin email"}</p>
                          <div className="flex min-h-[24px] flex-wrap gap-1.5">
                            {specs.map((s) => <span key={s} className="rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] font-extrabold">{s}</span>)}
                          </div>
                        </div>
                      </article>
                    );
                  })}
            </div>
          )}
        </AdminPage>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar instructora" : "Nueva instructora"}</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit((d) => editing
              ? updateMutation.mutate({
                id: editing.id,
                displayName: d.displayName,
                email: d.email,
                bio: d.bio,
                specialties: d.specialties,
                isActive: d.isActive,
                photoFocusX: d.photoFocusX,
                photoFocusY: d.photoFocusY,
              })
              : createMutation.mutate(d))} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1"><Label>Nombre</Label><Input {...form.register("displayName")} /></div>
                <div className="space-y-1"><Label>Email <span className="text-ink/40 font-normal">(opcional)</span></Label><Input type="email" {...form.register("email")} /></div>
                <div className="space-y-1"><Label>Bio</Label><Input {...form.register("bio")} /></div>
                <div className="space-y-1"><Label>Especialidades (separadas por coma)</Label><Input {...form.register("specialties")} /></div>
              </div>

              <div className={editing?.photoUrl ? "grid gap-5 sm:grid-cols-[minmax(0,1fr)_300px]" : "space-y-4"}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Enfoque horizontal</Label>
                      <span className="nums text-xs text-ink/60">{focusX}%</span>
                    </div>
                    <Input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={focusX}
                      onChange={(e) => form.setValue("photoFocusX", Number(e.target.value), { shouldDirty: true })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Enfoque vertical</Label>
                      <span className="nums text-xs text-ink/60">{focusY}%</span>
                    </div>
                    <Input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={focusY}
                      onChange={(e) => form.setValue("photoFocusY", Number(e.target.value), { shouldDirty: true })}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} />
                    <Label>Activa</Label>
                  </div>
                </div>

                {editing?.photoUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Vista previa y enfoque</Label>
                      <span className="text-[11px] text-ink/55">Haz clic o arrastra sobre la cara</span>
                    </div>
                    <button
                      type="button"
                      onPointerDown={applyPreviewFocus}
                      onPointerMove={(event) => {
                        if (event.buttons !== 1 && event.pointerType !== "touch") return;
                        applyPreviewFocus(event);
                      }}
                      className="group relative mx-auto block h-[360px] w-full max-w-[300px] touch-none overflow-hidden rounded-[28px] border border-line bg-sunken/40 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
                      aria-label="Seleccionar enfoque de la foto"
                    >
                      <img
                        src={editing.photoUrl}
                        alt={editing.displayName}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        style={{ objectPosition: `${focusX}% ${focusY}%` }}
                      />
                      <div
                        className="pointer-events-none absolute h-8 w-8 rounded-full border-2 border-canvas bg-canvas/15 shadow-[0_0_0_1px_theme(colors.ink.DEFAULT/25%)]"
                        style={{ left: `${focusX}%`, top: `${focusY}%`, transform: "translate(-50%, -50%)" }}
                      >
                        <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-canvas shadow-[0_0_0_1px_theme(colors.ink.DEFAULT/25%)]" />
                      </div>
                    </button>
                    <div className="nums mx-auto flex w-full max-w-[300px] items-center justify-between text-[11px] font-medium text-ink/60">
                      <span>X {focusX}%</span>
                      <span>Y {focusY}%</span>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="bg-ink text-canvas hover:bg-inverse">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="mr-2 animate-spin" />}
                  {editing ? "Actualizar datos" : "Crear"}
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

export default InstructorsList;
