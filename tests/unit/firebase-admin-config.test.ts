import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { generateKeyPairSync } from 'node:crypto';

/** A private key is generated per run so no credential is ever stored in the repository. */
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey as string;

async function probe(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const { authenticate } = await import('../../server/auth');
  const { errorHandler } = await import('../../server/errors');
  const app = express();
  app.get('/probe', authenticate(), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return request(app).get('/probe').set('Authorization', 'Bearer not-a-token');
}

const base = { NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'dearr-us', FIREBASE_CLIENT_EMAIL: 'svc@dearr-us.iam.gserviceaccount.com' };

describe('Firebase Admin configuration faults', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { spy.mockRestore(); });

  it('reports an unparseable service-account key as a configuration fault, not an expired session', async () => {
    const response = await probe({ ...base, FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, ' ') });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('NOT_CONFIGURED');
    expect(JSON.stringify(spy.mock.calls)).toContain('FIREBASE_CREDENTIAL_NOT_CONFIGURED');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('PRIVATE KEY');
  });

  it('reports a double-escaped key (literal \\n turned into \\\\n) as a configuration fault', async () => {
    const response = await probe({ ...base, FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, '\\\\n') });
    expect(response.status).toBe(503);
  });

  it('reports missing Admin credentials as a configuration fault', async () => {
    const response = await probe({ ...base, FIREBASE_PRIVATE_KEY: undefined });
    expect(response.status).toBe(503);
    expect(JSON.stringify(spy.mock.calls)).toContain('FIREBASE_NOT_CONFIGURED');
  });

  it('treats a bad token with a valid key as an authentication failure', async () => {
    const response = await probe({ ...base, FIREBASE_PRIVATE_KEY: privateKey });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
