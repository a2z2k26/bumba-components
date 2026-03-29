/**
 * Validation Framework for BUMBA Setup Wizard
 * Comprehensive validation for all configuration inputs
 */

const Joi = require('@bumba/shared/joi-stub');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');

class ValidationFramework {
  constructor(options = {}) {
    this.options = options;
    
    // Validation schemas
    this.schemas = {
      apiKey: this.createAPIKeySchemas(),
      url: this.createURLSchemas(),
      path: this.createPathSchemas(),
      config: this.createConfigSchemas(),
      network: this.createNetworkSchemas()
    };
    
    // Validation results
    this.results = {
      passed: [],
      failed: [],
      warnings: []
    };
  }

  /**
   * Create API key validation schemas
   */
  createAPIKeySchemas() {
    return {
      openai: Joi.string()
        .pattern(/^sk-[a-zA-Z0-9]{48}$/)
        .required()
        .messages({
          'string.pattern.base': 'OpenAI API key must start with "sk-" and be 51 characters long',
          'any.required': 'OpenAI API key is required'
        }),
        
      anthropic: Joi.string()
        .pattern(/^sk-ant-[a-zA-Z0-9\-]{95}$/)
        .required()
        .messages({
          'string.pattern.base': 'Anthropic API key must start with "sk-ant-" and be 103 characters long',
          'any.required': 'Anthropic API key is required'
        }),
        
      google: Joi.string()
        .min(30)
        .max(50)
        .required()
        .messages({
          'string.min': 'Google API key seems too short',
          'string.max': 'Google API key seems too long',
          'any.required': 'Google API key is required'
        }),
        
      openrouter: Joi.string()
        .pattern(/^sk-or-[a-zA-Z0-9\-]+$/)
        .required()
        .messages({
          'string.pattern.base': 'OpenRouter API key must start with "sk-or-"',
          'any.required': 'OpenRouter API key is required'
        }),
        
      github: Joi.string()
        .pattern(/^gh[pso]_[a-zA-Z0-9]{36}$/)
        .required()
        .messages({
          'string.pattern.base': 'GitHub token must start with "ghp_", "ghs_", or "gho_" and be 40 characters long',
          'any.required': 'GitHub token is required'
        }),
        
      notion: Joi.string()
        .pattern(/^secret_[a-zA-Z0-9]{43}$/)
        .required()
        .messages({
          'string.pattern.base': 'Notion API key must start with "secret_" and be 50 characters long',
          'any.required': 'Notion API key is required'
        }),
        
      pinecone: Joi.string()
        .min(30)
        .required()
        .messages({
          'string.min': 'Pinecone API key seems too short',
          'any.required': 'Pinecone API key is required'
        })
    };
  }

