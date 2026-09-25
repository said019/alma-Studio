import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { ErrorState } from "@/components/app/AppShell";

export const editSchema = z.object({
  email: z.string().email("Email inválido"),
  phone: z.string().optional(),
  displayName: z.string().min(1, "Nombre requerido"),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
  acceptsCommunications: z.boolean().default(true),
});
export type EditFormData = z.infer<typeof editSchema>;

/** Del objeto del servidor al formulario: sin null (zod los rechaza) y la fecha en YYYY-MM-DD. */
export function toFormValues(u: Record<string, any>): EditFormData {
  const s = (v: unknown) => (v == null ? "" : String(v));
  return {
    email: s(u.email),
    phone: s(u.phone),
    displayName: s(u.displayName ?? u.display_name),
    dateOfBirth: s(u.dateOfBirth ?? u.date_of_birth).slice(0, 10),
    emergencyContactName: s(u.emergencyContactName ?? u.emergency_contact_name),
    emergencyContactPhone: s(u.emergencyContactPhone ?? u.emergency_contact_phone),
    healthNotes: s(u.healthNotes ?? u.health_notes),
    acceptsCommunications: (u.acceptsCommunications ?? u.accepts_communications) !== false,
  };
}

const LEGEND = "mb-3 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted";

type ClientEditSheetProps = { clientId: string | null; open: boolean; onOpenChange: (open: boolean) => void };

/* "Editar clienta" (spec §5.11 y §5.13). Carga la clienta completa: la lista
   sólo trae nombre, email y teléfono, y antes el formulario abría vacío. */
export default function ClientEditSheet({ clientId, open, onOpenChange }: ClientEditSheetProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<Record<string, any>>({
    queryKey: ["client", clientId],
    queryFn: async () => (await api.get(`/users/${clientId}`)).data,
    enabled: open && !!clientId,
  });
  const user = data?.data ?? data;
  const form = useForm<EditFormData>({ resolver: zodResolver(editSchema) });
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = form;

  useEffect(() => {
    if (open && user?.id) reset(toFormValues(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const mutation = useMutation({
    mutationFn: (d: EditFormData) => api.put(`/users/${clientId}`, { ...d, role: "client" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      toast({ title: "Clienta actualizada" });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "No se pudo actualizar", description: e?.response?.data?.message ?? "Revisa los datos e intenta de nuevo.", variant: "destructive" }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Editar clienta</SheetTitle>
          <SheetDescription>Actualiza los datos del expediente de {user?.displayName ?? user?.display_name ?? "la clienta"}.</SheetDescription>
        </SheetHeader>
        {isError ? (
          <ErrorState title="No pudimos cargar a la clienta" onRetry={() => refetch()} />
        ) : isLoading || !user ? (
          <div className="mt-6 space-y-3"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : (
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="mt-6 flex flex-col gap-6">
            <fieldset>
              <legend className={LEGEND}>Datos</legend>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-name">Nombre completo</Label>
                  <Input id="edit-name" {...register("displayName")} />
                  {errors.displayName && <p className="text-[13px] text-danger">{errors.displayName.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Fecha de nacimiento</Label>
                  <DatePicker value={watch("dateOfBirth") ?? ""} onChange={(v: string) => setValue("dateOfBirth", v, { shouldDirty: true })} />
                </div>
              </div>
            </fieldset>
            <fieldset>
              <legend className={LEGEND}>Contacto</legend>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input id="edit-email" {...register("email")} readOnly aria-describedby="edit-email-help" className="bg-sunken" />
                  <p id="edit-email-help" className="text-[0.75rem] text-ink-muted">El correo no se puede cambiar desde aquí.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-phone">Teléfono</Label>
                  <Input id="edit-phone" {...register("phone")} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-em-name">Contacto de emergencia</Label>
                    <Input id="edit-em-name" placeholder="Nombre" {...register("emergencyContactName")} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-em-phone">Teléfono emergencia</Label>
                    <Input id="edit-em-phone" {...register("emergencyContactPhone")} />
                  </div>
                </div>
              </div>
            </fieldset>
            <fieldset>
              <legend className={LEGEND}>Salud</legend>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-health">Notas de salud</Label>
                <Textarea id="edit-health" rows={3} placeholder="Lesiones, condiciones..." {...register("healthNotes")} />
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Guardando…" : "Actualizar"}</Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
