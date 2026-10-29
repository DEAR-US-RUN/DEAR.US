import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../server/errors';
import config from '../../vercel.json';

describe('login deployment safeguards', () => {
  it('permits the Google authentication script without relaxing script policy globally', () => {
    const policy=config.headers.flatMap(h=>h.headers).find(h=>h.key==='Content-Security-Policy')!.value;
    const scripts=policy.split(';').find(d=>d.trim().startsWith('script-src '))!;
    expect(scripts).toContain('https://apis.google.com');
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain('https:;');
  });
  it.each([
    ['42P01','DATABASE_SCHEMA_MISSING'],
    ['28P01','DATABASE_AUTH_FAILED'],
    ['42501','DATABASE_PERMISSION_DENIED'],
  ])('reports %s safely so account sync failures can be fixed', async (code, expected) => {
    const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
    try {
      const app=express();
      app.get('/',()=>{throw Object.assign(new Error('secret SQL password token'),{code});});
      app.use(errorHandler);
      const response=await request(app).get('/');
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe(expected);
      expect(JSON.stringify(response.body)).not.toContain('secret SQL');
      expect(JSON.stringify(spy.mock.calls)).not.toContain('secret SQL');
    } finally {spy.mockRestore();}
  });
});
