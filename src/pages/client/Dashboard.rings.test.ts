import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

describe("anillos eliminados del producto", () => {
  it("Dashboard y Wallet no importan RingsTriple", () => {
    expect(read("Dashboard.tsx")).not.toContain("RingsTriple");
    expect(read("Wallet.tsx")).not.toContain("RingsTriple");
  });
  it("ClientDetail no tiene tab de anillos", () => {
    expect(read("../admin/clients/ClientDetail.tsx")).not.toContain("Conexión");
  });
  it("el componente RingsTriple ya no existe", () => {
    expect(existsSync(resolve(here, "../../components/alma/RingsTriple.tsx"))).toBe(false);
  });
});
