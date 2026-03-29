const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

class APIKeyManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.configPath = options.configPath || path.join(os.homedir(), '.bumba', 'ai-keys.json');
    this.encryptionKey = options.encryptionKey || this.deriveEncryptionKey();
    this.algorithm = 'aes-256-gcm';
    this.keys = new Map();
    this.validationRules = new Map();
    this.lastValidated = new Map();
    this.validationInterval = options.validationInterval || 3600000; // 1 hour

    this.initializeValidationRules();
  }

  initializeValidationRules() {
    // OpenAI key validation
    this.validationRules.set('openai', {
      pattern: /^sk-[A-Za-z0-9]{48}$/,
      envVar: 'OPENAI_API_KEY',
      prefix: 'sk-',
      length: 51,
      description: 'OpenAI API key'
    });

    // Anthropic key validation
    this.validationRules.set('anthropic', {
      pattern: /^sk-ant-[A-Za-z0-9-]{90,}$/,
      envVar: 'ANTHROPIC_API_KEY',
      prefix: 'sk-ant-',
      minLength: 97,
      description: 'Anthropic API key'
    });

    // Google AI key validation
    this.validationRules.set('google', {
      pattern: /^[A-Za-z0-9-_]{39}$/,
      envVar: 'GOOGLE_API_KEY',
      length: 39,
      description: 'Google AI API key'
    });

    // HuggingFace key validation
    this.validationRules.set('huggingface', {
      pattern: /^hf_[A-Za-z0-9]{32,}$/,
      envVar: 'HUGGINGFACE_API_KEY',
      prefix: 'hf_',
      minLength: 35,
      description: 'HuggingFace API token'
    });

    // Cohere key validation
    this.validationRules.set('cohere', {
      pattern: /^[A-Za-z0-9]{40}$/,
      envVar: 'COHERE_API_KEY',
      length: 40,
      description: 'Cohere API key'
    });

    // Replicate key validation
    this.validationRules.set('replicate', {
      pattern: /^r8_[A-Za-z0-9]{37}$/,
      envVar: 'REPLICATE_API_TOKEN',
      prefix: 'r8_',
      length: 40,
      description: 'Replicate API token'
    });
  }

  deriveEncryptionKey() {
    // Derive key from machine ID and user info
    const machineId = os.hostname() + os.platform() + os.arch();
    const userId = os.userInfo().username;
    const combined = `${machineId}-${userId}-bumba-ai`;

    return crypto.createHash('sha256').update(combined).digest();
  }

  async initialize() {
    try {
      // Load keys from environment variables first
      this.loadFromEnvironment();

      // Then load from config file
      await this.loadFromFile();

      // Validate all keys
      await this.validateAllKeys();

      this.emit('initialized', {
        providers: Array.from(this.keys.keys()),
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.emit('error', {
        operation: 'initialize',
        error: error.message
      });
      return false;
    }
  }

  loadFromEnvironment() {
    for (const [provider, rules] of this.validationRules) {
      const envKey = process.env[rules.envVar];

      if (envKey) {
        try {
          if (this.validateKeyFormat(envKey, provider)) {
            this.keys.set(provider, {
              key: envKey,
              source: 'environment',
              loaded: Date.now(),
              valid: true
            });

            this.emit('key-loaded', {
              provider,
              source: 'environment'
            });
          }
        } catch (error) {
          console.warn(`Invalid ${provider} key in environment:`, error.message);
        }
      }
    }
  }

  async loadFromFile() {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      const data = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(data);

      if (config.encrypted) {
        // Decrypt the keys
        for (const [provider, encryptedData] of Object.entries(config.keys)) {
          try {
            const decrypted = this.decrypt(encryptedData);

            if (this.validateKeyFormat(decrypted, provider)) {
              this.keys.set(provider, {
                key: decrypted,
                source: 'file',
                loaded: Date.now(),
                valid: true
              });

              this.emit('key-loaded', {
                provider,
                source: 'file'
              });
            }
          } catch (error) {
            console.warn(`Failed to decrypt ${provider} key:`, error.message);
          }
        }
      } else {
        // Legacy unencrypted format (migrate on next save)
        for (const [provider, key] of Object.entries(config.keys)) {
          if (this.validateKeyFormat(key, provider)) {
            this.keys.set(provider, {
              key,
              source: 'file',
              loaded: Date.now(),
              valid: true
            });
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist yet, will be created on first save
    }
  }

  async saveToFile() {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      const encryptedKeys = {};

      for (const [provider, data] of this.keys) {
        if (data.source !== 'environment') {
          encryptedKeys[provider] = this.encrypt(data.key);
        }
      }

      const config = {
        version: '1.0',
        encrypted: true,
        keys: encryptedKeys,
        updated: new Date().toISOString()
      };

      await fs.writeFile(
        this.configPath,
        JSON.stringify(config, null, 2),
        { mode: 0o600 } // Read/write for owner only
      );

      this.emit('keys-saved', {
        path: this.configPath,
        providers: Object.keys(encryptedKeys)
      });

      return true;
    } catch (error) {
      this.emit('error', {
        operation: 'save',
        error: error.message
      });
      return false;
    }
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(data) {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      Buffer.from(data.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async setKey(provider, key, options = {}) {
    // Validate provider
    if (!this.validationRules.has(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Validate key format
    if (!this.validateKeyFormat(key, provider)) {
      throw new Error(`Invalid ${provider} API key format`);
    }

    // Optionally validate with provider
    if (options.validate) {
      const isValid = await this.validateKeyWithProvider(provider, key);
      if (!isValid) {
        throw new Error(`${provider} API key validation failed`);
      }
    }

    // Store the key
    this.keys.set(provider, {
      key,
      source: 'manual',
      loaded: Date.now(),
      valid: true,
      validated: options.validate ? Date.now() : null
    });

    // Save to file if not from environment
    if (options.persist !== false) {
      await this.saveToFile();
    }

    this.emit('key-set', { provider });

    return true;
  }

  getKey(provider) {
    const data = this.keys.get(provider);

    if (!data) {
      // Try to load from environment as fallback
      const rules = this.validationRules.get(provider);
      if (rules) {
        const envKey = process.env[rules.envVar];
        if (envKey && this.validateKeyFormat(envKey, provider)) {
          return envKey;
        }
      }
      return null;
    }

    // Check if validation is needed
    if (data.validated) {
      const timeSinceValidation = Date.now() - data.validated;
      if (timeSinceValidation > this.validationInterval) {
        // Schedule background validation
        this.scheduleValidation(provider);
      }
    }

    return data.key;
  }

  removeKey(provider) {
    const existed = this.keys.delete(provider);

    if (existed) {
      this.saveToFile();
      this.emit('key-removed', { provider });
    }

    return existed;
  }

  validateKeyFormat(key, provider) {
    const rules = this.validationRules.get(provider);

    if (!rules) {
      return false;
    }

    // Check pattern if available
    if (rules.pattern && !rules.pattern.test(key)) {
      return false;
    }

    // Check prefix
    if (rules.prefix && !key.startsWith(rules.prefix)) {
      return false;
    }

    // Check exact length
    if (rules.length && key.length !== rules.length) {
      return false;
    }

    // Check minimum length
    if (rules.minLength && key.length < rules.minLength) {
      return false;
    }

    return true;
  }

  async validateKeyWithProvider(provider, key) {
    try {
      switch (provider) {
        case 'openai': {
          const { OpenAIProvider } = require('./providers/openai-provider');
          const client = new OpenAIProvider({ apiKey: key });
          const result = await client.testConnection();
          return result.success;
        }

        case 'anthropic': {
          const { AnthropicProvider } = require('./providers/anthropic-provider');
          const client = new AnthropicProvider({ apiKey: key });
          const result = await client.testConnection();
          return result.success;
        }

        case 'google': {
          const { GoogleGeminiProvider } = require('./providers/google-provider');
          const client = new GoogleGeminiProvider({ apiKey: key });
          const result = await client.testConnection();
          return result.success;
        }

        default:
          // For providers without test methods, assume valid if format is correct
          return this.validateKeyFormat(key, provider);
      }
    } catch (error) {
      console.error(`Validation failed for ${provider}:`, error.message);
      return false;
    }
  }

  async validateAllKeys() {
    const validations = [];

    for (const [provider, data] of this.keys) {
      if (!data.validated || Date.now() - data.validated > this.validationInterval) {
        validations.push(
          this.validateKeyWithProvider(provider, data.key)
            .then(isValid => {
              data.valid = isValid;
              data.validated = Date.now();
              return { provider, valid: isValid };
            })
            .catch(error => {
              data.valid = false;
              return { provider, valid: false, error: error.message };
            })
        );
      }
    }

    const results = await Promise.all(validations);

    this.emit('validation-complete', { results });

    return results;
  }

  scheduleValidation(provider) {
    // Validate in background without blocking
    setImmediate(async () => {
      const data = this.keys.get(provider);
      if (data) {
        try {
          const isValid = await this.validateKeyWithProvider(provider, data.key);
          data.valid = isValid;
          data.validated = Date.now();

          this.emit('key-validated', { provider, valid: isValid });
        } catch (error) {
          data.valid = false;
          this.emit('validation-error', { provider, error: error.message });
        }
      }
    });
  }

  listKeys() {
    const list = [];

    for (const [provider, data] of this.keys) {
      const rules = this.validationRules.get(provider);
      const maskedKey = this.maskKey(data.key, provider);

      list.push({
        provider,
        masked: maskedKey,
        source: data.source,
        valid: data.valid,
        validated: data.validated,
        description: rules.description
      });
    }

    return list;
  }

  maskKey(key, provider) {
    if (!key) return null;

    const rules = this.validationRules.get(provider);
    const visibleChars = 4;

    if (rules && rules.prefix) {
      // Show prefix and last few characters
      const suffix = key.slice(-visibleChars);
      const masked = '*'.repeat(key.length - rules.prefix.length - visibleChars);
      return `${rules.prefix}${masked}${suffix}`;
    } else {
      // Show first and last few characters
      const prefix = key.slice(0, visibleChars);
      const suffix = key.slice(-visibleChars);
      const masked = '*'.repeat(Math.max(0, key.length - (visibleChars * 2)));
      return `${prefix}${masked}${suffix}`;
    }
  }

  async rotateKey(provider, newKey) {
    const oldData = this.keys.get(provider);

    if (!oldData) {
      throw new Error(`No existing key for ${provider}`);
    }

    // Validate new key
    if (!this.validateKeyFormat(newKey, provider)) {
      throw new Error(`Invalid ${provider} API key format`);
    }

    // Validate with provider
    const isValid = await this.validateKeyWithProvider(provider, newKey);
    if (!isValid) {
      throw new Error(`New ${provider} API key validation failed`);
    }

    // Backup old key
    const backup = {
      key: oldData.key,
      rotated: Date.now()
    };

    // Update to new key
    this.keys.set(provider, {
      key: newKey,
      source: 'rotated',
      loaded: Date.now(),
      valid: true,
      validated: Date.now(),
      previousKey: backup
    });

    await this.saveToFile();

    this.emit('key-rotated', { provider });

    return true;
  }

  exportKeys(includeSecrets = false) {
    const exported = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      keys: {}
    };

    for (const [provider, data] of this.keys) {
      exported.keys[provider] = {
        provider,
        source: data.source,
        valid: data.valid,
        validated: data.validated
      };

      if (includeSecrets) {
        exported.keys[provider].key = data.key;
      } else {
        exported.keys[provider].masked = this.maskKey(data.key, provider);
      }
    }

    return exported;
  }

  async importKeys(data, options = {}) {
    if (!data.keys) {
      throw new Error('Invalid import data format');
    }

    const imported = [];
    const failed = [];

    for (const [provider, keyData] of Object.entries(data.keys)) {
      try {
        if (keyData.key) {
          await this.setKey(provider, keyData.key, {
            validate: options.validate !== false
          });
          imported.push(provider);
        }
      } catch (error) {
        failed.push({ provider, error: error.message });
      }
    }

    this.emit('keys-imported', { imported, failed });

    return { imported, failed };
  }

  getProviderConfig(provider) {
    const keyData = this.keys.get(provider);
    const rules = this.validationRules.get(provider);

    if (!keyData || !keyData.valid) {
      return null;
    }

    return {
      apiKey: keyData.key,
      provider,
      description: rules.description,
      validated: keyData.validated,
      source: keyData.source
    };
  }

  isConfigured(provider) {
    const data = this.keys.get(provider);
    return data && data.valid;
  }

  getConfiguredProviders() {
    return Array.from(this.keys.keys()).filter(provider => {
      const data = this.keys.get(provider);
      return data && data.valid;
    });
  }

  async cleanup() {
    // Clear sensitive data from memory
    for (const data of this.keys.values()) {
      if (data.key) {
        // Overwrite the key in memory
        data.key = crypto.randomBytes(data.key.length).toString('hex');
      }
    }

    this.keys.clear();
    this.emit('cleanup');
  }
}

module.exports = { APIKeyManager };