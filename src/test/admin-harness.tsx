import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Mock } from "vitest";
import { useAuthStore } from "@/stores/authStore";

export type StaffRole = "admin" | "super_admin" | "reception" | "instructor";

/** Deja una sesión de personal lista para que AuthGuard pase. */
export function loginAs(role: StaffRole = "admin") {
  useAuthStore.setState({
    user: { id: "u-staff", role, displayName: "Admin HIVE", email: "admin@hive.test" } as never,
    token: "t",
    isAuthenticated: true,
  });
}

type ApiMock = { get: Mock; post?: Mock; put?: Mock; delete?: Mock };

/**
 * Responde el `api.get` simulado por ruta. Gana la llave más larga que sea
 * igual o prefijo de la URL pedida. Un valor `Error` se rechaza (con
 * `response.status` si lo trae). Sin llave: 404, para que la pantalla muestre
 * su error y la prueba lo note.
 */
export function routeApi(mock: ApiMock, table: Record<string, unknown>) {
  mock.get.mockImplementation((url: string) => {
    const keys = Object.keys(table)
      .filter((k) => url === k || url.startsWith(k))
      .sort((a, b) => b.length - a.length);
    if (!keys.length) {
      return Promise.reject(Object.assign(new Error(`sin simulación para ${url}`), { response: { status: 404, data: {} } }));
    }
    const value = table[keys[0]];
    return value instanceof Error ? Promise.reject(value) : Promise.resolve({ data: value });
  });
}

/** Muestra la URL actual para que las pruebas lean `?clase=`, `?tab=`, etc. */
export function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
}

export function renderAdmin(ui: ReactElement, { route, path }: { route: string; path?: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path ?? route.split("?")[0]} element={<>{ui}<LocationProbe /></>} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
