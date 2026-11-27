import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

function useSeatChange(classId: string, change: () => Promise<unknown>, onSaved?: () => void) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: change,
    onSuccess: async () => {
      onSaved?.();
      await Promise.all([["class-roster-sheet", classId], ["classes"], ["roster"], ["admin-classes-week"]]
        .map(queryKey => qc.invalidateQueries({ queryKey })));
    },
    onError: (error: any) => toast({ title: error.response?.data?.message ?? "No se pudo actualizar el lugar", variant: "destructive" }),
  });
}

export function ManualSeats({ classId }: { classId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const close = () => { setOpen(false); setName(""); };
  const add = useSeatChange(classId, () => api.post(`/admin/classes/${classId}/manual-seats`, { name }), close);
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}><Plus size={16} /> Lugar manual</Button>;
  return <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (!add.isPending) add.mutate(); }}>
    <Input autoFocus aria-label="Nombre o referencia (opcional)" placeholder="Nombre o referencia (opcional)" value={name} onChange={e => setName(e.target.value)} maxLength={150} />
    <div className="flex gap-2">
      <Button type="submit" disabled={add.isPending}>Ocupar lugar</Button>
      <Button type="button" variant="ghost" onClick={close} disabled={add.isPending}>Cancelar</Button>
    </div>
  </form>;
}

export function ReleaseManualSeat({ classId, bookingId, name }: { classId: string; bookingId: string; name: string }) {
  const release = useSeatChange(classId, () => api.delete(`/admin/classes/${classId}/manual-seats/${bookingId}`));
  return <Button type="button" variant="ghost" size="sm" disabled={release.isPending} aria-label={`Liberar lugar de ${name}`} onClick={() => release.mutate()}>Liberar</Button>;
}
