import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { ErrorState } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, UserPlus, Edit, Phone, Mail, ShieldCheck, ShieldAlert, AlertTriangle, Loader2 } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

interface ActivePack {
  id: string;
  plan_name: string;
  classes_remaining: number | null;
  end_date: string | null;
}

interface Guest {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  has_injury: boolean | null;
  injury_details: string | null;
  practiced_barre_before: boolean | null;
  accepted_waiver_at: string | null;
  host_name: string | null;
  host_phone: string | null;
  active_pack: ActivePack | null;
  updated_at: string;
}

const VisitsList = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 250);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Guest | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<{ data: Guest[] }>({
    queryKey: ["guest-profiles", debounced],
    queryFn: async () => (await api.get(`/admin/guest-profiles${debounced ? `?search=${encodeURIComponent(debounced)}` : ""}`)).data,
  });
  const guests = data?.data ?? [];

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [hasInjury, setHasInjury] = useState(false);
  const [injuryDetails, setInjuryDetails] = useState("");
  const [practicedBefore, setPracticedBefore] = useState(false);
  const [waiver, setWaiver] = useState(false);

  const resetForm = () => {
    setName(""); setPhone(""); setEmail("");
    setHasInjury(false); setInjuryDetails("");
    setPracticedBefore(false); setWaiver(false);
    setEditing(null);
  };

  const openEdit = (g: Guest) => {
    setEditing(g);
    setName(g.display_name);
    setPhone(g.phone || "");
    setEmail(g.email || "");
    setHasInjury(g.has_injury === true);
    setInjuryDetails(g.injury_details || "");
    setPracticedBefore(g.practiced_barre_before === true);
    setWaiver(Boolean(g.accepted_waiver_at));
    setFormOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        phone,
        email: email || undefined,
        hasInjury,
        injuryDetails: hasInjury ? (injuryDetails || null) : null,
        practicedBarreBefore: practicedBefore,
        acceptedWaiver: waiver,
      };
      if (editing) {
        return (await api.put(`/admin/guest-profiles/${editing.id}`, body)).data;
      } else {
        return (await api.post("/admin/guest-profiles", body)).data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guest-profiles"] });
      toast({
        title: editing ? "Invitada actualizada" : "Invitada registrada",
        description: name,
      });
      setFormOpen(false);
      resetForm();
    },
    onError: (e: any) =>
      toast({
        title: "Error al guardar",
        description: e?.response?.data?.message || "Inténtalo de nuevo",
        variant: "destructive",
      }),
  });

  const canSubmit = name.trim() && phone.trim() && (editing || waiver);

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          <SectionTabs
            tabs={[
              { label: "Clientas", to: "/admin/clients" },
              { label: "Visitas", to: "/admin/visitas" },
            ]}
          />
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="admin-title font-semibold text-alma-ink">Invitadas / Visitas</h1>
              <p className="mt-1 text-sm text-alma-ink/55">
                Registro de acompañantes y sus cuestionarios iniciales. El cuestionario se reusa la próxima vez que vengan.
              </p>
            </div>
            <Button
              onClick={() => { resetForm(); setFormOpen(true); }}
              className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep"
            >
              <Plus size={14} className="mr-1.5" /> Nueva invitada
            </Button>
          </div>

          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-alma-ink/40" />
            <Input
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState
              description="No pudimos cargar a las invitadas. Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetch()}
            />
          ) : guests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-alma-sandstone/70 p-8 text-center">
              <UserPlus size={32} className="mx-auto text-alma-stone mb-3" />
              <p className="text-sm text-alma-ink/70">Aún no hay invitadas registradas.</p>
              <p className="mt-1 text-xs text-alma-ink/55">
                Se registran automáticamente al asignarlas a una clase, o aquí con <strong>"Nueva invitada"</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {guests.map((g) => (
                <div
                  key={g.id}
                  className="rounded-2xl border border-alma-hairline bg-alma-mist p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-alma-ink">{g.display_name}</p>
                        {g.active_pack ? (
                          <Badge variant="outline" className="nums border-transparent bg-alma-oat text-alma-ink text-[10px] font-medium">
                            {g.active_pack.classes_remaining ?? "—"} clase{g.active_pack.classes_remaining === 1 ? "" : "s"} · {g.active_pack.plan_name}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-alma-hairline bg-transparent text-alma-ink/55 text-[10px] font-medium">
                            Sin pack activo
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-alma-ink/60">
                        {g.phone && <span className="nums flex items-center gap-1"><Phone size={11} /> {g.phone}</span>}
                        {g.email && <span className="flex items-center gap-1"><Mail size={11} /> {g.email}</span>}
                        {g.host_name && <span>Trajo: <strong className="text-alma-ink/80">{g.host_name}</strong></span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        {g.practiced_barre_before === true && (
                          <span className="rounded-full border border-alma-hairline bg-alma-canvas px-2 py-0.5 text-alma-ink/60">
                            Con experiencia previa
                          </span>
                        )}
                        {g.accepted_waiver_at ? (
                          <span className="inline-flex items-center gap-1 text-alma-olive">
                            <ShieldCheck size={12} /> Waiver firmado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-alma-berry">
                            <ShieldAlert size={12} /> Waiver pendiente
                          </span>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openEdit(g)}>
                      <Edit size={12} className="mr-1.5" /> Editar
                    </Button>
                  </div>

                  {g.has_injury === true && (
                    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
                      <div className="min-w-0">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-destructive">
                          Lesión o condición física
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-alma-ink/80">
                          {g.injury_details || "Sin detalles registrados. Confirma con ella antes de la clase."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form modal */}
        <Dialog open={formOpen} onOpenChange={(v) => { if (!saveMutation.isPending) { setFormOpen(v); if (!v) resetForm(); } }}>
          <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar invitada" : "Nueva invitada"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Nombre *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Teléfono *</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 dígitos" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email (opcional)</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ej. ana@correo.com" />
              </div>

              <div className="rounded-xl border border-alma-hairline bg-alma-mist p-3 space-y-3">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-ink/60">Cuestionario</p>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">¿Tiene lesión o condición física?</Label>
                  <Switch checked={hasInjury} onCheckedChange={setHasInjury} />
                </div>
                {hasInjury && (
                  <Textarea rows={2} value={injuryDetails} onChange={(e) => setInjuryDetails(e.target.value)} placeholder="Detalles relevantes" />
                )}
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">¿Ha practicado pilates antes?</Label>
                  <Switch checked={practicedBefore} onCheckedChange={setPracticedBefore} />
                </div>
                <div className="flex items-start justify-between gap-2 border-t border-alma-hairline pt-2.5">
                  <Label className="text-xs leading-relaxed">
                    Confirma que la invitada leyó y aceptó los términos y riesgos de la clase.
                  </Label>
                  <Switch checked={waiver} onCheckedChange={setWaiver} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setFormOpen(false); resetForm(); }} disabled={saveMutation.isPending}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!canSubmit || saveMutation.isPending}
                className="bg-alma-ink text-alma-canvas hover:bg-alma-ink-deep"
              >
                {saveMutation.isPending ? (
                  <><Loader2 size={14} className="mr-2 animate-spin" /> Guardando…</>
                ) : (editing ? "Guardar cambios" : "Registrar")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
};

export default VisitsList;
