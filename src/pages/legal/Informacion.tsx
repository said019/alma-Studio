import { STUDIO_FAQS, STUDIO_RULES } from "@/lib/studioContent";
import { STUDIO } from "@/lib/studio";
import { RESPONSIVA_PDF_URL } from "@/components/app/responsivaContent";
import LegalLayout, { LegalContact, LegalH2 } from "./LegalLayout";

export default function Informacion() {
  return <LegalLayout current="/legal/informacion" title="Preguntas frecuentes y reglamento">
    <div className="space-y-7">
      <p>Todo lo que necesitas para disfrutar tu experiencia en {STUDIO.name}.</p>
      {STUDIO_FAQS.map(group => <section key={group.title}>
        <LegalH2>{group.title}</LegalH2>
        {group.items.map(item => <details key={item.question} className="border-b border-line py-4">
          <summary className="cursor-pointer font-semibold text-ink">{item.question}</summary>
          <p className="mt-3 whitespace-pre-line">{item.answer}</p>
        </details>)}
      </section>)}
      <section id="reglamento">
        <LegalH2>Reglamento HIVE Pilates Studio</LegalH2>
        <ol className="list-decimal pl-6 space-y-3">{STUDIO_RULES.map(rule => <li key={rule}>{rule}</li>)}</ol>
      </section>
      <section>
        <LegalH2>Consentimiento informado y responsiva</LegalH2>
        <p>Se firman al momento de la inscripción o compra de clase.</p>
        <a href={RESPONSIVA_PDF_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Consultar el documento original del estudio (PDF)</a>
      </section>
      <LegalContact />
    </div>
  </LegalLayout>;
}
