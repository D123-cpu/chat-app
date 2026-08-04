// Handles requests to routes that don't exist
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  res.status(404);
  next(error); // Passes the error to errorHandler below
};

// Catches all errors passed via next(error) anywhere in the app
const errorHandler = (err, req, res, next) => {
  // If status was already set (e.g. 404), keep it. Otherwise default to 500.
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

module.exports = { notFound, errorHandler };