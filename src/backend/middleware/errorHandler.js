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
  } else if (err.code === '28P01' || err.code === '3D000') {
    statusCode = 503;
    userMessage = 'Database connection failed.';
  } else if (statusCode >= 500) {
    userMessage = 'A server error occurred. Try again later.';
  }

  if (statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: userMessage,
    ...(err.code && statusCode < 500 && typeof err.code === 'string' && { code: err.code }),
    ...(process.env.NODE_ENV !== 'production' &&
      statusCode >= 500 && {
        details: err.message,
        stack: err.stack,
      }),
  });
};
