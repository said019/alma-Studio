import { PrimaryButton } from "@/components/app/AppShell";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAuthStore } from "@/stores/authStore";
import { heroCta } from "./landingData";
import "./landing.css";

export function LandingHero() {
  const { isAuthenticated, user } = useAuthStore();
  const cta = heroCta(user, isAuthenticated);

  return (
    <section aria-labelledby="hero-titulo" className="hive-hero">
      <div className="hive-hero-copy">
        <p className="hive-eyebrow">Movimiento · Bienestar · Comunidad</p>
        <h1 id="hero-titulo">Pilates Reformer <span>en Coyoacán.</span></h1>
        <p className="hive-hero-description">Un momento para ti. Un espacio para moverte, encontrar fuerza y hacer de tu práctica parte de cada día.</p>
        <div className="hive-hero-actions">
          <PrimaryButton to={cta.to}>{cta.label}</PrimaryButton>
          <a href="#horario" className="hive-hero-secondary">Ver horario <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hive-hero-footnote">
          <span className="hive-hero-index" aria-hidden="true">01 /</span>
          <p>Tu práctica empieza aquí.<br /><span>Elige tu plan y reserva desde la app.</span></p>
        </div>
      </div>
      <div className="hive-hero-art" aria-hidden="true">
        <div className="hive-art-top"><span>HIVE / PILATES STUDIO</span><span>COYOACÁN, CDMX</span></div>
        <div className="hive-art-symbol"><BrandLogo variant="mark" size={210} /></div>
        <p className="hive-art-motto">BEE HEALTHY.<br />BE HIVE.</p>
        <div className="hive-art-bottom"><span>FUERZA EN CADA MOVIMIENTO.</span><span>↗</span></div>
      </div>
      <p className="sr-only">BEE HEALTHY. BE HIVE.</p>
    </section>
  );
}
