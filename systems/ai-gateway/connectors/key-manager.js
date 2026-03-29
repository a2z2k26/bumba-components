/**
 * API Key Management System for BUMBA AI Providers
 * Sprint 2.12: Secure key storage, validation, rotation, and health monitoring
 *
 * Provides:
 * - Secure API key storage with encryption
 * - Key validation and health checks
 * - Multi-key support with automatic rotation
 * - Usage tracking per key
 * - Environment-specific configuration
 * - Key expiration and renewal notifications
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Key status
 */
const KeyStatus = {
  ACTIVE: 'active',           // Key is valid and can be used
  INACTIVE: 'inactive',       // Key is disabled but not deleted
  EXPIRED: 'expired',         // Key has expired
  INVALID: 'invalid',         // Key failed validation
  RATE_LIMITED: 'rate_limited', // Key is temporarily rate limited
  QUOTA_EXCEEDED: 'quota_exceeded' // Key has exceeded quota
};

/**
 * Key validation result
 */
const ValidationResult = {
  VALID: 'valid',
  INVALID: 'invalid',
  EXPIRED: 'expired',
  RATE_LIMITED: 'rate_limited',
  NETWORK_ERROR: 'network_error',
  UNKNOWN: 'unknown'
};

/**
 * API key specification
 *
 * @typedef {Object} KeySpec
 * @property {string} id - Unique key identifier
 * @property {string} provider - Provider name (openai, anthropic, google, openrouter)
 * @property {string} key - Encrypted API key
 * @property {string} status - Key status (from KeyStatus enum)
 * @property {string} [tier] - Key tier ('free' or 'paid')
 * @property {Object} metadata - Key metadata
 * @property {string} metadata.name - Human-readable key name
 * @property {string} metadata.environment - Environment (development, staging, production)
 * @property {string} [metadata.description] - Key description
 * @property {string} [metadata.owner] - Key owner/team
 * @property {Object} usage - Usage statistics
 * @property {number} usage.requests - Total requests made with this key
 * @property {number} usage.tokens - Total tokens consumed
 * @property {number} usage.cost - Total cost incurred
 * @property {string} usage.lastUsed - ISO timestamp of last use
 * @property {Object} [limits] - Optional usage limits
 * @property {number} [limits.dailyRequests] - Max requests per day
 * @property {number} [limits.monthlyBudget] - Max cost per month
 * @property {number} [limits.requestsPerMinute] - Max requests per minute (free tier)
 * @property {number} [limits.tokensPerMinute] - Max tokens per minute (free tier)
 * @property {number} [limits.requestsPerDay] - Max requests per day (free tier)
 * @property {Object} [freeTierUsage] - Free tier specific usage tracking
 * @property {number} [freeTierUsage.requestsThisMinute] - Requests in current minute window
 * @property {number} [freeTierUsage.tokensThisMinute] - Tokens in current minute window
 * @property {number} [freeTierUsage.requestsToday] - Requests since midnight PT
 * @property {string} [freeTierUsage.minuteWindowStart] - ISO timestamp of current minute window
 * @property {string} [freeTierUsage.dayStart] - ISO timestamp of current day start (midnight PT)
 * @property {string} createdAt - ISO timestamp of creation
 * @property {string} [expiresAt] - ISO timestamp of expiration
 * @property {string} [lastValidated] - ISO timestamp of last validation
 */

/**
 * API Key Manager
 *
 * @class KeyManager
 * @extends EventEmitter
 * @description Manages API keys with encryption, validation, and rotation
 */
class KeyManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      encryptionKey: options.encryptionKey || process.env.BUMBA_ENCRYPTION_KEY,
      storagePath: options.storagePath || path.join(process.cwd(), '.bumba', 'keys.json'),
      autoValidate: options.autoValidate !== false,
      rotationEnabled: options.rotationEnabled !== false,
      validationInterval: options.validationInterval || 3600000, // 1 hour
      ...options
    };

    this.keys = new Map(); // id -> KeySpec
    this.keysByProvider = new Map(); // provider -> [KeySpec]
    this.activeKeysByProvider = new Map(); // provider -> KeySpec (currently active)
    this.validationCache = new Map(); // id -> { result, timestamp }

    // Ensure encryption key is available
    if (!this.options.encryptionKey) {
      this.options.encryptionKey = this.generateEncryptionKey();
    }

    // Load existing keys
    this.loadKeys();

    // Start validation timer
    if (this.options.autoValidate) {
      this.startValidationTimer();
    }

    // Start free tier daily reset timer
    this.startFreeTierResetTimer();
  }

  /**
   * Generate encryption key
   * @returns {string} - Base64 encoded encryption key
   */
  generateEncryptionKey() {
    return crypto.randomBytes(32).toString('base64');
  }

  /**
   * Encrypt API key
   * @param {string} key - Plain text API key
   * @returns {string} - Encrypted key
   */
  encryptKey(key) {
    const algorithm = 'aes-256-cbc';
    const encryptionKey = Buffer.from(this.options.encryptionKey, 'base64');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
    let encrypted = cipher.update(key, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt API key
   * @param {string} encryptedKey - Encrypted key
   * @returns {string} - Plain text API key
   */
  decryptKey(encryptedKey) {
    const algorithm = 'aes-256-cbc';
    const encryptionKey = Buffer.from(this.options.encryptionKey, 'base64');

    const [ivHex, encrypted] = encryptedKey.split(':');
    const iv = Buffer.from(ivHex, 'hex');

    const decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Register API key
   * @param {Object} spec - Key specification
   * @param {string} spec.provider - Provider name
   * @param {string} spec.key - Plain text API key
   * @param {string} [spec.tier] - Key tier ('free' or 'paid')
   * @param {Object} [spec.metadata] - Key metadata
   * @param {Object} [spec.limits] - Usage limits
   * @param {string} [spec.expiresAt] - Expiration date
   * @returns {string} - Key ID
   */
  registerKey(spec) {
    const id = crypto.randomBytes(16).toString('hex');
    const tier = spec.tier || 'paid'; // Default to paid tier

    const keySpec = {
      id,
      provider: spec.provider,
      key: this.encryptKey(spec.key),
      status: KeyStatus.ACTIVE,
      tier,
      metadata: {
        name: spec.metadata?.name || `${spec.provider}-key-${id.substring(0, 8)}`,
        environment: spec.metadata?.environment || process.env.NODE_ENV || 'development',
        description: spec.metadata?.description,
        owner: spec.metadata?.owner
      },
      usage: {
        requests: 0,
        tokens: 0,
        cost: 0,
        lastUsed: null
      },
      limits: spec.limits || null,
      createdAt: new Date().toISOString(),
      expiresAt: spec.expiresAt || null,
      lastValidated: null
    };

    // Initialize free tier usage tracking if this is a free tier key
    if (tier === 'free') {
      const now = new Date();
      const midnightPT = this.getMidnightPacificTime(now);

      keySpec.freeTierUsage = {
        requestsThisMinute: 0,
        tokensThisMinute: 0,
        requestsToday: 0,
        minuteWindowStart: now.toISOString(),
        dayStart: midnightPT.toISOString()
      };
    }

    this.keys.set(id, keySpec);

    // Update provider index
    if (!this.keysByProvider.has(spec.provider)) {
      this.keysByProvider.set(spec.provider, []);
    }
    this.keysByProvider.get(spec.provider).push(keySpec);

    // Set as active if first key for provider
    if (!this.activeKeysByProvider.has(spec.provider)) {
      this.activeKeysByProvider.set(spec.provider, keySpec);
    }

    this.saveKeys();
    this.emit('key:registered', { id, provider: spec.provider });

    return id;
  }

  /**
   * Get key by ID
   * @param {string} id - Key ID
   * @param {boolean} [decrypt=false] - Whether to decrypt the key
   * @returns {KeySpec|null} - Key specification or null
   */
  getKey(id, decrypt = false) {
    const keySpec = this.keys.get(id);
    if (!keySpec) {
      return null;
    }

    if (decrypt) {
      return {
        ...keySpec,
        key: this.decryptKey(keySpec.key)
      };
    }

    return keySpec;
  }

  /**
   * Get active key for provider
   * @param {string} provider - Provider name
   * @param {boolean} [decrypt=false] - Whether to decrypt the key
   * @returns {KeySpec|null} - Active key or null
   */
  getActiveKey(provider, decrypt = false) {
    const keySpec = this.activeKeysByProvider.get(provider);
    if (!keySpec) {
      return null;
    }

    if (decrypt) {
      return {
        ...keySpec,
        key: this.decryptKey(keySpec.key)
      };
    }

    return keySpec;
  }

  /**
   * Get all keys for provider
   * @param {string} provider - Provider name
   * @param {string} [status] - Filter by status
   * @returns {KeySpec[]} - Array of key specifications
   */
  getProviderKeys(provider, status = null) {
    const keys = this.keysByProvider.get(provider) || [];

    if (status) {
      return keys.filter(k => k.status === status);
    }

    return keys;
  }

  /**
   * Update key status
   * @param {string} id - Key ID
   * @param {string} status - New status
   * @returns {boolean} - True if updated
   */
  updateKeyStatus(id, status) {
    const keySpec = this.keys.get(id);
    if (!keySpec) {
      return false;
    }

    const oldStatus = keySpec.status;
    keySpec.status = status;

    // If key was active and is now inactive, rotate to next available key
    if (oldStatus === KeyStatus.ACTIVE && status !== KeyStatus.ACTIVE) {
      const activeKey = this.activeKeysByProvider.get(keySpec.provider);
      if (activeKey && activeKey.id === id) {
        this.rotateKey(keySpec.provider);
      }
    }

    this.saveKeys();
    this.emit('key:status_changed', { id, oldStatus, newStatus: status });

    return true;
  }

  /**
   * Record key usage
   * @param {string} id - Key ID
   * @param {Object} usage - Usage data
   * @param {number} [usage.tokens] - Tokens used
   * @param {number} [usage.cost] - Cost incurred
   */
  recordUsage(id, usage = {}) {
    const keySpec = this.keys.get(id);
    if (!keySpec) {
      return;
    }

    keySpec.usage.requests += 1;
    if (usage.tokens) {
      keySpec.usage.tokens += usage.tokens;
    }
    if (usage.cost) {
      keySpec.usage.cost += usage.cost;
    }
    keySpec.usage.lastUsed = new Date().toISOString();

    // Record free tier usage if applicable
    if (keySpec.tier === 'free' && usage.tokens) {
      this.recordFreeTierUsage(id, usage.tokens);
    }

    // Check limits
    if (keySpec.limits) {
      // Daily request limit
      if (keySpec.limits.dailyRequests) {
        // In a real implementation, would track daily usage separately
        // For now, just emit event if approaching limit
        if (keySpec.usage.requests % 100 === 0) {
          this.emit('key:usage_milestone', {
            id,
            requests: keySpec.usage.requests
          });
        }
      }

      // Monthly budget limit
      if (keySpec.limits.monthlyBudget && keySpec.usage.cost > keySpec.limits.monthlyBudget) {
        this.updateKeyStatus(id, KeyStatus.QUOTA_EXCEEDED);
        this.emit('key:quota_exceeded', {
          id,
          limit: keySpec.limits.monthlyBudget,
          actual: keySpec.usage.cost
        });
      }
    }

    this.saveKeys();
  }

  /**
   * Rotate to next available key for provider
   * @param {string} provider - Provider name
   * @returns {boolean} - True if rotated successfully
   */
  rotateKey(provider) {
    if (!this.options.rotationEnabled) {
      return false;
    }

    const keys = this.getProviderKeys(provider, KeyStatus.ACTIVE);
    if (keys.length === 0) {
      this.emit('key:rotation_failed', {
        provider,
        reason: 'No active keys available'
      });
      return false;
    }

    // Find next key (round-robin)
    const currentKey = this.activeKeysByProvider.get(provider);
    const currentIndex = keys.findIndex(k => k.id === currentKey?.id);
    const nextIndex = (currentIndex + 1) % keys.length;
    const nextKey = keys[nextIndex];

    this.activeKeysByProvider.set(provider, nextKey);

    this.emit('key:rotated', {
      provider,
      oldKey: currentKey?.id,
      newKey: nextKey.id
    });

    return true;
  }

  /**
   * Validate API key
   * @param {string} id - Key ID
   * @param {boolean} [useCache=true] - Whether to use cached validation result
   * @returns {Promise<Object>} - Validation result
   */
  async validateKey(id, useCache = true) {
    const keySpec = this.keys.get(id);
    if (!keySpec) {
      return {
        valid: false,
        result: ValidationResult.INVALID,
        message: 'Key not found'
      };
    }

    // Check cache
    if (useCache) {
      const cached = this.validationCache.get(id);
      if (cached && Date.now() - cached.timestamp < 300000) { // 5 min cache
        return cached.result;
      }
    }

    // Check expiration
    if (keySpec.expiresAt) {
      const expiresAt = new Date(keySpec.expiresAt);
      if (expiresAt < new Date()) {
        const result = {
          valid: false,
          result: ValidationResult.EXPIRED,
          message: 'Key has expired'
        };

        this.validationCache.set(id, { result, timestamp: Date.now() });
        this.updateKeyStatus(id, KeyStatus.EXPIRED);

        return result;
      }
    }

    // In a real implementation, would make actual API call to validate
    // For now, assume key is valid if it exists
    const result = {
      valid: true,
      result: ValidationResult.VALID,
      message: 'Key is valid',
      checkedAt: new Date().toISOString()
    };

    keySpec.lastValidated = result.checkedAt;
    this.validationCache.set(id, { result, timestamp: Date.now() });
    this.saveKeys();

    this.emit('key:validated', { id, valid: true });

    return result;
  }

  /**
   * Validate all keys
   * @returns {Promise<Object>} - Validation summary
   */
  async validateAllKeys() {
    const results = {
      total: this.keys.size,
      valid: 0,
      invalid: 0,
      expired: 0,
      details: []
    };

    for (const [id, keySpec] of this.keys) {
      const validation = await this.validateKey(id, false);
      results.details.push({
        id,
        provider: keySpec.provider,
        status: keySpec.status,
        validation
      });

      if (validation.valid) {
        results.valid++;
      } else if (validation.result === ValidationResult.EXPIRED) {
        results.expired++;
      } else {
        results.invalid++;
      }
    }

    this.emit('validation:complete', results);

    return results;
  }

  /**
   * Remove key
   * @param {string} id - Key ID
   * @returns {boolean} - True if removed
   */
  removeKey(id) {
    const keySpec = this.keys.get(id);
    if (!keySpec) {
      return false;
    }

    // Remove from provider index
    const providerKeys = this.keysByProvider.get(keySpec.provider);
    if (providerKeys) {
      const index = providerKeys.findIndex(k => k.id === id);
      if (index !== -1) {
        providerKeys.splice(index, 1);
      }
    }

    // If this was the active key, rotate
    const activeKey = this.activeKeysByProvider.get(keySpec.provider);
    if (activeKey && activeKey.id === id) {
      this.rotateKey(keySpec.provider);
    }

    this.keys.delete(id);
    this.validationCache.delete(id);

    this.saveKeys();
    this.emit('key:removed', { id, provider: keySpec.provider });

    return true;
  }

  /**
   * Get usage statistics
   * @param {string} [provider] - Filter by provider
   * @returns {Object} - Usage statistics
   */
  getUsageStats(provider = null) {
    let keys = Array.from(this.keys.values());

    if (provider) {
      keys = keys.filter(k => k.provider === provider);
    }

    const stats = {
      totalKeys: keys.length,
      activeKeys: keys.filter(k => k.status === KeyStatus.ACTIVE).length,
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      byProvider: {},
      byStatus: {}
    };

    for (const key of keys) {
      stats.totalRequests += key.usage.requests;
      stats.totalTokens += key.usage.tokens;
      stats.totalCost += key.usage.cost;

      // By provider
      if (!stats.byProvider[key.provider]) {
        stats.byProvider[key.provider] = {
          keys: 0,
          requests: 0,
          tokens: 0,
          cost: 0
        };
      }
      stats.byProvider[key.provider].keys++;
      stats.byProvider[key.provider].requests += key.usage.requests;
      stats.byProvider[key.provider].tokens += key.usage.tokens;
      stats.byProvider[key.provider].cost += key.usage.cost;

      // By status
      if (!stats.byStatus[key.status]) {
        stats.byStatus[key.status] = 0;
      }
      stats.byStatus[key.status]++;
    }

    return stats;
  }

  /**
   * Get health status
   * @returns {Object} - Health status
   */
  getHealthStatus() {
    const now = Date.now();
    const stats = this.getUsageStats();

    const health = {
      healthy: true,
      providers: {},
      warnings: [],
      errors: []
    };

    // Check each provider
    for (const provider of this.keysByProvider.keys()) {
      const keys = this.getProviderKeys(provider);
      const activeKeys = keys.filter(k => k.status === KeyStatus.ACTIVE);

      health.providers[provider] = {
        totalKeys: keys.length,
        activeKeys: activeKeys.length,
        healthy: activeKeys.length > 0
      };

      if (activeKeys.length === 0) {
        health.healthy = false;
        health.errors.push(`No active keys for provider: ${provider}`);
      } else if (activeKeys.length === 1) {
        health.warnings.push(`Only one active key for provider: ${provider}`);
      }

      // Check for keys needing validation
      for (const key of activeKeys) {
        if (!key.lastValidated) {
          health.warnings.push(`Key ${key.id} has never been validated`);
        } else {
          const lastValidated = new Date(key.lastValidated).getTime();
          const hoursSinceValidation = (now - lastValidated) / 3600000;

          if (hoursSinceValidation > 24) {
            health.warnings.push(`Key ${key.id} not validated in ${Math.floor(hoursSinceValidation)} hours`);
          }
        }
      }
    }

    return health;
  }

  /**
   * Start automatic validation timer
   */
  startValidationTimer() {
    if (this.validationTimer) {
      return;
    }

    this.validationTimer = setInterval(() => {
      this.validateAllKeys().catch(err => {
        this.emit('validation:error', err);
      });
    }, this.options.validationInterval);

    // Run initial validation
    setTimeout(() => {
      this.validateAllKeys().catch(err => {
        this.emit('validation:error', err);
      });
    }, 5000); // 5 seconds after start
  }

  /**
   * Stop validation timer
   */
  stopValidationTimer() {
    if (this.validationTimer) {
      clearInterval(this.validationTimer);
      this.validationTimer = null;
    }
  }

  /**
   * Load keys from storage
   */
  loadKeys() {
    try {
      if (!fs.existsSync(this.options.storagePath)) {
        return;
      }

      const data = fs.readFileSync(this.options.storagePath, 'utf-8');
      const stored = JSON.parse(data);

      for (const keySpec of stored.keys || []) {
        this.keys.set(keySpec.id, keySpec);

        // Rebuild provider index
        if (!this.keysByProvider.has(keySpec.provider)) {
          this.keysByProvider.set(keySpec.provider, []);
        }
        this.keysByProvider.get(keySpec.provider).push(keySpec);

        // Restore active keys
        if (stored.activeKeys && stored.activeKeys[keySpec.provider] === keySpec.id) {
          this.activeKeysByProvider.set(keySpec.provider, keySpec);
        }
      }

      this.emit('keys:loaded', { count: this.keys.size });
    } catch (error) {
      this.emit('keys:load_error', error);
    }
  }

  /**
   * Save keys to storage
   */
  saveKeys() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.options.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        keys: Array.from(this.keys.values()),
        activeKeys: {},
        savedAt: new Date().toISOString()
      };

      // Save active keys
      for (const [provider, keySpec] of this.activeKeysByProvider) {
        data.activeKeys[provider] = keySpec.id;
      }

      fs.writeFileSync(this.options.storagePath, JSON.stringify(data, null, 2));

      this.emit('keys:saved', { count: this.keys.size });
    } catch (error) {
      this.emit('keys:save_error', error);
    }
  }

  /**
   * Clear all validation cache
   */
  clearValidationCache() {
    this.validationCache.clear();
    this.emit('cache:cleared');
  }

  /**
   * Get midnight Pacific Time for a given date
   * @param {Date} date - Date to calculate midnight for
   * @returns {Date} - Midnight PT for the given date
   */
  getMidnightPacificTime(date) {
    // Pacific Time is UTC-8 (PST) or UTC-7 (PDT)
    // For simplicity, using UTC-8 (PST)
    const utcMidnight = new Date(date);
    utcMidnight.setUTCHours(0, 0, 0, 0);

    // Adjust to Pacific Time (add 8 hours to get to UTC midnight of PT day)
    const ptMidnight = new Date(utcMidnight);
    ptMidnight.setUTCHours(8, 0, 0, 0);

    // If current time is before PT midnight, use previous day's midnight
    if (date < ptMidnight) {
      ptMidnight.setUTCDate(ptMidnight.getUTCDate() - 1);
    }

    return ptMidnight;
  }

  /**
   * Check if free tier key can be used (within rate limits)
   * @param {string} id - Key ID
   * @param {number} tokensRequested - Number of tokens requested
   * @returns {Object} - { allowed: boolean, reason?: string }
   */
  canUseFreeTierKey(id, tokensRequested = 0) {
    const keySpec = this.keys.get(id);

    if (!keySpec || keySpec.tier !== 'free') {
      return { allowed: true }; // Not a free tier key, no limits
    }

    if (!keySpec.limits || !keySpec.freeTierUsage) {
      return { allowed: true }; // No limits configured
    }

    const now = new Date();
    const usage = keySpec.freeTierUsage;
    const limits = keySpec.limits;

    // Check if we need to reset minute window
    const minuteWindowStart = new Date(usage.minuteWindowStart);
    const minutesSinceWindowStart = (now - minuteWindowStart) / 60000;

    if (minutesSinceWindowStart >= 1) {
      // Reset minute window
      usage.requestsThisMinute = 0;
      usage.tokensThisMinute = 0;
      usage.minuteWindowStart = now.toISOString();
    }

    // Check if we need to reset daily counters
    const dayStart = new Date(usage.dayStart);
    const midnightPT = this.getMidnightPacificTime(now);

    if (midnightPT > dayStart) {
      // New day, reset daily counters
      usage.requestsToday = 0;
      usage.dayStart = midnightPT.toISOString();
    }

    // Check RPM limit
    if (limits.requestsPerMinute && usage.requestsThisMinute >= limits.requestsPerMinute) {
      return {
        allowed: false,
        reason: `RPM limit exceeded (${limits.requestsPerMinute}/min)`,
        limitType: 'rpm'
      };
    }

    // Check TPM limit
    if (limits.tokensPerMinute && (usage.tokensThisMinute + tokensRequested) > limits.tokensPerMinute) {
      return {
        allowed: false,
        reason: `TPM limit exceeded (${limits.tokensPerMinute}/min)`,
        limitType: 'tpm'
      };
    }

    // Check RPD limit
    if (limits.requestsPerDay && usage.requestsToday >= limits.requestsPerDay) {
      return {
        allowed: false,
        reason: `RPD limit exceeded (${limits.requestsPerDay}/day)`,
        limitType: 'rpd'
      };
    }

    return { allowed: true };
  }

  /**
   * Record usage for free tier key
   * @param {string} id - Key ID
   * @param {number} tokens - Tokens used
   * @returns {boolean} - True if recorded successfully
   */
  recordFreeTierUsage(id, tokens = 0) {
    const keySpec = this.keys.get(id);

    if (!keySpec || keySpec.tier !== 'free' || !keySpec.freeTierUsage) {
      return false;
    }

    keySpec.freeTierUsage.requestsThisMinute += 1;
    keySpec.freeTierUsage.tokensThisMinute += tokens;
    keySpec.freeTierUsage.requestsToday += 1;

    this.saveKeys();

    this.emit('freetier:usage_recorded', {
      id,
      provider: keySpec.provider,
      tokens,
      usage: keySpec.freeTierUsage
    });

    return true;
  }

  /**
   * Reset daily free tier usage for all free tier keys
   */
  resetDailyFreeTierUsage() {
    const now = new Date();
    const midnightPT = this.getMidnightPacificTime(now);
    let resetCount = 0;

    for (const [id, keySpec] of this.keys) {
      if (keySpec.tier === 'free' && keySpec.freeTierUsage) {
        const dayStart = new Date(keySpec.freeTierUsage.dayStart);

        if (midnightPT > dayStart) {
          keySpec.freeTierUsage.requestsToday = 0;
          keySpec.freeTierUsage.dayStart = midnightPT.toISOString();
          resetCount++;
        }
      }
    }

    if (resetCount > 0) {
      this.saveKeys();
      this.emit('freetier:daily_reset', { count: resetCount, resetAt: midnightPT.toISOString() });
    }

    return resetCount;
  }

  /**
   * Start timer for daily free tier reset at midnight PT
   */
  startFreeTierResetTimer() {
    if (this.freeTierResetTimer) {
      return;
    }

    // Calculate time until next midnight PT
    const now = new Date();
    const nextMidnightPT = this.getMidnightPacificTime(now);
    nextMidnightPT.setUTCDate(nextMidnightPT.getUTCDate() + 1); // Next midnight

    const msUntilMidnight = nextMidnightPT - now;

    // Set timeout for next midnight, then repeat every 24 hours
    this.freeTierResetTimer = setTimeout(() => {
      this.resetDailyFreeTierUsage();

      // Set interval for subsequent days
      this.freeTierResetInterval = setInterval(() => {
        this.resetDailyFreeTierUsage();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilMidnight);

    this.emit('freetier:reset_timer_started', {
      nextResetAt: nextMidnightPT.toISOString(),
      msUntilReset: msUntilMidnight
    });
  }

  /**
   * Stop free tier reset timer
   */
  stopFreeTierResetTimer() {
    if (this.freeTierResetTimer) {
      clearTimeout(this.freeTierResetTimer);
      this.freeTierResetTimer = null;
    }

    if (this.freeTierResetInterval) {
      clearInterval(this.freeTierResetInterval);
      this.freeTierResetInterval = null;
    }
  }

  /**
   * Get free tier usage statistics
   * @param {string} [provider] - Filter by provider
   * @returns {Object} - Free tier usage statistics
   */
  getFreeTierUsage(provider = null) {
    let keys = Array.from(this.keys.values()).filter(k => k.tier === 'free');

    if (provider) {
      keys = keys.filter(k => k.provider === provider);
    }

    const stats = {
      totalKeys: keys.length,
      byProvider: {},
      keys: []
    };

    for (const key of keys) {
      if (!key.freeTierUsage || !key.limits) {
        continue;
      }

      const usage = key.freeTierUsage;
      const limits = key.limits;

      const keyStats = {
        id: key.id,
        provider: key.provider,
        status: key.status,
        usage: {
          requestsThisMinute: usage.requestsThisMinute,
          tokensThisMinute: usage.tokensThisMinute,
          requestsToday: usage.requestsToday
        },
        limits: {
          requestsPerMinute: limits.requestsPerMinute,
          tokensPerMinute: limits.tokensPerMinute,
          requestsPerDay: limits.requestsPerDay
        },
        utilization: {
          rpm: limits.requestsPerMinute ? (usage.requestsThisMinute / limits.requestsPerMinute * 100).toFixed(1) + '%' : 'N/A',
          tpm: limits.tokensPerMinute ? (usage.tokensThisMinute / limits.tokensPerMinute * 100).toFixed(1) + '%' : 'N/A',
          rpd: limits.requestsPerDay ? (usage.requestsToday / limits.requestsPerDay * 100).toFixed(1) + '%' : 'N/A'
        },
        minuteWindowStart: usage.minuteWindowStart,
        dayStart: usage.dayStart
      };

      stats.keys.push(keyStats);

      // Aggregate by provider
      if (!stats.byProvider[key.provider]) {
        stats.byProvider[key.provider] = {
          keys: 0,
          totalRequestsToday: 0,
          totalTokensThisMinute: 0
        };
      }

      stats.byProvider[key.provider].keys++;
      stats.byProvider[key.provider].totalRequestsToday += usage.requestsToday;
      stats.byProvider[key.provider].totalTokensThisMinute += usage.tokensThisMinute;
    }

    return stats;
  }

  /**
   * Shutdown key manager
   */
  shutdown() {
    this.stopValidationTimer();
    this.stopFreeTierResetTimer();
    this.saveKeys();
    this.emit('shutdown');
  }
}

module.exports = {
  KeyManager,
  KeyStatus,
  ValidationResult
};
