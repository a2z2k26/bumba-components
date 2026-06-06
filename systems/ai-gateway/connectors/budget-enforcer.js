/**
 * Budget Enforcer
 * Sprint 2.18: Enforces spending limits for paid AI models
 *
 * Tracks spending across model tiers and enforces daily/monthly limits
 * Alerts users when approaching budget thresholds
 */

const fs = require('fs').promises;
const path = require('path');
const { ModelTier } = require('./domain-to-model-assignments');

/**
 * Budget period types
 */
const BudgetPeriod = {
  DAILY: 'daily',
  MONTHLY: 'monthly'
};

/**
 * Budget status
 */
const BudgetStatus = {
  OK: 'ok',
  WARNING: 'warning', // 80-90%
  CRITICAL: 'critical', // 90-100%
  EXCEEDED: 'exceeded' // 100%+
};

/**
 * BudgetEnforcer - Manages spending limits across model tiers
 */
class BudgetEnforcer {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      currency: config.currency || 'USD',
      limits: config.limits || this.getDefaultLimits(),
      alertThresholds: config.alertThresholds || [80, 90, 100],
      resetSchedule: config.resetSchedule || {
        daily: '00:00 PT',
        monthly: '1st of month 00:00 PT'
      },
      storageDir: config.storageDir || path.join(process.cwd(), '.bumba', 'budget'),
      ...config
    };

    // Current spending by tier
    this.spent = {
      [ModelTier.OPENROUTER]: { daily: 0, monthly: 0 },
      [ModelTier.PAID_ECONOMY]: { daily: 0, monthly: 0 },
      [ModelTier.PAID_PREMIUM]: { daily: 0, monthly: 0 }
    };

    // Track when budgets were last reset
    this.lastReset = {
      daily: null,
      monthly: null
    };

    // Alerts that have been fired (to avoid spam)
    this.alertsFired = new Set();

    this.initialized = false;
  }

  /**
   * Get default budget limits
   */
  getDefaultLimits() {
    return {
      [ModelTier.OPENROUTER]: {
        daily: 10.00,
        monthly: 100.00
      },
      [ModelTier.PAID_ECONOMY]: {
        daily: 20.00,
        monthly: 200.00
      },
      [ModelTier.PAID_PREMIUM]: {
        daily: 50.00,
        monthly: 500.00
      }
    };
  }

  /**
   * Initialize budget enforcer - load persisted data
   */
  async initialize() {
    if (!this.config.enabled) {
      logger.info('Budget enforcement disabled');
      return;
    }

    logger.info(' Initializing budget enforcer...');

    try {
      // Ensure storage directory exists
      await fs.mkdir(this.config.storageDir, { recursive: true });

      // Load persisted budget data
      await this.loadBudgetData();

      // Check if budgets need reset
      await this.checkResetSchedule();

      this.initialized = true;
      logger.info(' Budget enforcer initialized');
    } catch (error) {
      logger.error('Failed to initialize budget enforcer:', error.message);
      throw error;
    }
  }

  /**
   * Check if a model request can be afforded
   */
  async canAfford(modelName, tier, estimatedCost) {
    if (!this.config.enabled) {
      return true;
    }

    if (!this.initialized) {
      await this.initialize();
    }

    // Free tier has no budget limits
    if (tier === ModelTier.FREE || tier === ModelTier.LOCAL) {
      return true;
    }

    // Check daily budget
    const dailySpent = this.spent[tier]?.daily || 0;
    const dailyLimit = this.config.limits[tier]?.daily || Infinity;

    if (dailySpent + estimatedCost > dailyLimit) {
      logger.warn(` Daily budget exceeded for ${tier}: $${dailySpent.toFixed(2)} + $${estimatedCost.toFixed(2)} > $${dailyLimit.toFixed(2)}`);
      return false;
    }

    // Check monthly budget
    const monthlySpent = this.spent[tier]?.monthly || 0;
    const monthlyLimit = this.config.limits[tier]?.monthly || Infinity;

    if (monthlySpent + estimatedCost > monthlyLimit) {
      logger.warn(` Monthly budget exceeded for ${tier}: $${monthlySpent.toFixed(2)} + $${estimatedCost.toFixed(2)} > $${monthlyLimit.toFixed(2)}`);
      return false;
    }

    return true;
  }

  /**
   * Record actual spending after model call
   */
  async recordSpend(modelName, tier, actualCost) {
    if (!this.config.enabled || tier === ModelTier.FREE || tier === ModelTier.LOCAL) {
      return;
    }

    if (!this.initialized) {
      await this.initialize();
    }

    // Update spending
    if (!this.spent[tier]) {
      this.spent[tier] = { daily: 0, monthly: 0 };
    }

    this.spent[tier].daily += actualCost;
    this.spent[tier].monthly += actualCost;

    logger.debug(` Recorded spend for ${tier}: $${actualCost.toFixed(4)}`);

    // Check alert thresholds
    await this.checkAlertThresholds(tier, BudgetPeriod.DAILY);
    await this.checkAlertThresholds(tier, BudgetPeriod.MONTHLY);

    // Persist updated spending
    await this.saveBudgetData();
  }

  /**
   * Check if spending has crossed alert thresholds
   */
  async checkAlertThresholds(tier, period) {
    const spent = this.spent[tier]?.[period] || 0;
    const limit = this.config.limits[tier]?.[period] || Infinity;
    const percentUsed = (spent / limit) * 100;

    for (const threshold of this.config.alertThresholds) {
      const alertKey = `${tier}-${period}-${threshold}`;

      if (percentUsed >= threshold && !this.alertsFired.has(alertKey)) {
        // Fire alert
        const status = this.getBudgetStatus(percentUsed);
        const emoji = status === BudgetStatus.CRITICAL ? '' :
                      status === BudgetStatus.WARNING ? '' : '';

        logger.warn(`${emoji} Budget Alert: ${tier} ${period} at ${percentUsed.toFixed(1)}% ($${spent.toFixed(2)}/$${limit.toFixed(2)})`);

        this.alertsFired.add(alertKey);
      }
    }
  }

  /**
   * Get budget status based on percentage used
   */
  getBudgetStatus(percentUsed) {
    if (percentUsed >= 100) return BudgetStatus.EXCEEDED;
    if (percentUsed >= 90) return BudgetStatus.CRITICAL;
    if (percentUsed >= 80) return BudgetStatus.WARNING;
    return BudgetStatus.OK;
  }

  /**
   * Check if budgets need to be reset
   */
  async checkResetSchedule() {
    const now = new Date();
    const nowPT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

    // Check daily reset (midnight PT)
    if (this.shouldResetDaily(nowPT)) {
      await this.resetDailyBudgets();
    }

    // Check monthly reset (1st of month midnight PT)
    if (this.shouldResetMonthly(nowPT)) {
      await this.resetMonthlyBudgets();
    }
  }

  /**
   * Check if daily budget should reset
   */
  shouldResetDaily(nowPT) {
    if (!this.lastReset.daily) return true;

    const lastResetDate = new Date(this.lastReset.daily);
    const daysDiff = Math.floor((nowPT - lastResetDate) / (1000 * 60 * 60 * 24));

    return daysDiff >= 1;
  }

  /**
   * Check if monthly budget should reset
   */
  shouldResetMonthly(nowPT) {
    if (!this.lastReset.monthly) return true;

    const lastResetDate = new Date(this.lastReset.monthly);
    return nowPT.getMonth() !== lastResetDate.getMonth() ||
           nowPT.getFullYear() !== lastResetDate.getFullYear();
  }

  /**
   * Reset daily budgets
   */
  async resetDailyBudgets() {
    logger.info(' Resetting daily budgets...');

    for (const tier of Object.keys(this.spent)) {
      this.spent[tier].daily = 0;
    }

    this.lastReset.daily = new Date();

    // Clear daily alert flags
    this.alertsFired = new Set([...this.alertsFired].filter(key => !key.includes('-daily-')));

    await this.saveBudgetData();
    logger.info(' Daily budgets reset');
  }

  /**
   * Reset monthly budgets
   */
  async resetMonthlyBudgets() {
    logger.info(' Resetting monthly budgets...');

    for (const tier of Object.keys(this.spent)) {
      this.spent[tier].monthly = 0;
    }

    this.lastReset.monthly = new Date();

    // Clear monthly alert flags
    this.alertsFired = new Set([...this.alertsFired].filter(key => !key.includes('-monthly-')));

    await this.saveBudgetData();
    logger.info(' Monthly budgets reset');
  }

  /**
   * Get current budget status
   */
  getBudgetSummary() {
    const summary = {};

    for (const tier of Object.keys(this.spent)) {
      const limits = this.config.limits[tier] || {};
      const spent = this.spent[tier] || { daily: 0, monthly: 0 };

      summary[tier] = {
        daily: {
          spent: spent.daily,
          limit: limits.daily || Infinity,
          remaining: (limits.daily || Infinity) - spent.daily,
          percentUsed: limits.daily ? (spent.daily / limits.daily) * 100 : 0,
          status: this.getBudgetStatus(limits.daily ? (spent.daily / limits.daily) * 100 : 0)
        },
        monthly: {
          spent: spent.monthly,
          limit: limits.monthly || Infinity,
          remaining: (limits.monthly || Infinity) - spent.monthly,
          percentUsed: limits.monthly ? (spent.monthly / limits.monthly) * 100 : 0,
          status: this.getBudgetStatus(limits.monthly ? (spent.monthly / limits.monthly) * 100 : 0)
        }
      };
    }

    return summary;
  }

  /**
   * Load budget data from disk
   */
  async loadBudgetData() {
    try {
      const dataPath = path.join(this.config.storageDir, 'budget-data.json');
      const data = await fs.readFile(dataPath, 'utf8');
      const parsed = JSON.parse(data);

      this.spent = parsed.spent || this.spent;
      this.lastReset = parsed.lastReset || this.lastReset;
      this.alertsFired = new Set(parsed.alertsFired || []);

      logger.debug('Loaded budget data from disk');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to load budget data:', error.message);
      }
      // File doesn't exist yet, use defaults
    }
  }

  /**
   * Save budget data to disk
   */
  async saveBudgetData() {
    try {
      const dataPath = path.join(this.config.storageDir, 'budget-data.json');
      const data = {
        spent: this.spent,
        lastReset: this.lastReset,
        alertsFired: [...this.alertsFired],
        updatedAt: new Date().toISOString()
      };

      await fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf8');
      logger.debug('Saved budget data to disk');
    } catch (error) {
      logger.error('Failed to save budget data:', error.message);
    }
  }

  /**
   * Manually reset all budgets (for testing)
   */
  async resetAll() {
    logger.warn('  Manually resetting all budgets');
    await this.resetDailyBudgets();
    await this.resetMonthlyBudgets();
  }
}

// Singleton instance
let instance = null;

module.exports = {
  BudgetEnforcer,
  BudgetPeriod,
  BudgetStatus,
  getInstance: (config) => {
    if (!instance) {
      instance = new BudgetEnforcer(config);
    }
    return instance;
  }
};
