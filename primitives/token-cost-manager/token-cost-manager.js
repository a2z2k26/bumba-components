/**
 * Token & Cost Management for BUMBA
 * Sprint 2.8: Comprehensive token counting, cost tracking, and budget management
 *
 * Provides:
 * - Token counting and estimation
 * - Cost calculation per provider/model
 * - Budget management and alerts
 * - Cost optimization recommendations
 * - Usage analytics and reporting
 */

const EventEmitter = require('events');

/**
 * Token counter with multiple estimation strategies
 */
class TokenCounter {
  constructor() {
    // Average characters per token by model family
    this.charsPerToken = {
      gpt: 4,          // GPT models
      claude: 4,       // Claude models
      gemini: 4,       // Gemini models
      llama: 4.5,      // LLaMA models
      mistral: 4,      // Mistral models
      default: 4       // Default estimation
    };
  }

  /**
   * Estimate tokens from text
   */
  estimateTokens(text, model = 'default') {
    if (!text) return 0;

    // Determine model family
    const modelFamily = this.getModelFamily(model);
    const charsPerToken = this.charsPerToken[modelFamily] || this.charsPerToken.default;

    // Basic estimation: characters / chars_per_token
    const basicEstimate = Math.ceil(text.length / charsPerToken);

    // Adjust for whitespace and punctuation
    const words = text.split(/\s+/).length;
    const punctuation = (text.match(/[.,!?;:]/g) || []).length;

    // More accurate estimation considering word boundaries
    const adjustedEstimate = Math.ceil(words * 1.3 + punctuation * 0.5);

    // Return the average of both methods
    return Math.ceil((basicEstimate + adjustedEstimate) / 2);
  }

  /**
   * Count tokens in messages array
   */
  countMessages(messages, model = 'default') {
    if (!Array.isArray(messages)) return 0;

    let totalTokens = 0;

    for (const message of messages) {
      // Count message content
      if (message.content) {
        totalTokens += this.estimateTokens(message.content, model);
      }

      // Add overhead for message structure (role, formatting)
      totalTokens += 4; // Approximate overhead per message

      // Count tool calls if present
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.function?.arguments) {
            totalTokens += this.estimateTokens(JSON.stringify(toolCall.function.arguments), model);
          }
        }
      }
    }

    return totalTokens;
  }

  /**
   * Get model family from model name
   */
  getModelFamily(model) {
    const modelLower = model.toLowerCase();

    if (modelLower.includes('gpt')) return 'gpt';
    if (modelLower.includes('claude')) return 'claude';
    if (modelLower.includes('gemini')) return 'gemini';
    if (modelLower.includes('llama')) return 'llama';
    if (modelLower.includes('mistral')) return 'mistral';

    return 'default';
  }

  /**
   * Estimate tokens for tools/functions
   */
  estimateToolTokens(tools) {
    if (!Array.isArray(tools)) return 0;

    let totalTokens = 0;

    for (const tool of tools) {
      // Estimate tokens for tool definition
      const toolJson = JSON.stringify(tool);
      totalTokens += this.estimateTokens(toolJson);
    }

    return totalTokens;
  }
}

/**
 * Cost calculator with per-provider/model pricing
 */
class CostCalculator {
  constructor() {
    // Pricing data (per 1M tokens) - updated as of 2025
    this.pricing = {
      openai: {
        'gpt-4': { input: 30, output: 60 },
        'gpt-4-turbo': { input: 10, output: 30 },
        'gpt-4o': { input: 5, output: 15 },
        'gpt-4o-mini': { input: 0.15, output: 0.6 },
        'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
        'text-embedding-3-small': { input: 0.02, output: 0 },
        'text-embedding-3-large': { input: 0.13, output: 0 }
      },
      anthropic: {
        'claude-3-opus': { input: 15, output: 75 },
        'claude-3-sonnet': { input: 3, output: 15 },
        'claude-3-haiku': { input: 0.25, output: 1.25 },
        'claude-3-5-sonnet': { input: 3, output: 15 },
        'claude-3-5-haiku': { input: 1, output: 5 }
      },
      google: {
        'gemini-1.5-pro': { input: 3.5, output: 10.5 },
        'gemini-1.5-flash': { input: 0.075, output: 0.3 },
        'gemini-1.0-pro': { input: 0.5, output: 1.5 }
      },
      openrouter: {
        // OpenRouter uses dynamic pricing, these are averages
        'default': { input: 2, output: 6 }
      }
    };
  }

