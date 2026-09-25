import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { applyTheme, themeForPath, RouteTheme, THEME_COLOR } from "./theme";
import { DARK } from "./tokens";
import NotFound from "@/pages/NotFound";

const meta = () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content");

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF" />';
  delete document.documentElement.dataset.theme;
});

describe("tema", () => {
  it("la ruta decide el tema: app y acceso oscuros, lo demás claro", () => {
    expect(themeForPath("/app")).toBe("dark");
    expect(themeForPath("/app/wallet")).toBe("dark");
    expect(themeForPath("/auth/login")).toBe("dark");
    expect(themeForPath("/admin/dashboard")).toBe("light");
    expect(themeForPath("/")).toBe("light");
    expect(themeForPath("/application")).toBe("light");
  });
  it("applyTheme fija <html data-theme> y la barra de estado", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(meta()).toBe(DARK.canvas);
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(meta()).toBe(THEME_COLOR.light);
  });
  it("RouteTheme pone oscuro en /app y vuelve a claro al ir al panel", () => {
    const { unmount } = render(<MemoryRouter initialEntries={["/app"]}><RouteTheme /></MemoryRouter>);
    expect(document.documentElement.dataset.theme).toBe("dark");
    unmount();
    render(<MemoryRouter initialEntries={["/admin/dashboard"]}><RouteTheme /></MemoryRouter>);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("la 404 es oscura aunque la ruta sea de la zona clara", () => {
    render(
      <MemoryRouter initialEntries={["/no-existe"]}>
        <RouteTheme />
        <Routes><Route path="*" element={<NotFound />} /></Routes>
      </MemoryRouter>,
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
