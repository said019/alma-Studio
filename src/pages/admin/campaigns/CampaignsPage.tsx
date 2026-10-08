import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { AuthGuard } from "@/components/admin/AuthGuard";
import { BroadcastDialog } from "@/components/admin/BroadcastDialog";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
export default function CampaignsPage() {
  const [open, setOpen] = useState(false);
  return <AuthGuard><AdminLayout>
    <div className="space-y-5">
      <h1 className="admin-title font-display text-ink">Campañas por correo</h1>
      <p className="text-ink-muted">Envía novedades y promociones por correo electrónico. Selecciona la audiencia, escribe el mensaje y revisa los destinatarios antes de enviarlo.</p>
      <Button onClick={() => setOpen(true)}><Mail className="mr-2 h-4 w-4" />Nueva campaña por correo</Button>
    </div>
    <BroadcastDialog open={open} onOpenChange={setOpen} emailOnly />
  </AdminLayout></AuthGuard>;
}