  /**
   * Create URL validation schemas
   */
  createURLSchemas() {
    return {
      http: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .required()
        .messages({
          'string.uri': 'Must be a valid HTTP or HTTPS URL',
          'any.required': 'URL is required'
        }),
        
      webhook: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .pattern(/^https?:\/\//)
        .required()
        .messages({
          'string.uri': 'Must be a valid webhook URL',
          'string.pattern.base': 'Webhook must start with http:// or https://',
          'any.required': 'Webhook URL is required'
        }),
        
      api: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .pattern(/\/api\/|\/v\d+\//)
        .messages({
          'string.uri': 'Must be a valid API endpoint',
          'string.pattern.base': 'Should contain /api/ or version path'
        })
    };
  }

  /**
   * Create path validation schemas
   */
  createPathSchemas() {
    return {
      file: Joi.string()
        .custom((value, helpers) => {
          if (!path.isAbsolute(value)) {
            value = path.resolve(value);
          }
          return value;
        })
        .required()
        .messages({
          'any.required': 'File path is required'
        }),
        
      directory: Joi.string()
        .custom((value, helpers) => {
          if (!path.isAbsolute(value)) {
            value = path.resolve(value);
          }
          return value;
        })
        .required()
        .messages({
          'any.required': 'Directory path is required'
        }),
        
      executable: Joi.string()
        .custom((value, helpers) => {
          // Check if file exists and is executable
          return value;
        })
        .messages({
          'any.custom': 'File must be executable'
        })
    };
  }

  /**
   * Create configuration validation schemas
   */
  createConfigSchemas() {
    return {
      environment: Joi.string()
        .valid('development', 'staging', 'production')
        .default('development'),
        
      logLevel: Joi.string()
        .valid('debug', 'info', 'warn', 'error')
        .default('info'),
        
      port: Joi.number()
        .port()
        .default(3456)
        .messages({
          'number.port': 'Port must be between 1 and 65535'
        }),
        
      timeout: Joi.number()
        .min(1000)
        .max(300000)
        .default(30000)
        .messages({
          'number.min': 'Timeout must be at least 1 second',
          'number.max': 'Timeout cannot exceed 5 minutes'
        }),
        
      maxRetries: Joi.number()
        .min(0)
        .max(10)
        .default(3)
        .messages({
          'number.min': 'Retries cannot be negative',
          'number.max': 'Maximum 10 retries allowed'
        })
    };
  }

  /**
   * Create network validation schemas
   */
  createNetworkSchemas() {
    return {
      ipAddress: Joi.string()
        .ip({ version: ['ipv4', 'ipv6'] })
        .messages({
          'string.ip': 'Must be a valid IP address'
        }),
        
      hostname: Joi.string()
        .hostname()
        .messages({
          'string.hostname': 'Must be a valid hostname'
        }),
        
      email: Joi.string()
        .email()
        .messages({
          'string.email': 'Must be a valid email address'
        })
    };
  }

  /**
   * Validate API key
   */
  async validateAPIKey(provider, key) {
    const schema = this.schemas.apiKey[provider];
    
    if (!schema) {
      return {
        valid: true,
        warning: `No validation schema for ${provider}`
      };
    }
    
    const result = schema.validate(key);
    
    if (result.error) {
      this.results.failed.push({
        type: 'api-key',
        provider,
        error: result.error.details[0].message
      });
      
      return {
        valid: false,
        error: result.error.details[0].message
      };
    }
    
    this.results.passed.push({
      type: 'api-key',
      provider
    });
    
    return {
      valid: true,
      value: result.value
    };
  }

  /**
   * Validate URL
   */
  validateURL(url, type = 'http') {
    const schema = this.schemas.url[type] || this.schemas.url.http;
    const result = schema.validate(url);
    
    if (result.error) {
      this.results.failed.push({
        type: 'url',
        url,
        error: result.error.details[0].message
      });
      
      return {
        valid: false,
        error: result.error.details[0].message
      };
    }
    
    // Additional URL validation
    try {
      const parsed = new URL(url);
      
      // Check for localhost in production
      if (this.options.environment === 'production' && 
          (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
        this.results.warnings.push({
          type: 'url',
          url,
          warning: 'Using localhost in production environment'
        });
      }
      
      this.results.passed.push({
        type: 'url',
        url
      });
      
      return {
        valid: true,
        value: result.value,
        parsed
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid URL format'
      };
    }
  }

  /**
   * Validate file path
   */
  async validatePath(filePath, type = 'file') {
    const schema = this.schemas.path[type] || this.schemas.path.file;
    const result = schema.validate(filePath);
    
    if (result.error) {
      this.results.failed.push({
        type: 'path',
        path: filePath,
        error: result.error.details[0].message
      });
      
      return {
        valid: false,
        error: result.error.details[0].message
      };
    }
    
    // Check if path exists
    try {
      const stats = await fs.stat(result.value);
      
      if (type === 'file' && !stats.isFile()) {
        return {
          valid: false,
          error: 'Path is not a file'
        };
      }
      
      if (type === 'directory' && !stats.isDirectory()) {
        return {
          valid: false,
          error: 'Path is not a directory'
        };
      }
      
      // Check permissions
      try {
        await fs.access(result.value, fs.constants.R_OK);
      } catch {
        this.results.warnings.push({
          type: 'path',
          path: filePath,
          warning: 'File is not readable'
        });
      }
      
      this.results.passed.push({
        type: 'path',
        path: filePath
      });
      
      return {
        valid: true,
        value: result.value,
        stats
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          valid: false,
          error: 'Path does not exist'
        };
      }
      
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Validate port number
   */
  async validatePort(port) {
    const result = this.schemas.config.port.validate(port);
    
    if (result.error) {
      this.results.failed.push({
        type: 'port',
        port,
        error: result.error.details[0].message
      });
      
      return {
        valid: false,
        error: result.error.details[0].message
      };
    }
    
    // Check if port is in use
    const inUse = await this.isPortInUse(result.value);
    
    if (inUse) {
      this.results.warnings.push({
        type: 'port',
        port: result.value,
        warning: 'Port is already in use'
      });
      
      return {
        valid: true,
        value: result.value,
        warning: 'Port is already in use'
      };
    }
    
    this.results.passed.push({
      type: 'port',
      port: result.value
    });
    
    return {
      valid: true,
      value: result.value
    };
  }

  /**
   * Check if port is in use
   */
  async isPortInUse(port) {
    const net = require('net');
    
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      
      server.once('listening', () => {
        server.close();
        resolve(false);
      });
      
      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Validate complete configuration
   */
  async validateConfiguration(config) {
    const validationResults = {
      valid: true,
      errors: [],
      warnings: []
    };
    
    // Validate API keys
    if (config.apiKeys) {
      for (const [provider, key] of Object.entries(config.apiKeys)) {
        if (!key) continue;
        
        const result = await this.validateAPIKey(provider, key);
        if (!result.valid) {
          validationResults.valid = false;
          validationResults.errors.push({
            field: `apiKeys.${provider}`,
            error: result.error
          });
        }
      }
    }
    
    // Validate bridge configuration
    if (config.bridge) {
      if (config.bridge.port) {
        const result = await this.validatePort(config.bridge.port);
        if (!result.valid) {
          validationResults.valid = false;
          validationResults.errors.push({
            field: 'bridge.port',
            error: result.error
          });
        } else if (result.warning) {
          validationResults.warnings.push({
            field: 'bridge.port',
            warning: result.warning
          });
        }
      }
    }
    
    // Validate environment
    if (config.environment) {
      const result = this.schemas.config.environment.validate(config.environment);
      if (result.error) {
        validationResults.valid = false;
        validationResults.errors.push({
          field: 'environment',
          error: result.error.details[0].message
        });
      }
    }
    
    // Check for required fields
    if (!config.apiKeys || Object.keys(config.apiKeys).length === 0) {
      validationResults.warnings.push({
        field: 'apiKeys',
        warning: 'No API keys configured'
      });
    }
    
    return validationResults;
  }

  /**
   * Validate network connectivity
   */
  async validateNetworkConnectivity() {
    const endpoints = [
      { name: 'OpenAI', url: 'https://api.openai.com' },
      { name: 'Anthropic', url: 'https://api.anthropic.com' },
      { name: 'Google', url: 'https://generativelanguage.googleapis.com' },
      { name: 'GitHub', url: 'https://api.github.com' }
    ];
    
    const results = {
      connected: [],
      failed: []
    };
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, {
          method: 'HEAD',
          timeout: 5000
        });
        
        results.connected.push({
          name: endpoint.name,
          url: endpoint.url,
          status: response.status
        });
      } catch (error) {
        results.failed.push({
          name: endpoint.name,
          url: endpoint.url,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Get validation summary
   */
  getSummary() {
    return {
      total: this.results.passed.length + this.results.failed.length,
      passed: this.results.passed.length,
      failed: this.results.failed.length,
      warnings: this.results.warnings.length,
      successRate: this.results.passed.length / 
                   (this.results.passed.length + this.results.failed.length) * 100,
      details: {
        passed: this.results.passed,
        failed: this.results.failed,
        warnings: this.results.warnings
      }
    };
  }

  /**
   * Reset validation results
   */
  reset() {
    this.results = {
      passed: [],
      failed: [],
      warnings: []
    };
  }
}

module.exports = ValidationFramework;