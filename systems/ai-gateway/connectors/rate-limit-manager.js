/**
 * Rate Limiting & Quota Coordination for BUMBA
 * Sprint 2.9: Unified rate limiting across all AI providers
 *
 * Provides:
 * - Rate limiting with multiple window strategies
 * - Quota management and tracking
 * - Request queue with priority
 * - Adaptive throttling
 * - Cross-provider coordination
 */

const EventEmitter = require('events');

/**
 * Rate limiter with multiple window strategies
 *
 * @class RateLimiter
 * @description Implements rate limiting using sliding window, fixed window, or token bucket strategies
 * @param {Object} options - Configuration options
 * @param {number} options.requestsPerWindow - Number of requests allowed per window (default: 60)
 * @param {number} options.windowMs - Window size in milliseconds (default: 60000)
 * @param {string} options.strategy - Rate limiting strategy: 'sliding', 'fixed', or 'token-bucket' (default: 'sliding')
 */
class RateLimiter {
  constructor(options = {}) {
    this.options = {
      requestsPerWindow: options.requestsPerWindow || 60,
      windowMs: options.windowMs || 60000, // 1 minute
      strategy: options.strategy || 'sliding', // sliding, fixed, token-bucket
      ...options
    };

    // Request tracking
    this.requests = [];
    this.tokens = this.options.requestsPerWindow; // For token bucket
    this.lastRefill = Date.now();
  }

  /**
   * Check if request is allowed
   * @returns {Promise<Object>} Result with allowed, remaining, resetAt, retryAfter
   */
  async checkLimit() {
    const now = Date.now();

    if (this.options.strategy === 'token-bucket') {
      return this.checkTokenBucket(now);
    } else if (this.options.strategy === 'fixed') {
      return this.checkFixedWindow(now);
    } else {
      return this.checkSlidingWindow(now);
    }
  }

