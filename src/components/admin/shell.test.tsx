import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import AdminLayout from "./AdminLayout";
import ClientSearch from "./ClientSearch";
import { loginAs, routeApi, LocationProbe } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

const CAMILA = { id: "u1", displayName: "Camila Torres", email: "camila@correo.com", phone: "5512345678" };

function mount(route = "/admin/dashboard") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <AdminLayout><p>contenido</p></AdminLayout>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockApi.get.mockReset();
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 3, classesToday: 8, activeMembers: 112, monthlyRevenue: 86400 },
    "/users?role=client&search=cam": { data: [CAMILA] },
    "/users?role=client&search=zz": { data: [] },
    "/users?role=client&search=": { data: [] },
  });
});

describe("marco del panel", () => {
  it("la dueña ve Cobrar y el contador de pagos por verificar en Cobros", async () => {
    loginAs("admin");
    mount();
    const cobros = await screen.findByRole("link", { name: /Cobros/ });
    await waitFor(() => expect(within(cobros).getByText("3")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Cobrar/ })).toHaveAttribute("href", "/admin/payments");
    expect(screen.getByRole("link", { name: /Pasar lista/ })).toHaveAttribute("href", "/admin/pasar-lista");
  });

  it("recepción no ve Cobros ni Cobrar, ni pide las cifras de dinero", async () => {
    loginAs("reception");
    mount();
    await screen.findByText("contenido");
    expect(screen.queryByRole("link", { name: /Cobros/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Cobrar/ })).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalledWith("/admin/stats");
  });

  it("el pie muestra el rol, Ver sitio y Cerrar sesión", async () => {
    loginAs("admin");
    mount();
    expect(await screen.findByText("Dueña")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver sitio" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  it("⌘K lleva el foco al buscador", async () => {
    loginAs("admin");
    mount();
    const combo = await screen.findByRole("combobox", { name: "Buscar clienta" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(document.activeElement).toBe(combo);
  });

  it("elegir una clienta en el buscador abre su ficha", async () => {
    loginAs("admin");
    mount();
    const combo = await screen.findByRole("combobox", { name: "Buscar clienta" });
    fireEvent.change(combo, { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    expect(screen.getByTestId("location").textContent).toBe("/admin/clients/u1");
  });
});

describe("ClientSearch", () => {
  const renderSearch = (onSelect = vi.fn()) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><ClientSearch onSelect={onSelect} /></QueryClientProvider>);
    return { onSelect, combo: screen.getByRole("combobox", { name: "Buscar clienta" }) };
  };

  it("con una sola letra no busca", async () => {
    const { combo } = renderSearch();
    fireEvent.change(combo, { target: { value: "c" } });
    await new Promise((r) => setTimeout(r, 400));
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it("codifica acentos y símbolos en la URL", async () => {
    const { combo } = renderSearch();
    fireEvent.change(combo, { target: { value: "ñ&+52" } });
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith("/users?role=client&search=%C3%B1%26%2B52"));
  });

  it("flecha y Enter eligen; Esc cierra", async () => {
    const { combo, onSelect } = renderSearch();
    fireEvent.change(combo, { target: { value: "cam" } });
    await screen.findByRole("option", { name: /Camila Torres/ });
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(CAMILA);
    fireEvent.change(combo, { target: { value: "cam" } });
    await screen.findByRole("listbox");
    fireEvent.keyDown(combo, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("sin resultados lo dice", async () => {
    const { combo } = renderSearch();
    fireEvent.change(combo, { target: { value: "zz" } });
    expect(await screen.findByText("No encontramos a nadie con esos datos.")).toBeInTheDocument();
  });
});
