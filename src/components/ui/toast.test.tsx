import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Toast, ToastClose, ToastProvider, ToastViewport, toastVariants } from "./toast";

/* F1 — los toasts pasan a superficie clara: fondo surface, borde line,
   sombra suave. Ninguna variante usa coral (accent). El botón cerrar es
   inkMuted y visible (no transparente). Spec §4.7; ruling F1. */
describe("toastVariants — superficie clara, sin coral (spec F1)", () => {
  it("el contenedor es surface con borde line, en toda variante", () => {
    for (const variant of ["default", "destructive"] as const) {
      const classes = toastVariants({ variant });
      expect(classes, variant).toMatch(/\bbg-surface\b/);
      expect(classes, variant).toMatch(/\bborder-line\b/);
    }
  });

  it("ninguna variante trae accent (coral) en el contenedor", () => {
    for (const variant of ["default", "destructive"] as const) {
      const classes = toastVariants({ variant });
      expect(classes, variant).not.toMatch(/\baccent\b/);
    }
  });
});

describe("ToastClose — inkMuted, visible sobre superficie clara (spec F1)", () => {
  it("no es transparente ni coral", () => {
    render(
      <ToastProvider>
        <Toast open>
          <ToastClose />
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    const close = screen.getByRole("button");
    expect(close.className).toMatch(/\btext-ink-muted\b/);
    expect(close.className).not.toMatch(/opacity-0/);
    expect(close.className).not.toMatch(/text-accent-strong/);
    expect(close.className).not.toMatch(/text-foreground\/50/);
    expect(close.className).not.toMatch(/\baccent\b/);
  });
});