  /**
   * Sliding window rate limiting
   */
  checkSlidingWindow(now) {
    // Remove old requests outside the window
    const windowStart = now - this.options.windowMs;
    this.requests = this.requests.filter(time => time > windowStart);

    // Check if under limit
    if (this.requests.length < this.options.requestsPerWindow) {
      this.requests.push(now);
      return {
        allowed: true,
        remaining: this.options.requestsPerWindow - this.requests.length,
        resetAt: this.requests[0] + this.options.windowMs,
        retryAfter: 0
      };
    }

    // Calculate retry time
    const oldestRequest = this.requests[0];
    const retryAfter = Math.ceil((oldestRequest + this.options.windowMs - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestRequest + this.options.windowMs,
      retryAfter
    };
  }

  /**
   * Fixed window rate limiting
   */
  checkFixedWindow(now) {
    const windowStart = Math.floor(now / this.options.windowMs) * this.options.windowMs;
    const windowEnd = windowStart + this.options.windowMs;

    // Remove requests from previous windows
    this.requests = this.requests.filter(time => time >= windowStart);

    if (this.requests.length < this.options.requestsPerWindow) {
      this.requests.push(now);
      return {
        allowed: true,
        remaining: this.options.requestsPerWindow - this.requests.length,
        resetAt: windowEnd,
        retryAfter: 0
      };
    }

    const retryAfter = Math.ceil((windowEnd - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      resetAt: windowEnd,
      retryAfter
    };
  }

  /**
   * Token bucket rate limiting
   */
  checkTokenBucket(now) {
    // Refill tokens based on time passed
    const timePassed = now - this.lastRefill;
    const refillRate = this.options.requestsPerWindow / this.options.windowMs;
    const tokensToAdd = Math.floor(timePassed * refillRate);

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.options.requestsPerWindow, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }

    // Check if we have tokens
    if (this.tokens >= 1) {
      this.tokens--;
      return {
        allowed: true,
        remaining: this.tokens,
        resetAt: now + this.options.windowMs,
        retryAfter: 0
      };
    }

    // Calculate when next token will be available
    const msPerToken = this.options.windowMs / this.options.requestsPerWindow;
    const retryAfter = Math.ceil(msPerToken / 1000);

    return {
      allowed: false,
      remaining: 0,
      resetAt: now + msPerToken,
      retryAfter
    };
  }

  /**
   * Reset limiter
   */
  reset() {
    this.requests = [];
    this.tokens = this.options.requestsPerWindow;
    this.lastRefill = Date.now();
  }

  /**
   * Get current status
   */
  getStatus() {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    const currentRequests = this.requests.filter(time => time > windowStart);

    return {
      strategy: this.options.strategy,
      limit: this.options.requestsPerWindow,
      windowMs: this.options.windowMs,
      current: currentRequests.length,
      requestsRemaining: Math.max(0, this.options.requestsPerWindow - currentRequests.length),
      remaining: Math.max(0, this.options.requestsPerWindow - currentRequests.length),
      resetAt: this.requests.length > 0 ? this.requests[0] + this.options.windowMs : now + this.options.windowMs,
      tokens: this.tokens
    };
  }
}

/**
 * Quota manager for tracking usage limits
 *
 * @class QuotaManager
 * @extends EventEmitter
 * @description Manages daily and monthly quota tracking with threshold alerts
 * @param {Object} options - Configuration options
 * @param {number} options.dailyQuota - Daily request limit
 * @param {number} options.monthlyQuota - Monthly request limit
 * @param {number[]} options.alertThresholds - Threshold percentages for alerts (default: [0.8, 0.9, 0.95])
 */
class QuotaManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      dailyQuota: options.dailyQuota || null,
      monthlyQuota: options.monthlyQuota || null,
      alertThresholds: options.alertThresholds || [0.8, 0.9, 0.95],
      ...options
    };

    // Usage tracking
    this.usage = {
      daily: 0,
      monthly: 0,
      byProvider: {},
      history: []
    };

    // Alert tracking
    this.alertsSent = {
      daily: new Set(),
      monthly: new Set()
    };

    // Reset tracking
    this.lastReset = {
      daily: new Date(),
      monthly: this.getMonthStart()
    };
  }

  /**
   * Record quota usage
   */
  recordUsage(provider, amount = 1) {
    this.usage.daily += amount;
    this.usage.monthly += amount;

    // Track by provider
    if (!this.usage.byProvider[provider]) {
      this.usage.byProvider[provider] = { daily: 0, monthly: 0 };
    }
    this.usage.byProvider[provider].daily += amount;
    this.usage.byProvider[provider].monthly += amount;

    // Add to history
    this.usage.history.push({
      timestamp: new Date().toISOString(),
      provider,
      amount
    });

    // Limit history
    if (this.usage.history.length > 10000) {
      this.usage.history.shift();
    }

    // Check quotas
    this.checkQuotas();

    this.emit('quota:used', {
      provider,
      amount,
      daily: this.usage.daily,
      monthly: this.usage.monthly
    });
  }

  /**
   * Check if usage would exceed quota
   */
  wouldExceedQuota(amount = 1) {
    const checks = [];

    if (this.options.dailyQuota) {
      const wouldExceed = (this.usage.daily + amount) > this.options.dailyQuota;
      checks.push({
        period: 'daily',
        wouldExceed,
        current: this.usage.daily,
        requested: amount,
        limit: this.options.dailyQuota,
        remaining: this.options.dailyQuota - this.usage.daily
      });
    }

    if (this.options.monthlyQuota) {
      const wouldExceed = (this.usage.monthly + amount) > this.options.monthlyQuota;
      checks.push({
        period: 'monthly',
        wouldExceed,
        current: this.usage.monthly,
        requested: amount,
        limit: this.options.monthlyQuota,
        remaining: this.options.monthlyQuota - this.usage.monthly
      });
    }

    return {
      wouldExceed: checks.some(c => c.wouldExceed),
      checks
    };
  }

  /**
   * Check quotas and emit alerts
   */
  checkQuotas() {
    if (this.options.dailyQuota) {
      this.checkQuota('daily', this.usage.daily, this.options.dailyQuota);
    }

    if (this.options.monthlyQuota) {
      this.checkQuota('monthly', this.usage.monthly, this.options.monthlyQuota);
    }
  }

  /**
   * Check specific quota
   */
  checkQuota(period, usage, quota) {
    const percentage = usage / quota;

    // Check if exceeded
    if (percentage >= 1.0) {
      this.emit('quota:exceeded', {
        period,
        usage,
        quota,
        percentage: percentage * 100
      });
      return;
    }

    // Check thresholds
    for (const threshold of this.options.alertThresholds) {
      if (percentage >= threshold && !this.alertsSent[period].has(threshold)) {
        this.alertsSent[period].add(threshold);

        this.emit('quota:alert', {
          period,
          threshold: threshold, // Keep as decimal (0.8 not 80)
          usage,
          quota,
          current: usage,
          percentage: percentage * 100,
          remaining: quota - usage
        });
      }
    }
  }

  /**
   * Get quota summary
   */
  getSummary() {
    return {
      daily: this.usage.daily,
      monthly: this.usage.monthly,
      byProvider: { ...this.usage.byProvider }
    };
  }

  /**
   * Get detailed usage breakdown
   */
  getUsageBreakdown() {
    return {
      daily: {
        total: this.usage.daily,
        quota: this.options.dailyQuota,
        percentage: this.options.dailyQuota ? (this.usage.daily / this.options.dailyQuota) * 100 : null,
        remaining: this.options.dailyQuota ? this.options.dailyQuota - this.usage.daily : null
      },
      monthly: {
        total: this.usage.monthly,
        quota: this.options.monthlyQuota,
        percentage: this.options.monthlyQuota ? (this.usage.monthly / this.options.monthlyQuota) * 100 : null,
        remaining: this.options.monthlyQuota ? this.options.monthlyQuota - this.usage.monthly : null
      },
      byProvider: { ...this.usage.byProvider }
    };
  }

  /**
   * Reset daily quota
   */
  resetDaily() {
    this.reset('daily');
  }

  /**
   * Reset monthly quota
   */
  resetMonthly() {
    this.reset('monthly');
  }

  /**
   * Reset quota period
   */
  reset(period) {
    if (period === 'daily' || period === 'all') {
      this.usage.daily = 0;
      this.alertsSent.daily.clear();
      this.lastReset.daily = new Date();

      for (const provider in this.usage.byProvider) {
        this.usage.byProvider[provider].daily = 0;
      }
    }

    if (period === 'monthly' || period === 'all') {
      this.usage.monthly = 0;
      this.alertsSent.monthly.clear();
      this.lastReset.monthly = this.getMonthStart();

      for (const provider in this.usage.byProvider) {
        this.usage.byProvider[provider].monthly = 0;
      }
    }

    this.emit('quota:reset', { period });
  }

  /**
   * Auto-reset if needed
   */
  autoReset() {
    const now = new Date();

    // Check daily reset
    if (now.getDate() !== this.lastReset.daily.getDate()) {
      this.reset('daily');
    }

    // Check monthly reset
    const monthStart = this.getMonthStart();
    if (monthStart > this.lastReset.monthly) {
      this.reset('monthly');
    }
  }

  /**
   * Get start of current month
   */
  getMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

