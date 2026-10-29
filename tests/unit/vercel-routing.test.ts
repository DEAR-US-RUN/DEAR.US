import { describe,it,expect } from 'vitest';
import request from 'supertest';
import handler from '../../api/index';
import config from '../../vercel.json';
describe('Vercel API adapter',()=>{
 it('routes nested API paths to the single serverless function',async()=>{
  expect(config.rewrites[0].source).toBe('/api/:path*');expect(config.rewrites[0].destination).toContain('__du_path');
  expect((await request(handler).get('/api/index?__du_path=health')).status).toBe(200);
  // A nested authenticated endpoint reaches auth middleware instead of the SPA or a platform 404.
  expect([401,503]).toContain((await request(handler).get('/api/index?__du_path=diaries/00000000-0000-4000-8000-000000000000/entries')).status);
 });
});
