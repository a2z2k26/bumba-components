/**
 * Sprint 3-6: Rate Limiter System
 * Intelligent rate limiting with token bucket algorithm and request queuing
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class RateLimiter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.configDir = options.configDir || path.join(process.cwd(), '.bumba', 'rate-limiter');

    // Rate limits per provider/model
    this.limits = new Map();

    // Token buckets for each limit
    this.buckets = new Map();

    // Request queues
    this.queues = new Map();

    // Default rate limits (requests per period)
    this.defaultLimits = {
      'openai': {
        'gpt-4-0125-preview': { requests: 500, period: 60000, tokens: 10000 }, // 500 req/min, 10k tokens/min
        'gpt-3.5-turbo': { requests: 3500, period: 60000, tokens: 90000 }, // 3500 req/min, 90k tokens/min
        'default': { requests: 500, period: 60000, tokens: 10000 }
      },
      'anthropic': {
        'claude-sonnet-4-5-20250929': { requests: 50, period: 60000, tokens: 40000 }, // 50 req/min, 40k tokens/min
        'claude-3-opus-20240229': { requests: 50, period: 60000, tokens: 20000 },
        'claude-3-haiku-20240307': { requests: 50, period: 60000, tokens: 50000 },
        'default': { requests: 50, period: 60000, tokens: 40000 }
      },
      'default': {
        'default': { requests: 100, period: 60000, tokens: 10000 }
      }
    };

    // Statistics
    this.stats = {
      totalRequests: 0,
      rateLimited: 0,
      queued: 0,
      rejected: 0,
      byProvider: new Map()
    };

    // Configuration
    this.config = {
      enableQueuing: options.enableQueuing !== false,
      maxQueueSize: options.maxQueueSize || 100,
      autoAdjust: options.autoAdjust !== false,
      warningThreshold: options.warningThreshold || 0.8 // Warn at 80% capacity
    };
  }

  /**
   * Initialize rate limiter
   */
  async initialize() {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      await this.loadConfig();
      await this.loadStats();

      // Initialize default buckets
      for (const [provider, models] of Object.entries(this.defaultLimits)) {
        for (const [model, limit] of Object.entries(models)) {
          const key = `${provider}:${model}`;
          this.limits.set(key, limit);
          this.initializeBucket(key, limit);
        }
      }

      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Initialize a token bucket
   */
  initializeBucket(key, limit) {
    this.buckets.set(key, {
      tokens: limit.requests,
      maxTokens: limit.requests,
      refillRate: limit.requests / (limit.period / 1000), // tokens per second
      lastRefill: Date.now(),
      tokenLimit: limit.tokens || null, // Optional token-based rate limit
      tokensUsed: 0
    });

    this.queues.set(key, []);
  }

  /**
   * Check if a request can proceed
   */
  async checkLimit(provider, model, options = {}) {
    const { tokens = 0, priority = 0 } = options;

    const key = this.getLimitKey(provider, model);

    // Refill bucket
    this.refillBucket(key);

    const bucket = this.buckets.get(key);

    if (!bucket) {
      // No rate limit configured, allow request
      return { allowed: true, wait: 0 };
    }

    // Check request-based limit
    if (bucket.tokens < 1) {
      this.stats.rateLimited++;

      if (this.config.enableQueuing) {
        return await this.queueRequest(key, tokens, priority);
      } else {
        this.emit('rate-limited', { provider, model, key });
        return {
          allowed: false,
          wait: this.getWaitTime(key),
          reason: 'Rate limit exceeded'
        };
      }
    }

    // Check token-based limit (if configured)
    if (bucket.tokenLimit && tokens > 0) {
      if (bucket.tokensUsed + tokens > bucket.tokenLimit) {
        this.stats.rateLimited++;

        if (this.config.enableQueuing) {
          return await this.queueRequest(key, tokens, priority);
        } else {
          return {
            allowed: false,
            wait: this.getTokenWaitTime(key, tokens),
            reason: 'Token limit exceeded'
          };
        }
      }
    }

    // Check capacity and emit warning if needed
    const capacity = bucket.tokens / bucket.maxTokens;
    if (capacity < this.config.warningThreshold) {
      this.emit('capacity-warning', {
        provider,
        model,
        capacity: capacity.toFixed(2),
        remaining: Math.floor(bucket.tokens)
      });
    }

    return { allowed: true, wait: 0 };
  }

  /**
   * Consume a token from the bucket
   */
  async consume(provider, model, options = {}) {
    const { tokens = 0 } = options;

    const key = this.getLimitKey(provider, model);
    const bucket = this.buckets.get(key);

    if (!bucket) {
      this.stats.totalRequests++;
      this.trackProviderRequest(provider);
      return true;
    }

    // Consume request token
    bucket.tokens = Math.max(0, bucket.tokens - 1);

    // Track token usage
    if (bucket.tokenLimit && tokens > 0) {
      bucket.tokensUsed += tokens;
    }

    this.stats.totalRequests++;
    this.trackProviderRequest(provider);

    this.emit('request-consumed', { provider, model, key, remaining: Math.floor(bucket.tokens) });

    // Process queued requests if any
    setTimeout(() => this.processQueue(key), 0);

    return true;
  }

  /**
   * Queue a request
   */
  async queueRequest(key, tokens, priority) {
    const queue = this.queues.get(key);

    if (!queue) {
      return { allowed: false, wait: 0, reason: 'No queue configured' };
    }

    if (queue.length >= this.config.maxQueueSize) {
      this.stats.rejected++;
      return {
        allowed: false,
        wait: 0,
        reason: 'Queue full',
        queueSize: queue.length
      };
    }

    return new Promise((resolve) => {
      const request = {
        tokens,
        priority,
        resolve,
        timestamp: Date.now()
      };

      queue.push(request);
      this.stats.queued++;

      // Sort by priority (higher first) and timestamp (older first)
      queue.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });

      this.emit('request-queued', {
        key,
        queueSize: queue.length,
        priority,
        estimatedWait: this.getWaitTime(key)
      });
    });
  }

  /**
   * Process queued requests
   */
  processQueue(key) {
    const queue = this.queues.get(key);
    const bucket = this.buckets.get(key);

    if (!queue || !bucket || queue.length === 0) {
      return;
    }

    this.refillBucket(key);

    while (queue.length > 0 && bucket.tokens >= 1) {
      const request = queue.shift();

      // Check token limit
      if (bucket.tokenLimit && request.tokens > 0) {
        if (bucket.tokensUsed + request.tokens > bucket.tokenLimit) {
          // Put back in queue
          queue.unshift(request);
          break;
        }
        bucket.tokensUsed += request.tokens;
      }

      bucket.tokens = Math.max(0, bucket.tokens - 1);

      request.resolve({
        allowed: true,
        wait: Date.now() - request.timestamp,
        queued: true
      });

      this.emit('request-processed', {
        key,
        waitTime: Date.now() - request.timestamp,
        queueSize: queue.length
      });
    }

    // Schedule next processing if queue not empty
    if (queue.length > 0) {
      const waitTime = this.getWaitTime(key);
      setTimeout(() => this.processQueue(key), Math.min(waitTime, 1000));
    }
  }

  /**
   * Refill token bucket
   */
  refillBucket(key) {
    const bucket = this.buckets.get(key);

    if (!bucket) return;

    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds

    if (elapsed > 0) {
      const tokensToAdd = elapsed * bucket.refillRate;
      bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;

      // Reset token usage periodically
      const limit = this.limits.get(key);
      if (limit && elapsed >= limit.period / 1000) {
        bucket.tokensUsed = 0;
      }
    }
  }

  /**
   * Get wait time until next available request
   */
  getWaitTime(key) {
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.tokens >= 1) {
      return 0;
    }

    const tokensNeeded = 1 - bucket.tokens;
    const waitSeconds = tokensNeeded / bucket.refillRate;
    return Math.ceil(waitSeconds * 1000); // milliseconds
  }

  /**
   * Get wait time for token-based limit
   */
  getTokenWaitTime(key, tokensNeeded) {
    const bucket = this.buckets.get(key);
    const limit = this.limits.get(key);

    if (!bucket || !limit || !bucket.tokenLimit) {
      return 0;
    }

    // Wait for period to reset
    return limit.period;
  }

  /**
   * Get limit key for provider and model
   */
  getLimitKey(provider, model) {
    // Try specific model limit
    let key = `${provider}:${model}`;
    if (this.limits.has(key)) {
      return key;
    }

    // Try provider default
    key = `${provider}:default`;
    if (this.limits.has(key)) {
      return key;
    }

    // Use global default
    return 'default:default';
  }

  /**
   * Set custom rate limit
   */
  setLimit(provider, model, limit) {
    const key = `${provider}:${model}`;

    this.limits.set(key, limit);
    this.initializeBucket(key, limit);

    this.emit('limit-updated', { provider, model, limit });
  }

  /**
   * Handle 429 rate limit error
   */
  async handleRateLimitError(provider, model, retryAfter = null) {
    const key = this.getLimitKey(provider, model);
    const bucket = this.buckets.get(key);

    if (!bucket) return;

    // Adjust limit if auto-adjust enabled
    if (this.config.autoAdjust) {
      const limit = this.limits.get(key);

      if (limit) {
        // Reduce limit by 20%
        const newLimit = {
          ...limit,
          requests: Math.floor(limit.requests * 0.8)
        };

        this.setLimit(provider, model, newLimit);

        this.emit('limit-auto-adjusted', {
          provider,
          model,
          oldLimit: limit.requests,
          newLimit: newLimit.requests,
          reason: '429 error'
        });
      }
    }

    // If retryAfter provided, deplete bucket
    if (retryAfter) {
      bucket.tokens = 0;
      bucket.lastRefill = Date.now() + retryAfter;
    }
  }

  /**
   * Get current status
   */
  getStatus(provider = null, model = null) {
    if (provider && model) {
      const key = this.getLimitKey(provider, model);
      return this.getBucketStatus(key);
    }

    const status = {};

    for (const [key, bucket] of this.buckets.entries()) {
      status[key] = this.getBucketStatus(key);
    }

    return status;
  }

  /**
   * Get bucket status
   */
  getBucketStatus(key) {
    const bucket = this.buckets.get(key);
    const limit = this.limits.get(key);
    const queue = this.queues.get(key);

    if (!bucket || !limit) {
      return null;
    }

    this.refillBucket(key);

    return {
      available: Math.floor(bucket.tokens),
      max: bucket.maxTokens,
      capacity: (bucket.tokens / bucket.maxTokens * 100).toFixed(1) + '%',
      refillRate: bucket.refillRate.toFixed(2) + ' req/s',
      queueSize: queue ? queue.length : 0,
      tokenLimit: bucket.tokenLimit,
      tokensUsed: bucket.tokensUsed,
      tokenCapacity: bucket.tokenLimit
        ? ((1 - bucket.tokensUsed / bucket.tokenLimit) * 100).toFixed(1) + '%'
        : null
    };
  }

  /**
   * Reset all limits
   */
  reset() {
    for (const [key, bucket] of this.buckets.entries()) {
      bucket.tokens = bucket.maxTokens;
      bucket.tokensUsed = 0;
      bucket.lastRefill = Date.now();
    }

    for (const queue of this.queues.values()) {
      for (const request of queue) {
        request.resolve({ allowed: false, wait: 0, reason: 'Reset' });
      }
      queue.length = 0;
    }

    this.emit('reset');
  }

  /**
   * Track provider request
   */
  trackProviderRequest(provider) {
    const count = this.stats.byProvider.get(provider) || 0;
    this.stats.byProvider.set(provider, count + 1);
  }

  /**
   * Get statistics
   */
  getStats() {
    const byProvider = Array.from(this.stats.byProvider.entries())
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalRequests: this.stats.totalRequests,
      rateLimited: this.stats.rateLimited,
      queued: this.stats.queued,
      rejected: this.stats.rejected,
      byProvider
    };
  }

  /**
   * Reset statistics
   */
  async resetStats() {
    this.stats = {
      totalRequests: 0,
      rateLimited: 0,
      queued: 0,
      rejected: 0,
      byProvider: new Map()
    };

    await this.saveStats();
  }

  /**
   * Load configuration
   */
  async loadConfig() {
    try {
      const configPath = path.join(this.configDir, 'config.json');
      const data = await fs.readFile(configPath, 'utf-8');
      const loaded = JSON.parse(data);

      if (loaded.limits) {
        for (const [key, limit] of Object.entries(loaded.limits)) {
          this.limits.set(key, limit);
        }
      }

      if (loaded.config) {
        this.config = { ...this.config, ...loaded.config };
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.emit('error', error);
      }
    }
  }

  /**
   * Save configuration
   */
  async saveConfig() {
    try {
      const configPath = path.join(this.configDir, 'config.json');
      const data = {
        limits: Object.fromEntries(this.limits.entries()),
        config: this.config,
        updatedAt: new Date().toISOString()
      };

      await fs.writeFile(configPath, JSON.stringify(data, null, 2));
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Load statistics
   */
  async loadStats() {
    try {
      const statsPath = path.join(this.configDir, 'stats.json');
      const data = await fs.readFile(statsPath, 'utf-8');
      const loaded = JSON.parse(data);

      this.stats.totalRequests = loaded.totalRequests || 0;
      this.stats.rateLimited = loaded.rateLimited || 0;
      this.stats.queued = loaded.queued || 0;
      this.stats.rejected = loaded.rejected || 0;
      this.stats.byProvider = new Map(loaded.byProvider || []);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.emit('error', error);
      }
    }
  }

  /**
   * Save statistics
   */
  async saveStats() {
    try {
      const statsPath = path.join(this.configDir, 'stats.json');
      const data = {
        totalRequests: this.stats.totalRequests,
        rateLimited: this.stats.rateLimited,
        queued: this.stats.queued,
        rejected: this.stats.rejected,
        byProvider: Array.from(this.stats.byProvider.entries()),
        updatedAt: new Date().toISOString()
      };

      await fs.writeFile(statsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      this.emit('error', error);
    }
  }
}

module.exports = RateLimiter;
