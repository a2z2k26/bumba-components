/**
 * Configuration Schema for BUMBA Setup
 * Defines all configuration options and their validation rules
 */

const Joi = require('@bumba/shared/joi-stub');

// API Key Schemas
const apiKeySchemas = {
  openai: Joi.string().pattern(/^sk-[a-zA-Z0-9]{48}$/).optional(),
  anthropic: Joi.string().pattern(/^sk-ant-[a-zA-Z0-9\-]{95}$/).optional(),
  google: Joi.string().optional(),
  openrouter: Joi.string().pattern(/^sk-or-[a-zA-Z0-9\-]+$/).optional(),
  github: Joi.string().pattern(/^gh[pso]_[a-zA-Z0-9]{36}$/).optional(),
  notion: Joi.string().pattern(/^secret_[a-zA-Z0-9]{43}$/).optional(),
  pinecone: Joi.string().optional(),
  deepseek: Joi.string().optional(),
  qwen: Joi.string().optional(),
  kimi: Joi.string().optional()
};

// MCP Server Configuration Schema
const mcpServerSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  command: Joi.string().required(),
  args: Joi.array().items(Joi.string()).optional(),
  env: Joi.object().pattern(Joi.string(), Joi.string()).optional()
});

// Bridge Configuration Schema
const bridgeSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  port: Joi.number().port().default(3456),
  host: Joi.string().default('127.0.0.1'),
  sessionToken: Joi.string().optional(),
  rateLimitPerMinute: Joi.number().min(1).max(1000).default(100),
  cacheEnabled: Joi.boolean().default(true),
  cacheTTL: Joi.number().min(0).default(300000)
});

// Main Configuration Schema
const configSchema = Joi.object({
  // Environment
  environment: Joi.string().valid('development', 'staging', 'production').default('development'),
  
  // API Keys
  apiKeys: Joi.object(apiKeySchemas),
  
  // MCP Servers
  mcpServers: Joi.object({
    filesystem: mcpServerSchema,
    memory: mcpServerSchema,
    github: mcpServerSchema,
    notion: mcpServerSchema,
    fetch: mcpServerSchema,
    serena: mcpServerSchema,
    semgrep: mcpServerSchema,
    brave: mcpServerSchema
  }).default({}),
  
  // Bridge Configuration
  bridge: bridgeSchema,
  
  // BUMBA Settings
  bumba: Joi.object({
    defaultModel: Joi.string().default('gpt-4-turbo'),
    enableDynamicSwitching: Joi.boolean().default(true),
    maxSpecialists: Joi.number().min(1).max(20).default(10),
    tokenLimit: Joi.number().min(1000).default(1000000),
    telemetry: Joi.boolean().default(false),
    logLevel: Joi.string().valid('debug', 'info', 'warn', 'error').default('info')
  }),
  
  // Security
  security: Joi.object({
    encryptKeys: Joi.boolean().default(true),
    auditLogging: Joi.boolean().default(true),
    backupOnChange: Joi.boolean().default(true)
  }),
  
  // Metadata
  metadata: Joi.object({
    version: Joi.string().default('1.0.0'),
    lastUpdated: Joi.date().iso().default(() => new Date().toISOString()),
    setupCompleted: Joi.boolean().default(false)
  })
});

// Configuration State Manager
class ConfigurationState {
  constructor() {
    this.config = {
      environment: 'development',
      apiKeys: {},
      mcpServers: {},
      bridge: {
        enabled: false,
        port: 3456,
        host: '127.0.0.1'
      },
      bumba: {
        defaultModel: 'gpt-4-turbo',
        enableDynamicSwitching: true
      },
      security: {
        encryptKeys: true,
        auditLogging: true
      },
      metadata: {
        version: '1.0.0',
        setupCompleted: false
      }
    };
  }

  validate() {
    const { error, value } = configSchema.validate(this.config);
    if (error) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
    this.config = value;
    return true;
  }

  set(path, value) {
    const keys = path.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    return this.validate();
  }

  get(path) {
    const keys = path.split('.');
    let current = this.config;
    
    for (const key of keys) {
      if (current[key] === undefined) {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  }

  toJSON() {
    return JSON.stringify(this.config, null, 2);
  }

  fromJSON(json) {
    this.config = JSON.parse(json);
    return this.validate();
  }
}

module.exports = {
  configSchema,
  apiKeySchemas,
  mcpServerSchema,
  bridgeSchema,
  ConfigurationState
};