import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Select, SelectTrigger, SelectValue } from "./select";

/* F7 — SelectTrigger sin halo de foco: le faltaba el mismo tratamiento que
   Input (ring-ink + halo accent-soft). Ruling F7. */
describe("SelectTrigger — foco igual que Input (spec §4.4, F7)", () => {
  it("tiene ring-ink y el halo accent-soft en foco", () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Elige" />
        </SelectTrigger>
      </Select>,
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger.className).toMatch(/ring-ink\b/);
    expect(trigger.className).toMatch(/shadow-\[0_0_0_5px_theme\(colors\.accent\.soft\)\]/);
  });
});
