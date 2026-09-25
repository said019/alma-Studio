import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const r = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8");

describeZone(["src/pages/client/MyBookings.tsx", "src/pages/client/Orders.tsx", "src/pages/client/Notifications.tsx"]);

describe("Mis clases, órdenes y notificaciones (spec 2026-09-25 §6.4, 6.7, 6.9)", () => {
  it("Tus clases / en HIVE.", () => {
    expect(r("MyBookings.tsx")).toMatch(/titleAccent="en HIVE\."/);
    expect(r("MyBookings.tsx")).not.toMatch(/\bAlma\b/);
  });
  it("Cancelar reserva es un botón destructivo", () => {
    expect(r("MyBookings.tsx")).toMatch(/<GhostButton[^>]*tone="danger"/);
  });
  it("las no leídas llevan punto terracota", () => {
    expect(r("Notifications.tsx")).toMatch(/\bbg-accent\b/);
  });
});
