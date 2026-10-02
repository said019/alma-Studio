import { useId, useRef, type FormEvent } from "react";

/** Continuous input updates only CSS variables; React never renders on each movement. */
export function InteractiveReformer() {
  const apparatus = useRef<HTMLDivElement>(null);
  const inputId = useId();
  function move(event: FormEvent<HTMLInputElement>) {
    const value = Number(event.currentTarget.value);
    apparatus.current?.classList.add("user-moving");
    apparatus.current?.style.setProperty("--travel", `${-value}px`);
    apparatus.current?.style.setProperty("--spring", String(1 + value * .0052));
  }
  return <div className="hive-apparatus" ref={apparatus}>
    <svg viewBox="0 0 760 310" fill="none" aria-hidden="true"><g stroke="rgb(var(--c-line-strong))" strokeWidth="2"><path d="M60 227 530 227 712 153 252 153Z M60 227v21h470l182-74v-21 M530 227v21 M90 248v35h23v-35 M520 248v35h23v-40 M680 188v32h18v-39"/><path d="m135 210 410 0 105-42H240Z"/></g><g stroke="rgb(var(--c-accent))" strokeWidth="2"><path d="M667 160V69l-61 23v66 M606 92l61-23 M672 69V47l-10-4-66 26v26"/><path d="m92 219 155-61" strokeDasharray="3 6"/></g><g className="hive-reformer-spring" stroke="rgb(var(--c-accent))" strokeWidth="1.5"><path d="M434 185h15l5-5 7 10 7-10 7 10 7-10 7 10 7-10 7 10 7-10 7 10 7-10 7 10 7-10 7 10 7-10 7 10 7-10 7 10 7-10 5 5h27"/></g><g className="hive-reformer-carriage"><path d="m227 158 228 0 95-39H322Z" fill="rgb(var(--c-accent-soft))" stroke="rgb(var(--c-accent))" strokeWidth="2"/><path d="M227 158v16h228l95-39v-16 M455 158v16" stroke="rgb(var(--c-accent))" strokeWidth="2"/><path d="M304 142v-31l28-12v32 M352 123V95l28-11v29" stroke="rgb(var(--c-ink))" strokeWidth="3"/><path d="m307 110 24-10m23-5 25-10" stroke="rgb(var(--c-accent))" strokeWidth="8"/><path d="m327 106 338-53m-289 34 289-34" stroke="rgb(var(--c-line-strong))" strokeWidth="1"/></g><text x="590" y="279" fill="rgb(var(--c-ink-muted))" fontFamily="Manrope,sans-serif" fontSize="11" letterSpacing="3">REFORMER</text></svg>
    <div className="hive-apparatus-label">
      <span>Pilates Reformer</span>
      <label htmlFor={inputId}>Pruébalo <input id={inputId} aria-label="Mover el carro del Reformer" type="range" min="0" max="100" defaultValue="0" onInput={move} /></label>
    </div>
  </div>;
}
