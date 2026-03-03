const mongoose = require('mongoose');

const errorHandler = (error, req, res, next) => {
  console.error('Error:', error);

  // Default error response
  let statusCode = 500;
  let message = 'Internal server error';
  let details = null;

  // Mongoose validation error
  if (error instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation error';
    details = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));
  }

  // Mongoose duplicate key error
  if (error.code === 11000) {
    statusCode = 400;
    message = 'Duplicate entry';
    const field = Object.keys(error.keyPattern)[0];
    details = `${field} already exists`;
  }

  // Mongoose cast error
  if (error instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = 'Invalid ID format';
    details = error.message;
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Custom API errors
  if (error.statusCode) {
    statusCode = error.statusCode;
    message = error.message;
    details = error.details;
  }

  // Send error response
  const errorResponse = {
    success: false,
    message,
    ...(details && { details }),
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack,
      error: error.toString()
    })
  };

  res.status(statusCode).json(errorResponse);
};

// Custom error class
class APIError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'APIError';
  }
}

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  APIError,
  asyncHandler
};