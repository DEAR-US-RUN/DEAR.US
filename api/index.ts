import type { IncomingMessage, ServerResponse } from 'node:http';
import { describeError } from '../server/errors';
type Listener = (req: IncomingMessage, res: ServerResponse) => unknown;

let listener: Listener | null = null;
let loading: Promise<Listener> | null = null;
let initFailure: ReturnType<typeof describeError> | null = null;

/** The Express application is imported on the first request rather than at module scope, so a
 * failure while loading it (a missing module, an incomplete bundle, an unsupported runtime) is
 * reported as a JSON error plus one logged category instead of an opaque platform 500 that
 * leaves no application log entry. */
function load() {
  if (!loading) {
    loading = import('../server/app')
      .then(module => {
        const app = (module.default ?? module.createApp()) as Listener;
        listener = app;
        return app;
      })
      .catch(error => {
        initFailure = describeError(error);
        console.error(JSON.stringify({ level: 'error', event: 'api_init_failed', ...initFailure }));
        throw error;
      });
  }
  return loading;
}

function sendJson(res: ServerResponse, status: number, code: string, message: string) {
  if (res.headersSent) { res.end(); return; }
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: { code, message } }));
}

function dispatch(app: Listener, req: IncomingMessage, res: ServerResponse) {
  try {
    // Vercel rewrites all /api/* requests here. Preserve the original nested path even when the
    // platform supplies the rewrite destination as req.url.
    const original = new URL(req.url || '/api', 'http://internal.invalid');
    if (original.pathname === '/api' || original.pathname === '/api/index') {
      const path = original.searchParams.get('__du_path');
      if (path && /^[A-Za-z0-9/_-]+$/.test(path)) {
        original.searchParams.delete('__du_path');
        req.url = `/api/${path}${original.search}`;
      }
    }
    return app(req, res);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'request_failed', category: 'API_HANDLER_FAILED', ...describeError(error) }));
    return sendJson(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (listener) return dispatch(listener, req, res);
  if (initFailure) {
    console.error(JSON.stringify({ level: 'error', event: 'request_failed', category: 'API_INIT_FAILED', ...initFailure }));
    return sendJson(res, 500, 'API_INIT_FAILED', 'The API failed to start. The administrator must check the deployment logs.');
  }
  // Cold start: the invocation stays open until the response ends, so the reply may be sent
  // after this handler returns.
  void load()
    .then(app => dispatch(app, req, res))
    .catch(() => sendJson(res, 500, 'API_INIT_FAILED', 'The API failed to start. The administrator must check the deployment logs.'));
}
