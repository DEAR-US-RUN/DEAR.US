import { defineConfig } from '@playwright/test';
const baseURL=process.env.E2E_BASE_URL||'http://127.0.0.1:5173';
if(process.env.E2E_EMULATOR&&!['localhost','127.0.0.1','[::1]'].includes(new URL(baseURL).hostname))throw new Error('Emulator journeys only permit a local test site.');
export default defineConfig({
 testDir:'tests/e2e',testMatch:'**/*.spec.ts',timeout:45000,expect:{timeout:10000},fullyParallel:false,
 use:{baseURL,headless:true,trace:'retain-on-failure'},
 reporter:'list',
});
