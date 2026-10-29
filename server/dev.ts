import process from 'node:process';
import app from './app';
try { process.loadEnvFile('.env.local'); } catch { /* environment may be injected */ }
const port=Number(process.env.API_PORT||8787);
app.listen(port,'0.0.0.0',()=>console.log(`API listening on ${port}`));
