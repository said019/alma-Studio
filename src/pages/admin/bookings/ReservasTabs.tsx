import { useQuery } from "@tanstack/react-query";
import { endOfWeek, format, startOfWeek } from "date-fns";
import api from "@/lib/api";
import SectionTabs from "@/components/admin/SectionTabs";

/* Pestañas de Reservas (spec §5.2). El contador de Lista de espera suma la
   espera de las clases de esta semana (`waitlist_count`). Comparte llave con
   la lista de la semana, así que no duplica la petición. */
export default function ReservasTabs() {
  const now = new Date();
  const start = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const end = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const { data } = useQuery<{ data: { waitlist_count?: number }[] }>({
    queryKey: ["admin-classes-week", start],
    queryFn: async () => (await api.get(`/classes?start=${start}&end=${end}`)).data,
    staleTime: 60_000,
  });
  const waiting = (Array.isArray(data?.data) ? data!.data : []).reduce((sum, c) => sum + (Number(c.waitlist_count) || 0), 0);
  return (
    <SectionTabs
      aria-label="Secciones de Reservas"
      tabs={[
        { label: "Semana", to: "/admin/bookings", exact: true },
        { label: "Hoy · pasar lista", to: "/admin/pasar-lista" },
        { label: "Lista de espera", to: "/admin/bookings/waitlist", count: waiting },
      ]}
    />
  );
}
