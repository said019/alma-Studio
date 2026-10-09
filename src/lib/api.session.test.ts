import { beforeEach, describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import api from './api';

beforeEach(() => { localStorage.clear(); });
describe('API session identity', () => {
  it.each([true, false])('401 clears only the token used by the request; newer=%s', async (newer) => {
    localStorage.setItem('auth_token', 'old-token');
    let rejectRequest!: () => void;
    const pending = api.get('/auth/me', { adapter: (config) => new Promise((_, reject) => {
      rejectRequest = () => reject(new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
        status: 401, statusText: 'Unauthorized', headers: {}, data: {}, config,
      }));
    }) });
    const rejected = pending.catch(error => error);
    await new Promise(resolve => setTimeout(resolve, 0));
    if (newer) localStorage.setItem('auth_token', 'new-token');
    rejectRequest();
    expect((await rejected).response.status).toBe(401);
    expect(localStorage.getItem('auth_token')).toBe(newer ? 'new-token' : null);
  });
});
