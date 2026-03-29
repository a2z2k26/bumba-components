/**
 * API Key Manager for BUMBA Setup Wizard
 * Handles secure collection, validation, and storage of API keys
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const InteractivePrompts = require('./interactive-prompts');

class APIKeyManager {
  constructor(options = {}) {
    this.options = {
      encryptKeys: options.encryptKeys !== false,
      validateKeys: options.validateKeys !== false,
      testConnections: options.testConnections || false,
      ...options
    };
    
    this.prompts = new InteractivePrompts(options);
    
    // Key storage
    this.keys = {};
    this.validatedKeys = {};
    
    // Encryption settings
    this.encryptionKey = null;
    this.algorithm = 'aes-256-gcm';
    
    // API key patterns for validation
    this.patterns = {
      openai: /^sk-[a-zA-Z0-9]{48}$/,
      anthropic: /^sk-ant-[a-zA-Z0-9\-]{95}$/,
      google: /^[a-zA-Z0-9\-_]{39}$/,
      openrouter: /^sk-or-[a-zA-Z0-9\-]+$/,
      github: /^gh[pso]_[a-zA-Z0-9]{36}$/,
      notion: /^secret_[a-zA-Z0-9]{43}$/,
      pinecone: /^[a-zA-Z0-9\-]+$/,
      deepseek: /^sk-[a-zA-Z0-9]+$/,
      qwen: /^[a-zA-Z0-9]+$/,
      kimi: /^[a-zA-Z0-9]+$/
    };
  }

  /**
   * Collect API keys from user
   */
  async collectKeys(existingKeys = {}) {
    this.keys = { ...existingKeys };
    
    // Prompt for API keys
    const newKeys = await this.prompts.promptAPIKeys(existingKeys);
    
    // Merge with existing
    this.keys = { ...this.keys, ...newKeys };
    
    // Validate if enabled
    if (this.options.validateKeys) {
      await this.validateAllKeys();
    }
    
    // Test connections if enabled
    if (this.options.testConnections) {
      await this.testAllConnections();
    }
    
    return this.keys;
  }

  /**
   * Validate all API keys
   */
  async validateAllKeys() {
    this.validatedKeys = {};
    
    for (const [provider, key] of Object.entries(this.keys)) {
      if (!key) continue;
      
      const validation = await this.validateKey(provider, key);
      this.validatedKeys[provider] = validation;
      
      if (!validation.valid) {
        this.prompts.cli.warning(
          `${provider} key validation failed`,
          validation.error
        );
      }
    }
    
    return this.validatedKeys;
  }

  /**
   * Validate a single API key
   */
  async validateKey(provider, key) {
    // Check format
    const pattern = this.patterns[provider];
    if (pattern && !pattern.test(key)) {
      return {
        valid: false,
        error: 'Invalid key format',
        provider
      };
    }
    
    // Provider-specific validation
    switch (provider) {
      case 'openai':
        return await this.validateOpenAI(key);
      case 'anthropic':
        return await this.validateAnthropic(key);
      case 'google':
        return await this.validateGoogle(key);
      case 'github':
        return await this.validateGitHub(key);
      case 'notion':
        return await this.validateNotion(key);
      default:
        return {
          valid: true,
          provider,
          note: 'Format validation only'
        };
    }
  }

  /**
   * Validate OpenAI key
   */
  async validateOpenAI(key) {
    if (!this.options.testConnections) {
      return { valid: true, provider: 'openai', note: 'Not tested' };
    }
    
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${key}`
        }
      });
      
      if (response.status === 200) {
        const data = await response.json();
        const models = data.data
          .filter(m => m.id.includes('gpt'))
          .map(m => m.id)
          .slice(0, 3);
        
        return {
          valid: true,
          provider: 'openai',
          models,
          organization: response.headers.get('openai-organization')
        };
      } else if (response.status === 401) {
        return {
          valid: false,
          provider: 'openai',
          error: 'Invalid API key'
        };
      } else {
        return {
          valid: false,
          provider: 'openai',
          error: `API error: ${response.status}`
        };
      }
    } catch (error) {
      return {
        valid: false,
        provider: 'openai',
        error: error.message
      };
    }
  }

  /**
   * Validate Anthropic key
   */
  async validateAnthropic(key) {
    // Anthropic doesn't have a simple validation endpoint
    // Check format only
    const valid = this.patterns.anthropic.test(key);
    
    return {
      valid,
      provider: 'anthropic',
      note: valid ? 'Format valid' : 'Invalid format',
      models: valid ? ['claude-sonnet-4-5-20250929', 'claude-3-5-haiku-20241022'] : []
    };
  }

  /**
   * Validate Google key
   */
  async validateGoogle(key) {
    if (!this.options.testConnections) {
      return { valid: true, provider: 'google', note: 'Not tested' };
    }
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${key}`
      );
      
      return {
        valid: response.status === 200,
        provider: 'google',
        error: response.status === 403 ? 'Invalid API key' : null,
        models: response.status === 200 ? ['gemini-pro', 'gemini-pro-vision'] : []
      };
    } catch (error) {
      return {
        valid: false,
        provider: 'google',
        error: error.message
      };
    }
  }

  /**
   * Validate GitHub token
   */
  async validateGitHub(token) {
    if (!this.options.testConnections) {
      return { valid: true, provider: 'github', note: 'Not tested' };
    }
    
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (response.status === 200) {
        const user = await response.json();
        return {
          valid: true,
          provider: 'github',
          username: user.login,
          scopes: response.headers.get('x-oauth-scopes')?.split(', ') || []
        };
      } else {
        return {
          valid: false,
          provider: 'github',
          error: response.status === 401 ? 'Invalid token' : `Error: ${response.status}`
        };
      }
    } catch (error) {
      return {
        valid: false,
        provider: 'github',
        error: error.message
      };
    }
  }

  /**
   * Validate Notion key
   */
  async validateNotion(key) {
    if (!this.options.testConnections) {
      return { valid: true, provider: 'notion', note: 'Not tested' };
    }
    
    try {
      const response = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Notion-Version': '2022-06-28'
        }
      });
      
      if (response.status === 200) {
        const user = await response.json();
        return {
          valid: true,
          provider: 'notion',
          workspace: user.type === 'bot' ? 'Bot user' : user.name
        };
      } else {
        return {
          valid: false,
          provider: 'notion',
          error: response.status === 401 ? 'Invalid API key' : `Error: ${response.status}`
        };
      }
    } catch (error) {
      return {
        valid: false,
        provider: 'notion',
        error: error.message
      };
    }
  }

  /**
   * Test all connections
   */
  async testAllConnections() {
    const results = {};
    
    this.prompts.cli.showSection('Testing API Connections', 'Validating API keys...');
    
    for (const [provider, key] of Object.entries(this.keys)) {
      if (!key) continue;
      
      const spinner = this.prompts.cli.showSpinner(`Testing ${provider}...`);
      
      try {
        const result = await this.validateKey(provider, key);
        results[provider] = result;
        
        if (result.valid) {
          this.prompts.cli.updateSpinner(`✅ ${provider} connected`, 'succeed');
        } else {
          this.prompts.cli.updateSpinner(`❌ ${provider} failed: ${result.error}`, 'fail');
        }
      } catch (error) {
        this.prompts.cli.updateSpinner(`❌ ${provider} error: ${error.message}`, 'fail');
        results[provider] = {
          valid: false,
          error: error.message
        };
      }
    }
    
    return results;
  }

  /**
   * Encrypt API keys
   */
  encryptKeys() {
    if (!this.options.encryptKeys) {
      return this.keys;
    }
    
    // Generate or load encryption key
    if (!this.encryptionKey) {
      this.encryptionKey = this.getOrCreateEncryptionKey();
    }
    
    const encrypted = {};
    
    for (const [provider, key] of Object.entries(this.keys)) {
      if (!key) continue;
      encrypted[provider] = this.encrypt(key);
    }
    
    return encrypted;
  }

  /**
   * Decrypt API keys
   */
  decryptKeys(encryptedKeys) {
    if (!this.options.encryptKeys) {
      return encryptedKeys;
    }
    
    if (!this.encryptionKey) {
      this.encryptionKey = this.getOrCreateEncryptionKey();
    }
    
    const decrypted = {};
    
    for (const [provider, encryptedKey] of Object.entries(encryptedKeys)) {
      if (!encryptedKey) continue;
      
      try {
        decrypted[provider] = this.decrypt(encryptedKey);
      } catch (error) {
        console.error(`Failed to decrypt ${provider} key:`, error.message);
      }
    }
    
    return decrypted;
  }

  /**
   * Encrypt a value
   */
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

  /**
   * Decrypt a value
   */
  decrypt(encryptedData) {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Get or create encryption key
   */
  getOrCreateEncryptionKey() {
    const keyPath = path.join(process.cwd(), '.bumba', '.key');
    
    try {
      // Try to load existing key
      const key = require('fs').readFileSync(keyPath);
      return key;
    } catch (error) {
      // Generate new key
      const key = crypto.randomBytes(32);
      
      // Save key
      try {
        require('fs').mkdirSync(path.dirname(keyPath), { recursive: true });
        require('fs').writeFileSync(keyPath, key, { mode: 0o600 });
      } catch (saveError) {
        console.error('Warning: Could not save encryption key:', saveError.message);
      }
      
      return key;
    }
  }

  /**
   * Format keys for .env file
   */
  formatForEnv() {
    const lines = [];
    
    // API Keys section
    lines.push('# ============================================');
    lines.push('# AI Model API Keys');
    lines.push('# ============================================');
    lines.push('');
    
    // OpenAI
    if (this.keys.openai) {
      lines.push('# OpenAI - https://platform.openai.com/api-keys');
      lines.push(`OPENAI_API_KEY=${this.keys.openai}`);
      lines.push('');
    }
    
    // Anthropic
    if (this.keys.anthropic) {
      lines.push('# Anthropic (Claude) - https://console.anthropic.com');
      lines.push(`ANTHROPIC_API_KEY=${this.keys.anthropic}`);
      lines.push('');
    }
    
    // Google
    if (this.keys.google) {
      lines.push('# Google AI (Gemini) - https://makersuite.google.com');
      lines.push(`GOOGLE_API_KEY=${this.keys.google}`);
      lines.push('');
    }
    
    // OpenRouter
    if (this.keys.openrouter) {
      lines.push('# OpenRouter (200+ models) - https://openrouter.ai');
      lines.push(`OPENROUTER_API_KEY=${this.keys.openrouter}`);
      lines.push('');
    }
    
    // Service APIs section
    if (this.keys.github || this.keys.notion || this.keys.pinecone) {
      lines.push('# ============================================');
      lines.push('# Service APIs');
      lines.push('# ============================================');
      lines.push('');
    }
    
    // GitHub
    if (this.keys.github) {
      lines.push('# GitHub - https://github.com/settings/tokens');
      lines.push(`GITHUB_TOKEN=${this.keys.github}`);
      lines.push('');
    }
    
    // Notion
    if (this.keys.notion) {
      lines.push('# Notion - https://www.notion.so/my-integrations');
      lines.push(`NOTION_API_KEY=${this.keys.notion}`);
      lines.push('');
    }
    
    // Pinecone
    if (this.keys.pinecone) {
      lines.push('# Pinecone - https://app.pinecone.io');
      lines.push(`PINECONE_API_KEY=${this.keys.pinecone}`);
      lines.push('');
    }
    
    return lines.join('\n');
  }

  /**
   * Get summary of configured keys
   */
  getSummary() {
    const configured = Object.keys(this.keys).filter(k => this.keys[k]);
    const validated = Object.keys(this.validatedKeys).filter(k => this.validatedKeys[k]?.valid);
    
    return {
      total: Object.keys(this.patterns).length,
      configured: configured.length,
      validated: validated.length,
      providers: configured,
      validation: this.validatedKeys
    };
  }
}

module.exports = APIKeyManager;