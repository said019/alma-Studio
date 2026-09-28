import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { useCanSeeFinance } from "@/lib/roles";

/** Aviso de canal caído: los avisos por WhatsApp no están saliendo (auditoría 2026-09-27, P0-1). */
export default function WhatsAppBanner() {
  const isOwner = useCanSeeFinance();
  const { data } = useQuery({
    queryKey: ["evolution-status-banner"],
    queryFn: async () => {
      const [st, ns] = await Promise.all([
        api.get("/evolution/status"),
        api.get("/settings/notification_settings").catch(() => ({ data: { data: {} } })),
      ]);
      return { connected: Boolean(st.data?.data?.connected), whatsappOn: ns.data?.data?.whatsapp_reminders !== false };
    },
    enabled: isOwner,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  if (!isOwner || !data || data.connected || !data.whatsappOn) return null;
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-danger/25 bg-danger/10 px-5 py-3 text-[0.85rem] text-ink lg:px-8">
      <AlertTriangle size={16} className="shrink-0 text-danger" aria-hidden="true" />
      <span className="min-w-0 flex-1">WhatsApp desconectado: los avisos y recordatorios no están saliendo.</span>
      <Link to="/admin/settings?tab=whatsapp" className="shrink-0 font-bold text-ink underline underline-offset-2">Reconectar</Link>
    </div>
  );
}
