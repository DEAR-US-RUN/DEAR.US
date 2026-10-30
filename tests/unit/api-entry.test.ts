import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { describeError, redactSecret } from '../../server/errors';

describe('Vercel function entry point', () => {
  it('serves the API when the application loads', async () => {
    const { default: handler } = await import('../../api/index');
    expect((await request(handler).get('/api/index?__du_path=health')).status).toBe(200);
  });

  it('reports a startup failure as JSON instead of an opaque platform error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      vi.resetModules();
      vi.doMock('../../server/app', () => { throw new Error("Cannot find module 'example-dep'"); });
      const { default: handler } = await import('../../api/index');
      const response = await request(handler).get('/api/index?__du_path=health');
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('API_INIT_FAILED');
      expect(JSON.stringify(spy.mock.calls)).toContain('api_init_failed');
    } finally {
      spy.mockRestore();
      vi.doUnmock('../../server/app');
      vi.resetModules();
    }
  });

  it('redacts credentials that a provider error may echo', () => {
    expect(redactSecret('connect postgresql://user:secret@host/db failed')).toBe('connect postgresql://***@host/db failed');
    expect(redactSecret('https://x:token@example.com/a')).toBe('https://***@example.com/a');
    expect(describeError(new Error('Cannot find module pg')).errorClass).toBe('Error');
    expect(describeError({}).errorClass).toBe('Error');
  });
});
