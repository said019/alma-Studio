import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import SectionTabs from "@/components/admin/SectionTabs";
import { useCanSeeFinance } from "@/lib/roles";

/* Cobrar · Verificar · Historial (spec §5.8-5.10). Verificar lleva el
   contador de pagos por verificar; Historial sólo para la dueña. */
export default function CobrosTabs() {
  const showFinance = useCanSeeFinance();
  const { data } = useQuery<{ pendingAlerts?: number }>({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get("/admin/stats")).data,
    staleTime: 60_000,
  });
  return (
    <SectionTabs
      aria-label="Secciones de Cobros"
      tabs={[
        { label: "Cobrar", to: "/admin/payments", exact: true },
        { label: "Verificar", to: "/admin/orders", count: data?.pendingAlerts ?? 0 },
        ...(showFinance ? [{ label: "Historial", to: "/admin/payments/historial" }] : []),
      ]}
    />
  );
}
