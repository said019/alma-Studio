import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { WELLHUB } from "@/lib/wellhubBrand";

interface WellhubSettings {
  environment?: string;
  is_enabled?: boolean;
  gym_id?: string;
  webhook_secret?: string;
  access_token?: string;
  api_base_url?: string;
  booking_base_url?: string;
  access_base_url?: string;
  webhook_url?: string;
  extra_config?: Record<string, any>;
}

const GATEWAY_URL = "https://wellhub-gateway-production.up.railway.app/webhooks/wellhub";

const PartnerPlatforms = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<WellhubSettings>({ environment: "production", is_enabled: false, extra_config: {} });

  const { data, isLoading } = useQuery({
    queryKey: ["partner-settings"],
    queryFn: async () => (await api.get("/partners/settings")).data,
  });

  useEffect(() => {
    const row = data?.data;
    if (row) setForm({ ...row, extra_config: row.extra_config || {} });
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put("/partners/settings", form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["partner-settings"] }); toast({ title: "Configuración guardada" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "No se pudo guardar", variant: "destructive" }),
  });

  const set = (k: keyof WellhubSettings, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const setExtra = (k: string, v: any) => setForm((f) => ({ ...f, extra_config: { ...(f.extra_config || {}), [k]: v } }));

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-2xl">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md px-2 py-1 text-xs font-bold tracking-tight" style={{ backgroundColor: WELLHUB.yellow, color: WELLHUB.ink }}>Wellhub</span>
            <h1 className="admin-title font-semibold text-alma-ink">Plataformas</h1>
          </div>
          <p className="text-sm text-alma-ink/60 mb-6">
            La URL de webhook registrada en Wellhub es la del gateway compartido:
            <code className="ml-1 break-all text-xs">{GATEWAY_URL}</code>
          </p>

          {isLoading ? (
            <p className="text-alma-ink/60">Cargando…</p>
          ) : (
            <div className="space-y-5 rounded-xl border border-alma-hairline bg-alma-mist p-6" style={{ borderLeft: `4px solid ${WELLHUB.yellow}` }}>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Activo</Label>
                  <p className="text-xs text-alma-ink/55">Interruptor maestro de la integración</p>
                </div>
                <Switch checked={!!form.is_enabled} onCheckedChange={(v) => set("is_enabled", v)} />
              </div>

              <div className="space-y-1.5">
                <Label>Environment</Label>
                <select
                  className="w-full rounded-md border border-alma-hairline bg-white px-3 py-2 text-sm"
                  value={form.environment || "production"}
                  onChange={(e) => set("environment", e.target.value)}
                >
                  <option value="production">production</option>
                  <option value="sandbox">sandbox</option>
                </select>
              </div>

              {([
                ["gym_id", "Gym ID (ID del studio en Wellhub)"],
                ["webhook_secret", "Webhook secret (firma de los webhooks)"],
                ["access_token", "Access token (API saliente)"],
              ] as const).map(([k, label]) => (
                <div key={k} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input value={(form as any)[k] || ""} onChange={(e) => set(k, e.target.value)} />
                </div>
              ))}

              <div className="space-y-1.5">
                <Label>Product ID (Wellhub)</Label>
                <p className="text-xs text-alma-ink/55">El ID del producto que representa tus clases en Wellhub (si te lo dieron).</p>
                <Input value={form.extra_config?.product_id || ""} onChange={(e) => setExtra("product_id", e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Precio de convenio por visita (MXN)</Label>
                <Input
                  type="number"
                  value={form.extra_config?.wellhub_class_price ?? 170}
                  onChange={(e) => setExtra("wellhub_class_price", Number(e.target.value))}
                />
              </div>

              <details className="text-sm">
                <summary className="cursor-pointer text-alma-ink/70">URLs base y resumen diario (opcional)</summary>
                <div className="mt-3 space-y-3">
                  {([
                    ["access_base_url", "Access base URL (override)"],
                    ["booking_base_url", "Booking base URL (override)"],
                  ] as const).map(([k, label]) => (
                    <div key={k} className="space-y-1.5">
                      <Label>{label}</Label>
                      <Input
                        value={(form as any)[k] || ""}
                        onChange={(e) => set(k, e.target.value)}
                        placeholder="(default según environment)"
                      />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label>URL de resumen diario</Label>
                    <Input value={form.extra_config?.daily_summary_url || ""} onChange={(e) => setExtra("daily_summary_url", e.target.value)} />
                  </div>
                </div>
              </details>

              <Button onClick={() => save.mutate()} disabled={save.isPending} className="hover:opacity-90" style={{ backgroundColor: WELLHUB.yellow, color: WELLHUB.ink, fontWeight: 600 }}>
                {save.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default PartnerPlatforms;
