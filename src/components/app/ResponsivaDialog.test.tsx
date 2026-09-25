import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResponsivaDialog } from "./ResponsivaDialog";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
// El lienzo de firma usa Canvas2D y ResizeObserver, que jsdom no tiene.
vi.mock("@/components/app/SignaturePad", () => ({ SignaturePad: () => <div data-testid="firma" /> }));

const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResponsivaDialog open onClose={() => {}} onSigned={() => {}} />
    </QueryClientProvider>,
  );

describe("ResponsivaDialog: velo (I2)", () => {
  it("el velo es canvas al 80 %, sin desenfoque ni inverse (en oscuro inverse es claro: velo lechoso)", () => {
    const { container } = abrir();
    const velo = container.firstElementChild!;
    expect(velo.className).toMatch(/\bfixed inset-0\b/);
    expect(velo.className.split(/\s+/)).toContain("bg-canvas/80");
    expect(velo.className).not.toMatch(/bg-inverse|backdrop-blur/);
  });
});
