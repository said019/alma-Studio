import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderPage } from "@/test/renderPage";
import api from "@/lib/api";
import TotalPassSettings from "./TotalPassSettings";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
it("mantiene las credenciales ocultas y conserva un tope de cero al guardar", async () => {
  const path = "/admin/partner-integrations/totalpass";
  const data = {
    config: {
      unitId: "231071",
      maxSpots: 2,
      buffer: 0,
      horizonDays: 14,
      syncMinutes: 5,
      cancellationHours: null,
    },
    revision: 5,
    configured: true,
    connection: "verified",
    rules: { studioCancellationHours: 3 },
    credentialStatus: { partnerApiKey: true, placeApiKey: true },
  };
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: {
      data: url.endsWith("/runtime")
        ? { sync_enabled: false, issues: [] }
        : url.endsWith("/checkins")
          ? { registered: false, events: [] }
          : data,
    },
  }));
  vi.mocked(api.put).mockResolvedValue({ data: { data } });
  renderPage(<TotalPassSettings />);
  const limit = await screen.findByLabelText("Tope de lugares por clase");
  expect(screen.getByLabelText("Clave de la unidad")).toHaveValue("");
  expect(screen.getByLabelText("Clave de la unidad")).toHaveAttribute(
    "type",
    "password",
  );
  fireEvent.change(limit, { target: { value: "0" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Guardar configuración" }),
  );
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith(path, {
      config: { ...data.config, maxSpots: 0 },
      credentials: {},
      revision: 5,
    }),
  );
});