/**
 * Request queue with priority ordering
 *
 * @class RequestQueue
 * @extends EventEmitter
 * @description Priority-based request queue with FIFO ordering within same priority
 * @param {Object} options - Configuration options
 * @param {number} options.maxSize - Maximum queue size (default: 1000)
 * @param {number} options.defaultPriority - Default priority for requests (default: 5)
 */
class RequestQueue extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxSize: options.maxSize || 1000,
      defaultPriority: options.defaultPriority || 5,
      ...options
    };

    this.queue = [];
    this.processing = false;
  }

  /**
   * Add request to queue
   */
  enqueue(request, priority = null) {
    if (this.queue.length >= this.options.maxSize) {
      throw new Error('Queue is full');
    }

    const queueItem = {
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      request,
      priority: priority !== null ? priority : this.options.defaultPriority,
      addedAt: Date.now(),
      promise: null,
      resolve: null,
      reject: null
    };

    // Create promise for this request
    queueItem.promise = new Promise((resolve, reject) => {
      queueItem.resolve = resolve;
      queueItem.reject = reject;
    });

    // Insert in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if (queueItem.priority > this.queue[i].priority) {
        this.queue.splice(i, 0, queueItem);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.queue.push(queueItem);
    }

    this.emit('queue:added', {
      id: queueItem.id,
      size: this.queue.length,
      priority: queueItem.priority
    });

    return queueItem;
  }

  /**
   * Dequeue next request
   */
  dequeue() {
    if (this.queue.length === 0) return null;

    const item = this.queue.shift();

    this.emit('queue:dequeued', {
      id: item.id,
      size: this.queue.length,
      waitTime: Date.now() - item.addedAt
    });

    return item;
  }

  /**
   * Peek at next request without removing
   */
  peek() {
    return this.queue[0] || null;
  }

  /**
   * Get queue size
   */
  size() {
    return this.queue.length;
  }

  /**
   * Clear queue
   */
  clear() {
    // Reject all pending requests
    for (const item of this.queue) {
      item.reject(new Error('Queue cleared'));
    }

    this.queue = [];
    this.emit('queue:cleared');
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      size: this.queue.length,
      maxSize: this.options.maxSize,
      processing: this.processing,
      oldestWaitTime: this.queue.length > 0 ? Date.now() - this.queue[0].addedAt : 0
    };
  }
}

