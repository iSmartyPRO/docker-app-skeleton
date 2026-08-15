export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  const statusCode = err.statusCode || err.status || 500;

  let userMessage = err.message || 'Internal server error';

  if (err.code === '28P01' || err.code === '3D000') {
    userMessage = 'Database connection failed.';
  } else if (statusCode === 500) {
    userMessage = 'A server error occurred. Try again later.';
  }

  res.status(statusCode).json({
    success: false,
    error: userMessage,
    ...(process.env.NODE_ENV !== 'production' && {
      details: err.message,
      stack: err.stack,
    }),
  });
};
