import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  bookingId: string;
  name: string;
  status: string;
  onChanged: () => void;
}
type Action = "cancel" | "no_show";

export function TotalPassBookingActions({
  bookingId,
  name,
  status,
  onChanged,
}: Props) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: (action: Action) =>
      api.post(`/admin/partner-bookings/${bookingId}/action`, { action }),
    onSuccess: (response) =>
      toast({ title: response.data.message || "Reserva actualizada" }),
    onError: (error: any) =>
      toast({
        title:
          error.response?.data?.message ||
          "No se pudo confirmar el cambio con TotalPass.",
        variant: "destructive",
      }),
    onSettled: onChanged,
  });
  function confirm(action: Action) {
    const message =
      action === "cancel"
        ? `¿Cancelar la reserva de ${name} en TotalPass y HIVE?`
        : `¿Registrar la falta de ${name} en HIVE? Su asistencia en TotalPass se registra desde su app.`;
    if (window.confirm(message)) mutation.mutate(action);
  }

  if (status !== "confirmed" && status !== "checked_in") return null;
  return (
    <>
      {status === "confirmed" && (
        <span className="basis-full text-sm text-ink-muted">
          El check-in se registra desde la app de TotalPass.
        </span>
      )}
      <Button
        variant="ghost"
        disabled={mutation.isPending}
        onClick={() => confirm("no_show")}
      >
        Registrar falta en HIVE
      </Button>
      {status === "confirmed" && (
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => confirm("cancel")}
        >
          Cancelar en TotalPass
        </Button>
      )}
    </>
  );
}
