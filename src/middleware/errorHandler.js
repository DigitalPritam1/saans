import { ZodError } from 'zod';

/**
 * Central error handler middleware.
 * Ensures stack traces are never exposed to clients.
 */
export function errorHandler(err, req, res, _next) {
  // Log server-side for observability
  console.error(`[ERROR] ${req.method} ${req.url}:`, err.message || err);

  // Handle Zod schema validation errors
  if (err instanceof ZodError) {
    const issues = err.issues || err.errors || [];
    return res.status(400).json({
      error: 'Validation failed',
      details: issues.map(e => ({
        field: Array.isArray(e.path) ? e.path.join('.') : '',
        message: e.message
      }))
    });
  }

  // Handle malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Malformed JSON payload'
    });
  }

  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload exceeds 10kb limit'
    });
  }

  const statusCode = err.statusCode || (err.status && typeof err.status === 'number' ? err.status : 500);
  
  // In production or default 500, avoid leaking sensitive internal details
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    error: message
  });
}