  /**
   * Calculate cost for a request
   */
  calculateCost(provider, model, inputTokens, outputTokens) {
    const providerPricing = this.pricing[provider];

    if (!providerPricing) {
      // Unknown provider, use rough estimate
      return ((inputTokens * 2) + (outputTokens * 6)) / 1000000;
    }

    // Find model pricing
    let modelPricing = providerPricing[model];

    if (!modelPricing) {
      // Try to find partial match
      const modelKey = Object.keys(providerPricing).find(key =>
        model.toLowerCase().includes(key.toLowerCase())
      );

      modelPricing = modelKey ? providerPricing[modelKey] : providerPricing.default || { input: 2, output: 6 };
    }

    // Calculate cost (pricing is per 1M tokens)
    const inputCost = (inputTokens * modelPricing.input) / 1000000;
    const outputCost = (outputTokens * modelPricing.output) / 1000000;

    return inputCost + outputCost;
  }

  /**
   * Get pricing info for a model
   */
  getPricing(provider, model) {
    const providerPricing = this.pricing[provider];

    if (!providerPricing) return null;

    return providerPricing[model] || providerPricing.default || null;
  }

  /**
   * Estimate cost before making request
   */
  estimateCost(provider, model, estimatedInputTokens, estimatedOutputTokens = 0) {
    return this.calculateCost(provider, model, estimatedInputTokens, estimatedOutputTokens);
  }

  /**
   * Compare costs across providers for same input
   */
  compareCosts(inputTokens, outputTokens, providers = ['openai', 'anthropic', 'google']) {
    const comparisons = [];

    for (const provider of providers) {
      const providerPricing = this.pricing[provider];
      if (!providerPricing) continue;

      for (const [model, pricing] of Object.entries(providerPricing)) {
        if (model === 'default') continue;

        const cost = this.calculateCost(provider, model, inputTokens, outputTokens);

        comparisons.push({
          provider,
          model,
          cost,
          costPerMillion: {
            input: pricing.input,
            output: pricing.output
          }
        });
      }
    }

    // Sort by cost (cheapest first)
    comparisons.sort((a, b) => a.cost - b.cost);

    return comparisons;
  }
}

/**
 * Budget manager with limits and alerts
 */
class BudgetManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      dailyLimit: options.dailyLimit || null,
      weeklyLimit: options.weeklyLimit || null,
      monthlyLimit: options.monthlyLimit || null,
      alertThresholds: options.alertThresholds || [0.5, 0.75, 0.9], // 50%, 75%, 90%
      ...options
    };

    // Spending tracking
    this.spending = {
      daily: 0,
      weekly: 0,
      monthly: 0,
      byProvider: {},
      byModel: {},
      history: []
    };

    // Alert tracking
    this.alertsSent = {
      daily: new Set(),
      weekly: new Set(),
      monthly: new Set()
    };

    // Reset timers
    this.lastReset = {
      daily: new Date(),
      weekly: this.getWeekStart(),
      monthly: this.getMonthStart()
    };
  }

  /**
   * Record spending
   */
  recordSpending(provider, model, cost) {
    // Update spending
    this.spending.daily += cost;
    this.spending.weekly += cost;
    this.spending.monthly += cost;

    // By provider
    if (!this.spending.byProvider[provider]) {
      this.spending.byProvider[provider] = 0;
    }
    this.spending.byProvider[provider] += cost;

    // By model
    const modelKey = `${provider}:${model}`;
    if (!this.spending.byModel[modelKey]) {
      this.spending.byModel[modelKey] = 0;
    }
    this.spending.byModel[modelKey] += cost;

    // Add to history
    this.spending.history.push({
      timestamp: new Date().toISOString(),
      provider,
      model,
      cost
    });

    // Limit history to last 1000 entries
    if (this.spending.history.length > 1000) {
      this.spending.history.shift();
    }

    // Check budgets and emit alerts
    this.checkBudgets();

    this.emit('spending:recorded', {
      provider,
      model,
      cost,
      daily: this.spending.daily,
      weekly: this.spending.weekly,
      monthly: this.spending.monthly
    });
  }

  /**
   * Check budgets and emit alerts
   */
  checkBudgets() {
    // Check daily budget
    if (this.options.dailyLimit) {
      this.checkBudget('daily', this.spending.daily, this.options.dailyLimit);
    }

    // Check weekly budget
    if (this.options.weeklyLimit) {
      this.checkBudget('weekly', this.spending.weekly, this.options.weeklyLimit);
    }

    // Check monthly budget
    if (this.options.monthlyLimit) {
      this.checkBudget('monthly', this.spending.monthly, this.options.monthlyLimit);
    }
  }

  /**
   * Check a specific budget period
   */
  checkBudget(period, spending, limit) {
    const percentage = spending / limit;

    // Check if budget exceeded
    if (percentage >= 1.0) {
      this.emit('budget:exceeded', {
        period,
        spending,
        limit,
        percentage: percentage * 100
      });
      return;
    }

    // Check alert thresholds
    for (const threshold of this.options.alertThresholds) {
      if (percentage >= threshold && !this.alertsSent[period].has(threshold)) {
        this.alertsSent[period].add(threshold);

        this.emit('budget:alert', {
          period,
          threshold: threshold * 100,
          spending,
          limit,
          percentage: percentage * 100,
          remaining: limit - spending
        });
      }
    }
  }

  /**
   * Check if request would exceed budget
   */
  wouldExceedBudget(estimatedCost) {
    const checks = [];

    if (this.options.dailyLimit) {
      const wouldExceed = (this.spending.daily + estimatedCost) > this.options.dailyLimit;
      checks.push({
        period: 'daily',
        wouldExceed,
        current: this.spending.daily,
        estimated: estimatedCost,
        limit: this.options.dailyLimit,
        remaining: this.options.dailyLimit - this.spending.daily
      });
    }

    if (this.options.weeklyLimit) {
      const wouldExceed = (this.spending.weekly + estimatedCost) > this.options.weeklyLimit;
      checks.push({
        period: 'weekly',
        wouldExceed,
        current: this.spending.weekly,
        estimated: estimatedCost,
        limit: this.options.weeklyLimit,
        remaining: this.options.weeklyLimit - this.spending.weekly
      });
    }

    if (this.options.monthlyLimit) {
      const wouldExceed = (this.spending.monthly + estimatedCost) > this.options.monthlyLimit;
      checks.push({
        period: 'monthly',
        wouldExceed,
        current: this.spending.monthly,
        estimated: estimatedCost,
        limit: this.options.monthlyLimit,
        remaining: this.options.monthlyLimit - this.spending.monthly
      });
    }

    return {
      wouldExceed: checks.some(c => c.wouldExceed),
      checks
    };
  }

  /**
   * Get spending summary
   */
  getSummary() {
    return {
      daily: {
        spending: this.spending.daily,
        limit: this.options.dailyLimit,
        percentage: this.options.dailyLimit ? (this.spending.daily / this.options.dailyLimit) * 100 : null
      },
      weekly: {
        spending: this.spending.weekly,
        limit: this.options.weeklyLimit,
        percentage: this.options.weeklyLimit ? (this.spending.weekly / this.options.weeklyLimit) * 100 : null
      },
      monthly: {
        spending: this.spending.monthly,
        limit: this.options.monthlyLimit,
        percentage: this.options.monthlyLimit ? (this.spending.monthly / this.options.monthlyLimit) * 100 : null
      },
      byProvider: { ...this.spending.byProvider },
      byModel: { ...this.spending.byModel }
    };
  }

  /**
   * Reset period spending
   */
  resetPeriod(period) {
    if (period === 'daily' || period === 'all') {
      this.spending.daily = 0;
      this.alertsSent.daily.clear();
      this.lastReset.daily = new Date();
    }

    if (period === 'weekly' || period === 'all') {
      this.spending.weekly = 0;
      this.alertsSent.weekly.clear();
      this.lastReset.weekly = this.getWeekStart();
    }

    if (period === 'monthly' || period === 'all') {
      this.spending.monthly = 0;
      this.alertsSent.monthly.clear();
      this.lastReset.monthly = this.getMonthStart();
    }

    if (period === 'all') {
      this.spending.byProvider = {};
      this.spending.byModel = {};
    }

    this.emit('budget:reset', { period });
  }

  /**
   * Get start of current week
   */
  getWeekStart() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek;
    return new Date(now.setDate(diff));
  }

  /**
   * Get start of current month
   */
  getMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /**
   * Auto-reset periods if needed
   */
  autoReset() {
    const now = new Date();

    // Check daily reset
    if (now.getDate() !== this.lastReset.daily.getDate()) {
      this.resetPeriod('daily');
    }

    // Check weekly reset
    const weekStart = this.getWeekStart();
    if (weekStart > this.lastReset.weekly) {
      this.resetPeriod('weekly');
    }

    // Check monthly reset
    const monthStart = this.getMonthStart();
    if (monthStart > this.lastReset.monthly) {
      this.resetPeriod('monthly');
    }
  }
}

