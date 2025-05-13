// src/middleware/errorHandler.js

/**
 * Centralized Express error-handling middleware.
 * Catches errors passed via next(err) and sends a JSON response.
 */
export function errorHandler(err, req, res, next) {
    const statusCode = res.statusCode && res.statusCode !== 200
      ? res.statusCode
      : 500;
  
    if (process.env.NODE_ENV === 'development') {
      console.error(err.stack);
    }
  
    res.status(statusCode).json({
      error: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }
  
  /**
   * Wrapper to catch errors in async route handlers
   */
  export function asyncHandler(fn) {
    return function (req, res, next) {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }