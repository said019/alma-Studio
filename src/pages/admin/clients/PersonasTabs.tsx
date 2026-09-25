import SectionTabs from "@/components/admin/SectionTabs";
import { FEATURES } from "@/config/features";

export default function PersonasTabs() {
  return (
    <SectionTabs
      aria-label="Secciones de Personas"
      tabs={[
        { label: "Clientas", to: "/admin/clients" },
        ...(FEATURES.visits ? [{ label: "Visitas", to: "/admin/visitas" }] : []),
        { label: "Coaches", to: "/admin/staff" },
      ]}
    />
  );
}
