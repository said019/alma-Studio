import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderPage } from "@/test/renderPage";
import api from "@/lib/api";
import { TotalPassClassQuota } from "./TotalPassClassQuota";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn() } }));
const path = "/admin/classes/test/platforms/totalpass/quota";
it.each([
  { quota: 1, booked: 1, action: "Agregar", next: 2, disabled: "Quitar" },
  { quota: 6, booked: 0, action: "Quitar", next: 5, disabled: "Agregar" },
])("ajusta el cupo desde $quota respetando sus límites", async ({ quota, booked, action, next, disabled }) => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: { quota, capacity: 6, booked, syncing: true } } });
  vi.mocked(api.put).mockResolvedValue({});
  renderPage(<TotalPassClassQuota classId="test" />);
  expect(await screen.findByRole("button", { name: new RegExp(disabled) })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(action) }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith(path, { quota: next, expectedQuota: quota }));
});
it("bloquea los ajustes en clases pendientes de vincular", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: { quota: 2, capacity: 6, booked: 0, pending: true } } });
  renderPage(<TotalPassClassQuota classId="pendiente" />);
  expect(await screen.findByText("Clase pendiente de vincular")).toBeVisible();
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
});
