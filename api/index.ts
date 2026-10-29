import type { IncomingMessage,ServerResponse } from 'node:http';
import app from '../server/app';
/** Vercel rewrites all /api/* requests here. Preserve the original nested path
 * even when the platform supplies the rewrite destination as req.url. */
export default function handler(req:IncomingMessage,res:ServerResponse) {
  const original=new URL(req.url||'/api','http://internal.invalid');
  if(original.pathname==='/api' || original.pathname==='/api/index') {
    const path=original.searchParams.get('__du_path');
    if(path && /^[A-Za-z0-9/_-]+$/.test(path)) {
      original.searchParams.delete('__du_path');
      req.url=`/api/${path}${original.search}`;
    }
  }
  return app(req,res);
}
