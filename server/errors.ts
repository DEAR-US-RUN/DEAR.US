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
  // Never log request bodies, query strings, tokens, keys, SQL, or diary contents.
  const errorClass=err?.constructor?.name || 'Error';
  console.error(JSON.stringify({level:'error',event:'request_failed',errorClass}));
  await reportOperationalFailure(errorClass);
  res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Something went wrong. Please try again.'}});
};
