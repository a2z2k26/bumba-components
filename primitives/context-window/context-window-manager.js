/**
 * Sprint 3-9: Context Window Manager
 * Intelligent context window management with truncation strategies and token tracking
 */

const EventEmitter = require('events');

class ContextWindowManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // Model-specific context window limits
    this.modelLimits = {
      'gpt-4-0125-preview': { contextWindow: 128000, outputTokens: 4096 },
      'gpt-4': { contextWindow: 8192, outputTokens: 4096 },
      'gpt-3.5-turbo': { contextWindow: 16385, outputTokens: 4096 },
      'claude-sonnet-4-5-20250929': { contextWindow: 200000, outputTokens: 8192 },
      'claude-3-opus-20240229': { contextWindow: 200000, outputTokens: 4096 },
      'claude-3-haiku-20240307': { contextWindow: 200000, outputTokens: 4096 },
      'default': { contextWindow: 4096, outputTokens: 2048 }
    };

    // Configuration
    this.config = {
      safetyMargin: options.safetyMargin || 0.1, // Reserve 10% for safety
      truncationStrategy: options.truncationStrategy || 'oldest', // oldest, summarize, smart
      prioritizeRecent: options.prioritizeRecent !== false,
      minMessagesToKeep: options.minMessagesToKeep || 2,
      warningThreshold: options.warningThreshold || 0.8 // Warn at 80%
    };

    // Statistics
    this.stats = {
      totalTruncations: 0,
      messagesTruncated: 0,
      tokensReclaimed: 0,
      warnings: 0,
      byModel: new Map()
    };
  }

  /**
   * Get context window limit for a model
   */
  getModelLimit(model) {
    // Try exact match
    if (this.modelLimits[model]) {
      return this.modelLimits[model];
    }

    // Try partial match (e.g., "gpt-4" matches "gpt-4-0125-preview")
    for (const [key, limit] of Object.entries(this.modelLimits)) {
      if (model.includes(key) || key.includes(model)) {
        return limit;
      }
    }

    // Return default
    return this.modelLimits.default;
  }

  /**
   * Set custom model limit
   */
  setModelLimit(model, contextWindow, outputTokens) {
    this.modelLimits[model] = { contextWindow, outputTokens };
    this.emit('model-limit-set', { model, contextWindow, outputTokens });
  }

  /**
   * Estimate tokens for a message
   */
  estimateTokens(message) {
    if (typeof message === 'string') {
      // Rough estimation: ~4 characters per token
      return Math.ceil(message.length / 4);
    }

    if (message.role && message.content) {
      // Add overhead for role and structure
      const roleOverhead = 10;
      const contentTokens = this.estimateTokens(message.content);
      return roleOverhead + contentTokens;
    }

    return 0;
  }

  /**
   * Calculate total tokens for messages
   */
  calculateTokens(messages) {
    return messages.reduce((total, msg) => total + this.estimateTokens(msg), 0);
  }

  /**
   * Check if messages fit within context window
   */
  checkFit(messages, model, options = {}) {
    const { outputTokens = 0 } = options;

    const limit = this.getModelLimit(model);
    const messageTokens = this.calculateTokens(messages);
    const totalRequired = messageTokens + outputTokens;

    // Apply safety margin
    const safeLimit = Math.floor(limit.contextWindow * (1 - this.config.safetyMargin));

    const fits = totalRequired <= safeLimit;
    const utilization = (totalRequired / limit.contextWindow * 100).toFixed(2);

    // Emit warning if approaching limit
    const utilizationNum = parseFloat(utilization);
    if (utilizationNum >= this.config.warningThreshold * 100) {
      this.stats.warnings++;
      this.emit('context-warning', {
        model,
        utilization: utilization + '%',
        messageTokens,
        outputTokens,
        limit: limit.contextWindow,
        safeLimit
      });
    }

    return {
      fits,
      messageTokens,
      outputTokens,
      totalRequired,
      limit: limit.contextWindow,
      safeLimit,
      available: safeLimit - totalRequired,
      utilization: utilization + '%'
    };
  }

  /**
   * Truncate messages to fit within context window
   */
  truncate(messages, model, options = {}) {
    const {
      outputTokens = 0,
      strategy = this.config.truncationStrategy,
      systemMessage = null
    } = options;

    const limit = this.getModelLimit(model);
    const safeLimit = Math.floor(limit.contextWindow * (1 - this.config.safetyMargin));
    const targetTokens = safeLimit - outputTokens;

    // Always keep system message
    let workingMessages = [...messages];
    let systemMsg = systemMessage;

    if (!systemMsg && workingMessages[0]?.role === 'system') {
      systemMsg = workingMessages.shift();
    }

    const systemTokens = systemMsg ? this.estimateTokens(systemMsg) : 0;
    const availableForMessages = targetTokens - systemTokens;

    // Check if truncation needed
    const currentTokens = this.calculateTokens(workingMessages);

    if (currentTokens <= availableForMessages) {
      // No truncation needed
      const result = systemMsg ? [systemMsg, ...workingMessages] : workingMessages;
      return {
        messages: result,
        truncated: false,
        messagesRemoved: 0,
        tokensReclaimed: 0,
        strategy: 'none'
      };
    }

    // Truncate based on strategy
    let truncated;
    let messagesRemoved = 0;

    switch (strategy) {
      case 'oldest':
        truncated = this.truncateOldest(workingMessages, availableForMessages);
        break;

      case 'smart':
        truncated = this.truncateSmart(workingMessages, availableForMessages);
        break;

      case 'summarize':
        truncated = this.truncateWithSummary(workingMessages, availableForMessages);
        break;

      default:
        truncated = this.truncateOldest(workingMessages, availableForMessages);
    }

    const tokensReclaimed = currentTokens - this.calculateTokens(truncated.messages);
    messagesRemoved = workingMessages.length - truncated.messages.length;

    // Track statistics
    this.stats.totalTruncations++;
    this.stats.messagesTruncated += messagesRemoved;
    this.stats.tokensReclaimed += tokensReclaimed;
    this.trackModelTruncation(model);

    const result = systemMsg ? [systemMsg, ...truncated.messages] : truncated.messages;

    this.emit('truncated', {
      model,
      strategy,
      messagesRemoved,
      tokensReclaimed,
      messagesKept: result.length,
      finalTokens: this.calculateTokens(result)
    });

    return {
      messages: result,
      truncated: true,
      messagesRemoved,
      tokensReclaimed,
      strategy,
      messagesKept: result.length
    };
  }

  /**
   * Truncate oldest messages first
   */
  truncateOldest(messages, targetTokens) {
    const result = [];
    let currentTokens = 0;

    // Start from the end (most recent)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = this.estimateTokens(msg);

      if (currentTokens + msgTokens <= targetTokens) {
        result.unshift(msg);
        currentTokens += msgTokens;
      } else {
        // Skip older messages
        break;
      }
    }

    // Ensure minimum messages kept
    if (result.length < this.config.minMessagesToKeep && messages.length >= this.config.minMessagesToKeep) {
      return {
        messages: messages.slice(-this.config.minMessagesToKeep)
      };
    }

    return { messages: result };
  }

  /**
   * Smart truncation - keep system, first user, and recent messages
   */
  truncateSmart(messages, targetTokens) {
    if (messages.length === 0) {
      return { messages: [] };
    }

    let preserved = [];
    let remaining = [...messages];
    let currentTokens = 0;

    // Preserve first user message (context) if reasonable size
    const firstUserIdx = remaining.findIndex(m => m.role === 'user');
    let firstUserPreserved = false;

    if (firstUserIdx >= 0) {
      const firstUser = remaining[firstUserIdx];
      const tokens = this.estimateTokens(firstUser);

      if (tokens < targetTokens * 0.4) { // Allow up to 40% for first message
        preserved.push({ ...firstUser, _isFirst: true });
        currentTokens += tokens;
        remaining.splice(firstUserIdx, 1);
        firstUserPreserved = true;
      }
    }

    // Fill with most recent messages
    for (let i = remaining.length - 1; i >= 0; i--) {
      const msg = remaining[i];
      const msgTokens = this.estimateTokens(msg);

      if (currentTokens + msgTokens <= targetTokens) {
        preserved.push(msg);
        currentTokens += msgTokens;
      } else {
        break;
      }
    }

    // Sort by original order, keeping first user at the beginning if preserved
    preserved.sort((a, b) => {
      if (a._isFirst) return -1;
      if (b._isFirst) return 1;
      const aIdx = messages.indexOf(a);
      const bIdx = messages.indexOf(b);
      return aIdx - bIdx;
    });

    // Remove the _isFirst marker
    preserved = preserved.map(({ _isFirst, ...msg }) => msg);

    return { messages: preserved };
  }

  /**
   * Truncate with summary placeholder
   */
  truncateWithSummary(messages, targetTokens) {
    // Keep recent messages
    const recentTokens = Math.floor(targetTokens * 0.7); // 70% for recent
    const summaryTokens = Math.floor(targetTokens * 0.3); // 30% for summary

    const recent = this.truncateOldest(messages, recentTokens);

    // Create summary of removed messages
    const removed = messages.slice(0, messages.length - recent.messages.length);

    if (removed.length > 0) {
      const summary = {
        role: 'system',
        content: `[Previous conversation summary: ${removed.length} messages omitted to fit context window. First message: "${this.truncateText(removed[0].content, 50)}"]`
      };

      return {
        messages: [summary, ...recent.messages]
      };
    }

    return recent;
  }

  /**
   * Get optimal output token allocation
   */
  getOptimalOutputTokens(messages, model, desiredOutput = null) {
    const limit = this.getModelLimit(model);
    const messageTokens = this.calculateTokens(messages);
    const safeLimit = Math.floor(limit.contextWindow * (1 - this.config.safetyMargin));

    const available = safeLimit - messageTokens;
    const maxOutput = Math.min(limit.outputTokens, available);

    if (desiredOutput && desiredOutput <= maxOutput) {
      return {
        recommended: desiredOutput,
        maximum: maxOutput,
        available
      };
    }

    // Recommend 80% of available or max output, whichever is smaller
    const recommended = Math.min(
      Math.floor(available * 0.8),
      limit.outputTokens
    );

    return {
      recommended,
      maximum: maxOutput,
      available
    };
  }

  /**
   * Optimize message history for context window
   */
  optimize(messages, model, options = {}) {
    const {
      outputTokens = 2048,
      keepSystemMessage = true,
      strategy = this.config.truncationStrategy
    } = options;

    // Check if optimization needed
    const check = this.checkFit(messages, model, { outputTokens });

    if (check.fits) {
      return {
        messages,
        optimized: false,
        reason: 'fits',
        ...check
      };
    }

    // Extract system message if requested
    let systemMsg = null;
    let workingMessages = [...messages];

    if (keepSystemMessage && workingMessages[0]?.role === 'system') {
      systemMsg = workingMessages.shift();
    }

    // Truncate
    const result = this.truncate(workingMessages, model, {
      outputTokens,
      strategy,
      systemMessage: systemMsg
    });

    return {
      messages: result.messages,
      optimized: true,
      reason: 'truncated',
      ...result
    };
  }

  /**
   * Track model truncation
   */
  trackModelTruncation(model) {
    const count = this.stats.byModel.get(model) || 0;
    this.stats.byModel.set(model, count + 1);
  }

  /**
   * Get statistics
   */
  getStats() {
    const byModel = Array.from(this.stats.byModel.entries())
      .map(([model, count]) => ({ model, truncations: count }))
      .sort((a, b) => b.truncations - a.truncations);

    return {
      totalTruncations: this.stats.totalTruncations,
      messagesTruncated: this.stats.messagesTruncated,
      tokensReclaimed: this.stats.tokensReclaimed,
      warnings: this.stats.warnings,
      byModel
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalTruncations: 0,
      messagesTruncated: 0,
      tokensReclaimed: 0,
      warnings: 0,
      byModel: new Map()
    };

    this.emit('stats-reset');
  }

  /**
   * Helper to truncate text
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }
}

module.exports = ContextWindowManager;
