/**
 * Environment and Configuration Validators
 * Validates Tool Bridge configuration and environment
 */

async function validateEnvironment(config) {
  const errors = [];
  const warnings = [];

  // Check if any API is configured (not required for initial setup)
  const apis = config.get('apis') || {};
  const hasEnabledAPI = Object.values(apis).some((api) =>
    api && typeof api === 'object' && api.enabled && api.apiKey
  );

  if (!hasEnabledAPI) {
    warnings.push('No AI APIs configured yet - run "tool-bridge setup" to configure');
  }

  // Check server configuration
  const server = config.get('server');
  if (!server) {
    errors.push('Server configuration missing');
  } else {
    if (!server.port) {
      errors.push('Server port not configured');
    }
    if (!server.host) {
      errors.push('Server host not configured');
    }
  }

  // Check if running in Docker
  if (process.env.DOCKER_CONTAINER) {
    if (server?.host === 'localhost') {
      warnings.push('Running in Docker - consider using 0.0.0.0 as host');
    }
  }

  // Validate port range
  if (server?.port) {
    const port = parseInt(server.port);
    if (port < 1 || port > 65535) {
      errors.push(`Invalid port number: ${port}`);
    }
    if (port < 1024 && process.platform !== 'win32') {
      warnings.push(`Port ${port} requires root privileges on Unix systems`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

function validateAPIKey(key, provider) {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'API key is required' };
  }

  // Provider-specific validation
  switch (provider) {
  case 'openai':
    if (!key.startsWith('sk-')) {
      return { valid: false, error: 'OpenAI API key should start with "sk-"' };
    }
    break;
  case 'anthropic':
    if (!key.startsWith('sk-ant-')) {
      return { valid: false, error: 'Anthropic API key should start with "sk-ant-"' };
    }
    break;
  case 'google':
    // Google API keys don't have a specific format
    if (key.length < 20) {
      return { valid: false, error: 'Google API key seems too short' };
    }
    break;
  }

  return { valid: true };
}

function validateCORS(corsConfig) {
  const errors = [];

  if (!corsConfig) {
    return { valid: true }; // CORS is optional
  }

  if (corsConfig.enabled && corsConfig.origins) {
    if (!Array.isArray(corsConfig.origins)) {
      errors.push('CORS origins must be an array');
    } else {
      corsConfig.origins.forEach((origin) => {
        if (typeof origin !== 'string') {
          errors.push(`Invalid CORS origin: ${origin}`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateEnvironment,
  validateAPIKey,
  validateCORS
};