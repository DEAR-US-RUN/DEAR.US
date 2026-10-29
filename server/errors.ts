import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { reportOperationalFailure } from './monitoring';
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const missing = () => new AppError(404, 'NOT_FOUND', 'This resource is unavailable.');
export const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message);
export const errorHandler: ErrorRequestHandler = async (err, _req, res, _next) => {
  if (err instanceof AppError) { res.status(err.status).json({error:{code:err.code,message:err.message}}); return; }
  if (err instanceof ZodError || err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    res.status(400).json({error:{code:'INVALID_INPUT',message:'Please check your input and try again.'}}); return;
  }
  if (err?.code === '23514' || err?.code === '23505') {
    res.status(409).json({error:{code:'CONFLICT',message:'This action conflicts with the current state. Please refresh and try again.'}}); return;
  }
  if (typeof err?.message === 'string' && (err.message.endsWith('_NOT_CONFIGURED') || err.message === 'DATABASE_NOT_CONFIGURED')) {
    res.status(503).json({error:{code:'NOT_CONFIGURED',message:'This service has not been configured yet.'}}); return;
  }
  // Only allowlisted failure categories are logged; never raw provider messages.
  const databaseFailures: Record<string, [string, string]> = {
    '42P01': ['DATABASE_SCHEMA_MISSING', 'Account setup is unavailable: the database migration must be applied by the administrator.'],
    '42703': ['DATABASE_SCHEMA_OUTDATED', 'Account setup is unavailable: the database schema must be updated by the administrator.'],
    '28P01': ['DATABASE_AUTH_FAILED', 'Account setup is unavailable: the administrator must update the database credentials.'],
    '42501': ['DATABASE_PERMISSION_DENIED', 'Account setup is unavailable: the administrator must apply the database runtime-role grants.'],
    '3D000': ['DATABASE_UNAVAILABLE', 'Account setup is unavailable: the configured database does not exist.'],
    'ECONNREFUSED': ['DATABASE_UNAVAILABLE', 'The database is temporarily unavailable. Please retry later.'],
    'ETIMEDOUT': ['DATABASE_UNAVAILABLE', 'The database connection timed out. Please retry later.'],
    'ENOTFOUND': ['DATABASE_UNAVAILABLE', 'Account setup is unavailable: the administrator must check the database host.'],
  };
  const failure = databaseFailures[String(err?.code)];
  if (failure) {
    console.error(JSON.stringify({level:'error',event:'request_failed',category:failure[0]}));
    res.status(503).json({error:{code:failure[0],message:failure[1]}}); return;
  }
  // Never log request bodies, query strings, tokens, keys, SQL, or diary contents.
  const errorClass=err?.constructor?.name || 'Error';
  console.error(JSON.stringify({level:'error',event:'request_failed',errorClass}));
  await reportOperationalFailure(errorClass);
  res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Something went wrong. Please try again.'}});
};
