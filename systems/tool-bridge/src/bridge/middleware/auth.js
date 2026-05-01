/**
 * Authentication Middleware
 * Handles JWT and API key authentication
 */

const jwt = require('jsonwebtoken');

class AuthMiddleware {
  constructor(config) {
    this.config = config;
    this.jwtSecret = config.server?.auth?.jwt?.secret;
    this.jwtExpiry = config.server?.auth?.jwt?.expiresIn || '24h';
    this.masterKey = config.security?.apiKeys?.masterKey;
  }

  verify(req, res, next) {
    // Skip auth if disabled
    if (!this.config.server?.auth?.enabled) {
      return next();
    }

    // Check for authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        error: 'No authorization header provided'
      });
    }

    // Check Bearer token
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Check if it's the master API key
      if (token === this.masterKey) {
        req.auth = { type: 'master', scope: 'full' };
        return next();
      }

      // Try to verify as JWT
      try {
        const decoded = jwt.verify(token, this.jwtSecret);
        req.auth = { type: 'jwt', ...decoded };
        return next();
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          return res.status(401).json({
            error: 'Token expired'
          });
        } else if (error.name === 'JsonWebTokenError') {
          return res.status(401).json({
            error: 'Invalid token'
          });
        }
      }
    }

    // Check API key header
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      if (apiKey === this.masterKey) {
        req.auth = { type: 'apikey', scope: 'full' };
        return next();
      }

      // Check if it's a valid client key
      if (this.validateClientKey(apiKey)) {
        req.auth = { type: 'client', key: apiKey };
        return next();
      }
    }

    return res.status(401).json({
      error: 'Invalid authentication credentials'
    });
  }

  generateToken(payload) {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiry
    });
  }

  validateClientKey(key) {
    // TODO: Implement client key validation
    // For now, accept any key that looks valid
    return key && key.length >= 32;
  }

  // Generate a new API key
  generateApiKey() {
    const crypto = require('crypto');
    return 'aib_' + crypto.randomBytes(32).toString('hex');
  }
}

module.exports = AuthMiddleware;