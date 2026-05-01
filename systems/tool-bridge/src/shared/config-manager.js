/**
 * Configuration Manager
 * Handles all configuration for Tool Bridge
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class ConfigManager {
  constructor() {
    this.config = {};
    this.configDir = this.getConfigDirectory();
    this.configPath = path.join(this.configDir, 'config.json');
    this.envPath = path.join(this.configDir, '.env');
    this.defaults = this.getDefaults();
  }

  getConfigDirectory() {
    // Priority order:
    // 1. Environment variable
    // 2. Current directory .tool-bridge folder
    // 3. Home directory .tool-bridge folder

    if (process.env.TOOL_BRIDGE_CONFIG_DIR) {
      return process.env.TOOL_BRIDGE_CONFIG_DIR;
    }

    const localConfig = path.join(process.cwd(), '.tool-bridge');
    const homeConfig = path.join(os.homedir(), '.tool-bridge');

    // Use local if it exists, otherwise home
    try {
      if (require('fs').existsSync(localConfig)) {
        return localConfig;
      }
    } catch (e) {
      // Ignore
    }

    return homeConfig;
  }

  getDefaults() {
    return {
      version: '1.0.0',
      server: {
        port: 3456,
        host: 'localhost',
        cors: {
          enabled: true,
          origins: ['http://localhost:*']
        },
        rateLimit: {
          enabled: true,
          windowMs: 15 * 60 * 1000,
          max: 100
        },
        auth: {
          enabled: true,
          jwt: {
            secret: crypto.randomBytes(32).toString('hex'),
            expiresIn: '24h'
          }
        }
      },
      apis: {
        openai: {
          enabled: false,
          apiKey: '',
          baseURL: 'https://api.openai.com/v1',
          models: ['gpt-4', 'gpt-3.5-turbo'],
          defaultModel: 'gpt-3.5-turbo'
        },
        anthropic: {
          enabled: false,
          apiKey: '',
          baseURL: 'https://api.anthropic.com',
          models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229'],
          defaultModel: 'claude-3-sonnet-20240229'
        },
        google: {
          enabled: false,
          apiKey: '',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          models: ['gemini-pro', 'gemini-pro-vision'],
          defaultModel: 'gemini-pro'
        },
        custom: []
      },
      tools: {
        enabled: true,
        allowedTools: ['*'],
        blockedTools: [],
        customTools: []
      },
      logging: {
        level: 'info',
        file: true,
        console: true,
        maxFiles: 5,
        maxSize: '10m'
      },
      security: {
        encryption: {
          enabled: true,
          algorithm: 'aes-256-gcm'
        },
        apiKeys: {
          masterKey: crypto.randomBytes(32).toString('hex')
        }
      }
    };
  }

  async load() {
    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Load main config
      try {
        const configData = await fs.readFile(this.configPath, 'utf8');
        this.config = JSON.parse(configData);
      } catch (error) {
        // Config doesn't exist, use defaults
        this.config = this.defaults;
      }

      // Load environment variables
      await this.loadEnvFile();

      // Merge environment overrides
      this.mergeEnvironmentVariables();

      return this.config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  async loadEnvFile() {
    try {
      const envData = await fs.readFile(this.envPath, 'utf8');
      const lines = envData.split('\n');

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key] = value;
        }
      });
    } catch (error) {
      // .env file doesn't exist, that's okay
    }
  }

  mergeEnvironmentVariables() {
    // Override with environment variables
    if (process.env.OPENAI_API_KEY) {
      this.config.apis.openai.apiKey = process.env.OPENAI_API_KEY;
      this.config.apis.openai.enabled = true;
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.config.apis.anthropic.apiKey = process.env.ANTHROPIC_API_KEY;
      this.config.apis.anthropic.enabled = true;
    }

    if (process.env.GOOGLE_API_KEY) {
      this.config.apis.google.apiKey = process.env.GOOGLE_API_KEY;
      this.config.apis.google.enabled = true;
    }

    if (process.env.TOOL_BRIDGE_PORT) {
      this.config.server.port = parseInt(process.env.TOOL_BRIDGE_PORT);
    }

    if (process.env.TOOL_BRIDGE_HOST) {
      this.config.server.host = process.env.TOOL_BRIDGE_HOST;
    }
  }

  async save() {
    try {
      await fs.mkdir(this.configDir, { recursive: true });

      // Save main config
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf8'
      );

      // Save sensitive data to .env
      await this.saveEnvFile();

      return true;
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  async saveEnvFile() {
    const envLines = [];

    // Save API keys to .env
    if (this.config.apis.openai.apiKey) {
      envLines.push(`OPENAI_API_KEY=${this.config.apis.openai.apiKey}`);
    }

    if (this.config.apis.anthropic.apiKey) {
      envLines.push(`ANTHROPIC_API_KEY=${this.config.apis.anthropic.apiKey}`);
    }

    if (this.config.apis.google.apiKey) {
      envLines.push(`GOOGLE_API_KEY=${this.config.apis.google.apiKey}`);
    }

    // Save server config
    envLines.push(`TOOL_BRIDGE_PORT=${this.config.server.port}`);
    envLines.push(`TOOL_BRIDGE_HOST=${this.config.server.host}`);

    // Save security keys
    if (this.config.server.auth.jwt.secret) {
      envLines.push(`JWT_SECRET=${this.config.server.auth.jwt.secret}`);
    }

    if (this.config.security.apiKeys.masterKey) {
      envLines.push(`MASTER_API_KEY=${this.config.security.apiKeys.masterKey}`);
    }

    await fs.writeFile(this.envPath, envLines.join('\n'), 'utf8');
  }

  get(key) {
    if (!key) {
      return this.config;
    }

    // Support dot notation
    const keys = key.split('.');
    let value = this.config;

    for (const k of keys) {
      value = value[k];
      if (value === undefined) {
        return undefined;
      }
    }

    return value;
  }

  set(key, value) {
    // Support dot notation
    const keys = key.split('.');
    let obj = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]];
    }

    obj[keys[keys.length - 1]] = value;
  }

  isValid() {
    // Check if at least one API is configured
    const hasAPI = Object.values(this.config.apis || {}).some((api) =>
      api.enabled && api.apiKey && api.apiKey.length > 0
    );

    // Check server configuration
    const hasValidServer = this.config.server &&
      this.config.server.port &&
      this.config.server.host;

    return hasAPI && hasValidServer;
  }

  getSummary() {
    const apis = {};

    Object.entries(this.config.apis || {}).forEach(([name, config]) => {
      if (typeof config === 'object' && !Array.isArray(config)) {
        apis[name] = {
          enabled: config.enabled,
          configured: !!(config.apiKey && config.apiKey.length > 0)
        };
      }
    });

    return {
      apis,
      server: {
        port: this.config.server?.port,
        host: this.config.server?.host,
        authEnabled: this.config.server?.auth?.enabled
      },
      tools: {
        enabled: this.config.tools?.enabled,
        count: this.config.tools?.customTools?.length || 0
      }
    };
  }

  async reset() {
    this.config = this.getDefaults();
    await this.save();
  }

  async backup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.configDir, `config-backup-${timestamp}.json`);

    await fs.writeFile(
      backupPath,
      JSON.stringify(this.config, null, 2),
      'utf8'
    );

    return backupPath;
  }

  async restore(backupPath) {
    const backupData = await fs.readFile(backupPath, 'utf8');
    this.config = JSON.parse(backupData);
    await this.save();
  }
}

module.exports = ConfigManager;