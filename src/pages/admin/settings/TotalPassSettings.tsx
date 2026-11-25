import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import PartnerSyncControls from "./PartnerSyncControls";

type Config = {
  unitId: string;
  maxSpots: number;
  buffer: number;
  horizonDays: number;
  syncMinutes: number;
  cancellationHours: number | null;
};
type Response = {
  config: Config;
  revision: number;
  credentialStatus: Record<string, boolean>;
  configured: boolean;
  connection: string;
  testedAt: string | null;
  rules: {
    cancellationHours: number;
    studioCancellationHours: number;
    maxAdvanceDays: number;
    maxDailyBookings: number | null;
    maxActiveBookings: number | null;
  };
};
const provider = "totalpass";
const d = {
  title: "TotalPass",
  unit: "ID de unidad TotalPass",
  fields: [
    ["partnerApiKey", "Clave del integrador"],
    ["placeApiKey", "Clave de la unidad"],
  ],
};
export default function TotalPassSettings() {
  const queryClient = useQueryClient(),
    { toast } = useToast();
  const url = `/admin/partner-integrations/${provider}`;
  const query = useQuery<Response>({
    queryKey: ["partner-config", provider],
    queryFn: async () => (await api.get(url)).data.data,
  });
  const [config, setConfig] = useState<Config | null>(null);
  const [revision, setRevision] = useState(0);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (query.data && !dirty) {
      setConfig(query.data.config);
      setRevision(query.data.revision);
    }
  }, [query.data, dirty]);
  if (query.isLoading) return <p role="status">Cargando {d.title}…</p>;
  if (query.isError)
    return (
      <div role="alert" className="rounded-xl border p-5">
        No se pudo cargar {d.title}.{" "}
        <Button onClick={() => query.refetch()}>Reintentar</Button>
      </div>
    );
  if (!config || !query.data) return null;
  const update = (key: keyof Config, value: string | number | null) => {
    setConfig((c) => c && { ...c, [key]: value });
    setDirty(true);
  };
  async function save() {
    if (!config) return;
    const limits = {
      maxSpots: [0, 500],
      buffer: [0, 500],
      horizonDays: [1, 90],
      syncMinutes: [5, 60],
    };
    if (
      Object.entries(limits).some(([key, [min, max]]) => {
        const value = config[key as keyof typeof limits];
        return !Number.isInteger(value) || value < min || value > max;
      }) ||
      (config.cancellationHours !== null &&
        (!Number.isFinite(config.cancellationHours) ||
          config.cancellationHours < 0 ||
          config.cancellationHours > 168))
    ) {
      toast({
        title: "Completa los campos numéricos dentro de los límites indicados",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const result = (await api.put(url, { config, credentials, revision }))
        .data.data;
      setCredentials({});
      setDirty(false);
      setRevision(result.revision);
      setConfig(result.config);
      queryClient.setQueryData(["partner-config", provider], result);
      toast({ title: `${d.title}: configuración guardada` });
    } catch (e: any) {
      toast({
        title: e.response?.data?.message || "No se pudo guardar",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    try {
      const result = await api.post(`${url}/test`);
      toast({ title: result.data.message });
    } catch (e: any) {
      toast({
        title: e.response?.data?.message || "No se pudo probar la conexión",
        variant: "destructive",
      });
    } finally {
      await queryClient.invalidateQueries({
        queryKey: ["partner-config", provider],
      });
      setBusy(false);
    }
  }
  const rules = query.data.rules;
  return (
    <section className="rounded-2xl border bg-white p-5 sm:p-6 space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{d.title}</h2>
        <p className="text-sm text-muted-foreground">
          HIVE Pilates Studio · Ciudad de México
        </p>
      </div>
      <p className="text-sm" role="status">
        {query.data.connection === "verified"
          ? "Autenticación verificada"
          : query.data.connection === "failed"
            ? "Última prueba de conexión fallida"
            : "Conexión pendiente de probar"}
        {query.data.testedAt
          ? ` · ${new Date(query.data.testedAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`
          : ""}
      </p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`${provider}-unit`}>{d.unit}</Label>
          <Input
            id={`${provider}-unit`}
            value={config.unitId}
            onChange={(e) => update("unitId", e.target.value)}
            autoComplete="off"
          />
        </div>
        {d.fields.map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={`${provider}-${key}`}>{label}</Label>
            <Input
              id={`${provider}-${key}`}
              type="password"
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
              value={credentials[key] || ""}
              placeholder={
                query.data.credentialStatus[key]
                  ? "Guardada · deja vacío para conservar"
                  : "Sin configurar"
              }
              onChange={(e) => {
                setCredentials((c) => ({ ...c, [key]: e.target.value }));
                setDirty(true);
              }}
            />
          </div>
        ))}
        {(
          [
            ["maxSpots", "Tope de lugares por clase", 0, 500],
            ["buffer", "Lugares de margen para venta directa", 0, 500],
            ["horizonDays", "Días de publicación", 1, 90],
            ["syncMinutes", "Intervalo de sincronización (minutos)", 5, 60],
          ] as const
        ).map(([key, label, min, max]) => (
          <div key={key}>
            <Label htmlFor={`${provider}-${key}`}>{label}</Label>
            <Input
              id={`${provider}-${key}`}
              type="number"
              min={min}
              max={max}
              step="1"
              value={Number.isFinite(config[key]) ? config[key] : ""}
              onChange={(e) =>
                update(
                  key,
                  e.target.value === "" ? NaN : Number(e.target.value),
                )
              }
            />
          </div>
        ))}
        <div className="sm:col-span-2">
          <Label htmlFor={`${provider}-cancel`}>
            Anticipación para cancelar (horas)
          </Label>
          <Input
            id={`${provider}-cancel`}
            type="number"
            min="0"
            max="168"
            step="0.5"
            value={config.cancellationHours ?? ""}
            placeholder={`Heredar del estudio: ${rules.studioCancellationHours} h`}
            onChange={(e) =>
              update(
                "cancellationHours",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
          <p className="text-xs text-muted-foreground mt-1">
            Vacío hereda la política del estudio. Cero permite cancelar hasta el
            inicio.
          </p>
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy || !dirty}>
          {busy ? "Procesando…" : "Guardar configuración"}
        </Button>
        <Button
          variant="outline"
          onClick={test}
          disabled={busy || dirty || !query.data.configured}
        >
          Probar conexión guardada
        </Button>
        {dirty && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setCredentials({});
              setDirty(false);
              setConfig(query.data!.config);
              setRevision(query.data!.revision);
            }}
          >
            Descartar cambios
          </Button>
        )}
      </div>
      <PartnerSyncControls
        configured={
          query.data.configured &&
          query.data.connection === "verified" &&
          !dirty
        }
      />
    </section>
  );
}
