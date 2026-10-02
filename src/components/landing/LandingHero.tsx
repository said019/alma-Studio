import { PrimaryButton } from "@/components/app/AppShell";
import { useAuthStore } from "@/stores/authStore";
import { heroCta } from "./landingData";
import { InteractiveReformer } from "./InteractiveReformer";
import "./landing.css";

export function LandingHero({ showPlans = true }: { showPlans?: boolean }) {
  const { isAuthenticated, user } = useAuthStore();
  const cta = heroCta(user, isAuthenticated);
  return (
    <section aria-labelledby="hero-titulo" className="hive-hero">
      <p className="hive-hero-intro">Pilates Reformer en Coyoacán</p>
      <h1 id="hero-titulo"><span className="hive-hero-line"><span>BEE HEALTHY.</span></span><span className="hive-hero-line"><span>BE HIVE.</span></span></h1>
      <div className="hive-hero-bottom">
        <div className="hive-hero-copy">
          <p>Reserva tus sesiones de Pilates Reformer desde nuestra app.</p>
          <PrimaryButton to={cta.to} className="hive-reserve">{cta.label}</PrimaryButton>
          {showPlans && <a href="#paquetes" className="hive-text-link">Encuentra tu plan</a>}
        </div>
        <InteractiveReformer />
      </div>
    </section>
  );
}