/**
 * Main Token & Cost Manager
 */
class TokenCostManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enableTokenCounting: options.enableTokenCounting !== false,
      enableCostTracking: options.enableCostTracking !== false,
      enableBudgetManagement: options.enableBudgetManagement !== false,
      autoReset: options.autoReset !== false,
      resetInterval: options.resetInterval || 3600000, // 1 hour
      ...options
    };

    this.tokenCounter = new TokenCounter();
    this.costCalculator = new CostCalculator();
    this.budgetManager = new BudgetManager(options.budget || {});

    // Forward budget events
    this.budgetManager.on('spending:recorded', (data) => this.emit('spending:recorded', data));
    this.budgetManager.on('budget:alert', (data) => this.emit('budget:alert', data));
    this.budgetManager.on('budget:exceeded', (data) => this.emit('budget:exceeded', data));
    this.budgetManager.on('budget:reset', (data) => this.emit('budget:reset', data));

    // Set up auto-reset timer
    if (this.options.autoReset) {
      this.resetTimer = setInterval(() => {
        this.budgetManager.autoReset();
      }, this.options.resetInterval);
    }
  }

  /**
   * Estimate tokens and cost before request
   */
  estimateRequest(provider, model, messages, options = {}) {
    if (!this.options.enableTokenCounting) {
      return { tokens: 0, cost: 0 };
    }

    // Count input tokens
    const inputTokens = this.tokenCounter.countMessages(messages, model);

    // Estimate output tokens (default to input * 0.5 if not specified)
    const outputTokens = options.maxTokens || Math.ceil(inputTokens * 0.5);

    // Estimate tool tokens if present
    const toolTokens = options.tools ? this.tokenCounter.estimateToolTokens(options.tools) : 0;

    const totalInputTokens = inputTokens + toolTokens;

    // Calculate cost
    const cost = this.options.enableCostTracking
      ? this.costCalculator.estimateCost(provider, model, totalInputTokens, outputTokens)
      : 0;

    return {
      inputTokens: totalInputTokens,
      outputTokens,
      totalTokens: totalInputTokens + outputTokens,
      cost
    };
  }

  /**
   * Record actual usage after request
   */
  recordUsage(provider, model, usage) {
    if (!this.options.enableCostTracking) return;

    const inputTokens = usage.inputTokens || usage.prompt_tokens || 0;
    const outputTokens = usage.outputTokens || usage.completion_tokens || 0;

    // Calculate actual cost
    const cost = this.costCalculator.calculateCost(provider, model, inputTokens, outputTokens);

    // Record spending
    if (this.options.enableBudgetManagement) {
      this.budgetManager.recordSpending(provider, model, cost);
    }

    this.emit('usage:recorded', {
      provider,
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cost
    });

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cost
    };
  }

  /**
   * Check if request is within budget
   */
  checkBudget(provider, model, messages, options = {}) {
    if (!this.options.enableBudgetManagement) {
      return { allowed: true, reason: 'Budget management disabled' };
    }

    // Estimate cost
    const estimate = this.estimateRequest(provider, model, messages, options);

    // Check if would exceed budget
    const budgetCheck = this.budgetManager.wouldExceedBudget(estimate.cost);

    if (budgetCheck.wouldExceed) {
      return {
        allowed: false,
        reason: 'Budget exceeded',
        estimate,
        budgetCheck
      };
    }

    return {
      allowed: true,
      estimate,
      budgetCheck
    };
  }

  /**
   * Get cost comparison across providers
   */
  compareCosts(messages, estimatedOutputTokens = 0) {
    const inputTokens = this.tokenCounter.countMessages(messages);
    return this.costCalculator.compareCosts(inputTokens, estimatedOutputTokens);
  }

  /**
   * Get budget summary
   */
  getBudgetSummary() {
    if (!this.options.enableBudgetManagement) {
      return { enabled: false };
    }

    return {
      enabled: true,
      ...this.budgetManager.getSummary()
    };
  }

  /**
   * Reset budget period
   */
  resetBudget(period = 'all') {
    if (this.options.enableBudgetManagement) {
      this.budgetManager.resetPeriod(period);
    }
  }

  /**
   * Get pricing information
   */
  getPricing(provider, model) {
    return this.costCalculator.getPricing(provider, model);
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.resetTimer) {
      clearInterval(this.resetTimer);
    }
  }
}

module.exports = {
  TokenCostManager,
  TokenCounter,
  CostCalculator,
  BudgetManager
};
