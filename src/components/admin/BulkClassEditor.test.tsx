import { beforeEach, afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { BulkClassEditor } from './BulkClassEditor';
import { renderAdmin } from '@/test/admin-harness';
vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import api from '@/lib/api';
const mock = api as unknown as { get: Mock; post: Mock; put: Mock };
const base = { class_type_id: 'type1', class_type_name: 'Reformer', instructor_id: 'coach1', instructor_name: 'Ana', max_capacity: 6, current_bookings: 0, status: 'scheduled' };
const rows = [
  { ...base, id: 'c1', start_time: '2026-10-05T10:00:00-06:00', end_time: '2026-10-05T10:50:00-06:00' },
  { ...base, id: 'c2', start_time: '2026-10-05T11:00:00-06:00', end_time: '2026-10-05T11:50:00-06:00' },
  { ...base, id: 'past', start_time: '2026-10-01T10:00:00-06:00', end_time: '2026-10-01T10:50:00-06:00' },
];
const reviewed = { data: { count: 2, classes: rows.slice(0, 2).map(row => ({ id: row.id, date: '2026-10-05', before: row, after: { ...row, max_capacity: 8 } })), expectedVersions: { c1: 'v1', c2: 'v2' } } };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-03T12:00:00-06:00'));
  mock.get.mockReset().mockResolvedValue({ data: { data: rows } });
  mock.post.mockReset().mockResolvedValue({ data: reviewed });
  mock.put.mockReset().mockResolvedValue({ data: { ...reviewed, committed: true, warnings: [] } });
});
afterEach(() => vi.useRealTimers());
async function open() {
  renderAdmin(<BulkClassEditor startDate="2026-10-01" endDate="2026-10-07" types={[{ id: 'type1', name: 'Reformer' }]} instructors={[{ id: 'coach1', displayName: 'Ana' }]} />, { route: '/admin/classes' });
  fireEvent.click(screen.getByRole('button', { name: 'Editar varias clases' }));
  await screen.findByRole('button', { name: 'Seleccionar todas las filtradas (2)' });
}
async function setupCapacity() {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar todas las filtradas (2)' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Cambiar cupo' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Nuevo cupo' }), { target: { value: '8' } });
}
describe('Edición masiva de clases', () => {
  it('mantiene la hora civil de CDMX cuando la API entrega fechas sin zona', async () => {
    mock.get.mockResolvedValue({ data: { data: rows.map(row => ({ ...row, start_time: row.start_time.replace('-06:00', ''), end_time: row.end_time.replace('-06:00', '') })) } });
    await open();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar 2026-10-05 10:00 Reformer' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar 2026-10-05 11:00 Reformer' })).toBeEnabled();
  });
  it('conserva el aviso de espera posterior al guardado confirmado', async () => {
    mock.put.mockResolvedValue({ data: { ...reviewed, committed: true, warnings: ['Revisa la lista de espera.'] } });
    await setupCapacity(); fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar cambios a 2 clases' }));
    expect(await screen.findByText(/Cambios aplicados a 2 clases.*Revisa la lista de espera/)).toBeInTheDocument();
  });
  it('sólo selecciona futuras y no escribe hasta revisar y aplicar explícitamente', async () => {
    await setupCapacity();
    expect(screen.getByRole('checkbox', { name: /Seleccionar 2026-10-01/ })).toBeDisabled();
    expect(mock.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar cambios a 2 clases' }));
    await waitFor(() => expect(mock.put).toHaveBeenCalledWith('/admin/classes/bulk', { classIds: ['c1', 'c2'], changes: { maxCapacity: 8 }, expectedVersions: { c1: 'v1', c2: 'v2' } }));
    expect(await screen.findByText('Cambios aplicados a 2 clases.')).toBeInTheDocument();
  });
  it('cambiar un filtro borra selección y vista previa', async () => {
    await setupCapacity(); fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }));
    await screen.findByRole('button', { name: 'Aplicar cambios a 2 clases' });
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '10:00' } });
    expect(screen.getByText('0 clases seleccionadas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aplicar cambios a 2 clases' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revisar cambios' })).toBeDisabled();
  });
  it('un nuevo valor exige revisar otra vez y un campo apagado no se envía', async () => {
    await setupCapacity(); fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }));
    await screen.findByRole('button', { name: 'Aplicar cambios a 2 clases' });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Nuevo cupo' }), { target: { value: '7' } });
    expect(screen.queryByRole('button', { name: 'Aplicar cambios a 2 clases' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cambiar cupo' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cambiar notas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }));
    await waitFor(() => expect(mock.post).toHaveBeenLastCalledWith('/admin/classes/bulk/preview', { classIds: ['c1', 'c2'], changes: { notes: '' } }));
  });
  it('muestra conflictos por clase y no ofrece aplicar', async () => {
    mock.post.mockRejectedValue({ response: { data: { message: 'No se aplicó ningún cambio.', conflicts: [{ id: 'c1', message: 'La instructora tiene otra clase.' }] } } });
    await setupCapacity(); fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }));
    expect(await screen.findByText(/2026-10-05 10:00 · Reformer: La instructora/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aplicar cambios a/ })).not.toBeInTheDocument(); expect(mock.put).not.toHaveBeenCalled();
  });
  it('rechaza una respuesta incompleta en vez de habilitar cambios sin versiones', async () => {
    mock.post.mockResolvedValue({ data: { data: { ...reviewed.data, expectedVersions: {} } } });
    await setupCapacity(); fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar');
    expect(screen.queryByRole('button', { name: /Aplicar cambios a/ })).not.toBeInTheDocument();
  });
  it('un conflicto al aplicar descarta la revisión anterior y obliga a revisar otra vez', async () => {
    mock.put.mockRejectedValue({ response: { data: { message: 'Las clases cambiaron desde la vista previa.' } } });
    await setupCapacity(); fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar cambios a 2 clases' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Las clases cambiaron');
    expect(screen.queryByRole('button', { name: /Aplicar cambios a/ })).not.toBeInTheDocument();
  });
});
