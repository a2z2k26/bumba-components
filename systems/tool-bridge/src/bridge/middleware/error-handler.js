/**
 * Error Handler Middleware
 * Centralized error handling for the Bridge server
 */

class ErrorHandler {
  static handle(err, req, res, _next) {
    // Log error
    console.error('Bridge Error:', {
      path: req.path,
      method: req.method,
      error: err.message,
      stack: err.stack
    });

    // Increment error metrics
    if (this.metrics) {
      this.metrics.errors++;
    }

    // Determine status code
    let status = err.status || 500;
    let message = err.message || 'Internal server error';
    const details = {};

    // Handle specific error types
    if (err.name === 'ValidationError') {
      status = 400;
      details.validation = err.errors;
    } else if (err.name === 'UnauthorizedError') {
      status = 401;
      message = 'Unauthorized';
    } else if (err.code === 'ECONNREFUSED') {
      status = 503;
      message = 'Service temporarily unavailable';
    } else if (err.response) {
      // Error from upstream API
      status = err.response.status || 502;
      message = err.response.data?.error?.message || err.message;
      details.provider = err.provider;
    }

    // Send error response
    res.status(status).json({
      error: {
        message,
        type: err.name || 'Error',
        code: err.code,
        ...details
      },
      timestamp: new Date().toISOString(),
      path: req.path
    });
  }

  static notFound(req, res) {
    res.status(404).json({
      error: {
        message: 'Endpoint not found',
        path: req.path,
        method: req.method
      }
    });
  }

  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

module.exports = ErrorHandler;