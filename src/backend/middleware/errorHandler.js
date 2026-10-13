import { incidentFromRequest, isDatabaseDown } from '../services/incidents.js';
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'File is too large',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let statusCode = err.statusCode || err.status || 500;
  let userMessage = err.message || 'Internal server error';

  if (err.name === 'MulterError') {
    statusCode = 400;
    userMessage = MULTER_MESSAGES[err.code] || err.message;
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    userMessage = 'Malformed JSON body';
  } else if (statusCode >= 500 && isDatabaseDown(err)) {
    statusCode = 503;
    userMessage = 'The database is temporarily unavailable.';
  } else if (statusCode >= 500) {
    userMessage = 'A server error occurred. Try again later.';
  }

  // Server errors become incidents an administrator can find by the ids the person sees.
  let serverCode = null;
  if (statusCode >= 500) {
    serverCode = statusCode === 503 && isDatabaseDown(err) ? 'DB_UNAVAILABLE' : 'SERVER_ERROR';
    console.error(`[${req.method} ${req.originalUrl}] request=${req.requestId || '-'}`, err);
    incidentFromRequest(req, statusCode, serverCode, err);
  }

  res.status(statusCode).json({
    success: false,
    error: userMessage,
    ...(err.code && statusCode < 500 && typeof err.code === 'string' && { code: err.code }),
    ...(serverCode && { code: serverCode, requestId: req.requestId }),
    // Structured context for client errors, e.g. where a file is used.
    ...(statusCode < 500 && err.details && typeof err.details === 'object' && { info: err.details }),
    ...(process.env.NODE_ENV !== 'production' &&
      statusCode >= 500 && {
        details: err.message,
        stack: err.stack,
      }),
  });
};