/**
 * Adaptive throttler that learns from rate limit responses
 *
 * @class AdaptiveThrottler
 * @extends EventEmitter
 * @description Implements exponential backoff and adaptive throttling based on rate limit hits
 * @param {Object} options - Configuration options
 * @param {number} options.initialDelay - Initial delay in milliseconds (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in milliseconds (default: 60000)
 * @param {number} options.backoffMultiplier - Backoff multiplier (default: 2)
 * @param {number} options.cooldownFactor - Cooldown factor on success (default: 0.5)
 */
class AdaptiveThrottler extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 60000,
      backoffMultiplier: options.backoffMultiplier || 2,
      cooldownFactor: options.cooldownFactor || 0.5,
      ...options
    };

    this.currentDelay = this.options.initialDelay;
    this.consecutiveRateLimits = 0;
    this.lastRateLimitTime = null;
  }

  /**
   * Record rate limit hit
   */
  recordRateLimit(retryAfter = null) {
    this.consecutiveRateLimits++;
    this.lastRateLimitTime = Date.now();

    // Use retryAfter if provided, otherwise use exponential backoff
    if (retryAfter) {
      this.currentDelay = retryAfter * 1000; // Convert to ms
    } else {
      this.currentDelay = Math.min(
        this.currentDelay * this.options.backoffMultiplier,
        this.options.maxDelay
      );
    }

    this.emit('throttle:increased', {
      delay: this.currentDelay,
      consecutiveHits: this.consecutiveRateLimits
    });

    return this.currentDelay;
  }

  /**
   * Record successful request
   */
  recordSuccess() {
    this.consecutiveRateLimits = 0;

    // Gradually reduce delay on success
    if (this.currentDelay > this.options.initialDelay) {
      this.currentDelay = Math.max(
        this.options.initialDelay,
        this.currentDelay * this.options.cooldownFactor
      );

      this.emit('throttle:decreased', {
        delay: this.currentDelay
      });
    }
  }

  /**
   * Get current delay
   */
  getDelay() {
    return this.currentDelay;
  }

  /**
   * Get current delay (alias)
   */
  getCurrentDelay() {
    return this.currentDelay;
  }

  /**
   * Reset throttler
   */
  reset() {
    this.currentDelay = this.options.initialDelay;
    this.consecutiveRateLimits = 0;
    this.lastRateLimitTime = null;

    this.emit('throttle:reset');
  }

  /**
   * Wait for throttle delay
   */
  async wait() {
    if (this.currentDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.currentDelay));
    }
  }
}

/**
 * Main rate limit coordinator
 *
 * @class RateLimitCoordinator
 * @extends EventEmitter
 * @description Orchestrates rate limiting, quota management, queueing, and adaptive throttling across all providers
 * @param {Object} options - Configuration options
 * @param {boolean} options.enableRateLimiting - Enable rate limiting (default: true)
 * @param {boolean} options.enableQuotaManagement - Enable quota management (default: true)
 * @param {boolean} options.enableQueueing - Enable request queueing (default: true)
 * @param {boolean} options.enableAdaptiveThrottling - Enable adaptive throttling (default: true)
 * @param {Object} options.quota - QuotaManager options
 * @param {Object} options.queue - RequestQueue options
 */
class RateLimitCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enableRateLimiting: options.enableRateLimiting !== false,
      enableQuotaManagement: options.enableQuotaManagement !== false,
      enableQueueing: options.enableQueueing !== false,
      enableAdaptiveThrottling: options.enableAdaptiveThrottling !== false,
      autoReset: options.autoReset !== false,
      resetInterval: options.resetInterval || 3600000, // 1 hour
      ...options
    };

    // Create components
    this.rateLimiters = new Map(); // provider -> RateLimiter
    this.quotaManager = new QuotaManager(options.quota || {});
    this.requestQueue = new RequestQueue(options.queue || {});
    this.throttlers = new Map(); // provider -> AdaptiveThrottler

    // Forward events
    this.quotaManager.on('quota:used', (data) => this.emit('quota:used', data));
    this.quotaManager.on('quota:alert', (data) => this.emit('quota:alert', data));
    this.quotaManager.on('quota:exceeded', (data) => this.emit('quota:exceeded', data));
    this.quotaManager.on('quota:reset', (data) => this.emit('quota:reset', data));

    this.requestQueue.on('queue:added', (data) => this.emit('queue:added', data));
    this.requestQueue.on('queue:dequeued', (data) => this.emit('queue:dequeued', data));
    this.requestQueue.on('queue:cleared', () => this.emit('queue:cleared'));

    // Set up auto-reset
    if (this.options.autoReset) {
      this.resetTimer = setInterval(() => {
        this.quotaManager.autoReset();
      }, this.options.resetInterval);
    }
  }

  /**
   * Register rate limiter for a provider
   */
  registerProvider(provider, limits = {}) {
    const rateLimiter = new RateLimiter(limits);
    this.rateLimiters.set(provider, rateLimiter);

    if (this.options.enableAdaptiveThrottling) {
      const throttler = new AdaptiveThrottler(limits.throttle || {});
      throttler.on('throttle:increased', (data) => {
        this.emit('throttle:increased', { provider, ...data });
      });
      throttler.on('throttle:decreased', (data) => {
        this.emit('throttle:decreased', { provider, ...data });
      });
      this.throttlers.set(provider, throttler);
    }
  }

  /**
   * Check if provider is registered
   */
  hasProvider(provider) {
    return this.rateLimiters.has(provider);
  }

  /**
   * Check if request is allowed
   */
  async checkRequest(provider) {
    const checks = {
      allowed: true,
      reason: null,
      rateLimit: null,
      quota: null,
      queue: null
    };

    // Check rate limit
    if (this.options.enableRateLimiting && this.rateLimiters.has(provider)) {
      const rateLimiter = this.rateLimiters.get(provider);
      checks.rateLimit = await rateLimiter.checkLimit();

      if (!checks.rateLimit.allowed) {
        checks.allowed = false;
        checks.reason = 'rate_limit';
        return checks;
      }
    }

    // Check quota
    if (this.options.enableQuotaManagement) {
      checks.quota = this.quotaManager.wouldExceedQuota(1);

      if (checks.quota.wouldExceed) {
        checks.allowed = false;
        checks.reason = 'quota_exceeded';
        return checks;
      }
    }

    // Check throttle
    if (this.options.enableAdaptiveThrottling && this.throttlers.has(provider)) {
      const throttler = this.throttlers.get(provider);
      await throttler.wait();
    }

    return checks;
  }

  /**
   * Record successful request
   */
  recordSuccess(provider) {
    // Record quota usage
    if (this.options.enableQuotaManagement) {
      this.quotaManager.recordUsage(provider, 1);
    }

    // Record throttler success
    if (this.options.enableAdaptiveThrottling && this.throttlers.has(provider)) {
      this.throttlers.get(provider).recordSuccess();
    }

    this.emit('request:success', { provider });
  }

  /**
   * Record rate limit hit
   */
  recordRateLimit(provider, retryAfter = null) {
    if (this.options.enableAdaptiveThrottling && this.throttlers.has(provider)) {
      this.throttlers.get(provider).recordRateLimit(retryAfter);
    }

    this.emit('request:rate_limited', { provider, retryAfter });
  }

  /**
   * Get status for all providers
   */
  getStatus() {
    const status = {
      providers: Array.from(this.rateLimiters.keys()),
      rateLimits: {},
      quota: this.quotaManager.getSummary(),
      queue: this.requestQueue.getStatus(),
      throttlers: {}
    };

    for (const [provider, limiter] of this.rateLimiters.entries()) {
      status.rateLimits[provider] = limiter.getStatus();
    }

    for (const [provider, throttler] of this.throttlers.entries()) {
      status.throttlers[provider] = {
        currentDelay: throttler.getDelay(),
        consecutiveHits: throttler.consecutiveRateLimits
      };
    }

    return status;
  }

  /**
   * Get quota summary
   */
  getQuotaSummary() {
    return this.quotaManager.getSummary();
  }

  /**
   * Get throttler info for a provider
   */
  getThrottlerInfo(provider) {
    if (!this.throttlers.has(provider)) {
      return null;
    }

    const throttler = this.throttlers.get(provider);
    return {
      currentDelay: throttler.getCurrentDelay(),
      consecutiveHits: throttler.consecutiveRateLimits,
      lastRateLimitTime: throttler.lastRateLimitTime
    };
  }

  /**
   * Reset rate limiters
   */
  reset(provider = null) {
    if (provider) {
      if (this.rateLimiters.has(provider)) {
        this.rateLimiters.get(provider).reset();
      }
      if (this.throttlers.has(provider)) {
        this.throttlers.get(provider).reset();
      }
    } else {
      for (const limiter of this.rateLimiters.values()) {
        limiter.reset();
      }
      for (const throttler of this.throttlers.values()) {
        throttler.reset();
      }
    }

    this.emit('rate_limit:reset', { provider });
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.resetTimer) {
      clearInterval(this.resetTimer);
    }

    this.requestQueue.clear();
  }
}

module.exports = {
  RateLimitCoordinator,
  RateLimiter,
  QuotaManager,
  RequestQueue,
  AdaptiveThrottler
};
