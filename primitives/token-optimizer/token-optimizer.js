/**
 * Sprint 3-2: Token Optimization System
 * Intelligent token usage optimization and management
 */

const EventEmitter = require('events');
const chalk = require('chalk');

class TokenOptimizer extends EventEmitter {
  constructor(options = {}) {
    super();

    // Token limits per model (approximate)
    this.modelLimits = {
      'gpt-4-0125-preview': 128000,
      'gpt-4-turbo-preview': 128000,
      'gpt-3.5-turbo': 16385,
      'claude-sonnet-4-5-20250929': 200000,
      'claude-3-opus-20240229': 200000,
      'claude-3-haiku-20240307': 200000,
      'gemini-pro': 30720
    };

    // Optimization strategies
    this.strategies = {
      compression: options.enableCompression !== false,
      summarization: options.enableSummarization !== false,
      truncation: options.enableTruncation !== false,
      caching: options.enableCaching !== false
    };

    // Token counting (approximate - words * 1.3 for English)
    this.tokenMultiplier = options.tokenMultiplier || 1.3;

    // Safety margins
    this.safetyMargin = options.safetyMargin || 0.9; // Use 90% of limit

    // Optimization statistics
    this.stats = {
      optimizations: 0,
      tokensSaved: 0,
      compressions: 0,
      summarizations: 0,
      truncations: 0
    };
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text) {
    if (!text) return 0;

    // Simple estimation: word count * multiplier
    const words = text.split(/\s+/).filter(w => w.length > 0).length;
    return Math.ceil(words * this.tokenMultiplier);
  }

  /**
   * Get effective token limit for model
   */
  getEffectiveLimit(model) {
    const baseLimit = this.modelLimits[model] || 4096; // Default 4k
    return Math.floor(baseLimit * this.safetyMargin);
  }

  /**
   * Optimize messages for token limit
   */
  optimizeMessages(messages, model, options = {}) {
    const targetLimit = options.targetLimit || this.getEffectiveLimit(model);
    const currentTokens = this.estimateConversationTokens(messages);

    if (currentTokens <= targetLimit) {
      // No optimization needed
      return {
        messages,
        optimized: false,
        originalTokens: currentTokens,
        finalTokens: currentTokens,
        tokensSaved: 0,
        strategies: []
      };
    }

    this.stats.optimizations++;

    // Try optimization strategies in order
    let optimizedMessages = [...messages];
    const appliedStrategies = [];
    let tokens = currentTokens;

    // Strategy 1: Remove old messages (keep system + recent)
    if (this.strategies.truncation && tokens > targetLimit) {
      const result = this.truncateOldMessages(optimizedMessages, targetLimit);
      optimizedMessages = result.messages;
      tokens = result.tokens;

      if (result.removed > 0) {
        appliedStrategies.push(`truncation (removed ${result.removed} messages)`);
        this.stats.truncations++;
      }
    }

    // Strategy 2: Compress verbose messages
    if (this.strategies.compression && tokens > targetLimit) {
      const result = this.compressMessages(optimizedMessages, targetLimit);
      optimizedMessages = result.messages;
      tokens = result.tokens;

      if (result.compressed > 0) {
        appliedStrategies.push(`compression (${result.compressed} messages)`);
        this.stats.compressions++;
      }
    }

    // Strategy 3: Summarize long assistant responses
    if (this.strategies.summarization && tokens > targetLimit) {
      const result = this.summarizeResponses(optimizedMessages, targetLimit);
      optimizedMessages = result.messages;
      tokens = result.tokens;

      if (result.summarized > 0) {
        appliedStrategies.push(`summarization (${result.summarized} messages)`);
        this.stats.summarizations++;
      }
    }

    const tokensSaved = currentTokens - tokens;
    this.stats.tokensSaved += tokensSaved;

    this.emit('optimized', {
      originalTokens: currentTokens,
      finalTokens: tokens,
      tokensSaved,
      strategies: appliedStrategies
    });

    return {
      messages: optimizedMessages,
      optimized: true,
      originalTokens: currentTokens,
      finalTokens: tokens,
      tokensSaved,
      strategies: appliedStrategies
    };
  }

  /**
   * Estimate total tokens in conversation
   */
  estimateConversationTokens(messages) {
    let total = 0;

    for (const message of messages) {
      // Role and structure overhead (~4 tokens)
      total += 4;

      // Content tokens
      if (typeof message.content === 'string') {
        total += this.estimateTokens(message.content);
      } else if (Array.isArray(message.content)) {
        // Handle multimodal content
        for (const part of message.content) {
          if (part.type === 'text') {
            total += this.estimateTokens(part.text);
          } else if (part.type === 'image_url') {
            // Images ~85-170 tokens depending on detail
            total += 170;
          }
        }
      }
    }

    return total;
  }

  /**
   * Truncate old messages while preserving system and recent context
   */
  truncateOldMessages(messages, targetLimit) {
    if (messages.length <= 2) {
      return { messages, tokens: this.estimateConversationTokens(messages), removed: 0 };
    }

    // Keep system message and recent messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Always keep last 3 messages (recent context)
    const keepRecent = 3;
    const recentMessages = nonSystemMessages.slice(-keepRecent);

    // Try to keep as many older messages as possible
    let optimized = [...systemMessages, ...recentMessages];
    let tokens = this.estimateConversationTokens(optimized);

    // Add older messages if they fit
    const olderMessages = nonSystemMessages.slice(0, -keepRecent);
    for (let i = olderMessages.length - 1; i >= 0; i--) {
      const candidate = [...systemMessages, ...olderMessages.slice(i), ...recentMessages];
      const candidateTokens = this.estimateConversationTokens(candidate);

      if (candidateTokens <= targetLimit) {
        optimized = candidate;
        tokens = candidateTokens;
        break;
      }
    }

    const removed = messages.length - optimized.length;

    return { messages: optimized, tokens, removed };
  }

  /**
   * Compress verbose messages by removing redundancy
   */
  compressMessages(messages, targetLimit) {
    const compressed = messages.map(msg => {
      if (msg.role === 'system') {
        return msg; // Don't compress system messages
      }

      const content = typeof msg.content === 'string' ? msg.content : '';
      const tokens = this.estimateTokens(content);

      // Only compress if message is reasonably long
      if (tokens < 50) {
        return msg;
      }

      // Simple compression: remove extra whitespace, redundant phrases
      let optimized = content
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/(\w+)\s+\1/g, '$1') // Remove word repetitions
        .replace(/\.{2,}/g, '.') // Normalize ellipsis
        .trim();

      return {
        ...msg,
        content: optimized
      };
    });

    const tokens = this.estimateConversationTokens(compressed);
    const compressedCount = compressed.filter((msg, i) =>
      msg.content !== messages[i].content
    ).length;

    return { messages: compressed, tokens, compressed: compressedCount };
  }

  /**
   * Summarize long assistant responses
   */
  summarizeResponses(messages, targetLimit) {
    const summarized = messages.map(msg => {
      if (msg.role !== 'assistant') {
        return msg; // Only summarize assistant messages
      }

      const content = typeof msg.content === 'string' ? msg.content : '';
      const tokens = this.estimateTokens(content);

      // Only summarize reasonably long responses
      if (tokens < 60) {
        return msg;
      }

      // Extract key points
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);

      // Keep first sentence (intro) and last sentence (conclusion)
      // Plus key sentences with important words
      const important = ['important', 'key', 'critical', 'note', 'however', 'but', 'therefore'];
      const keySentences = sentences.filter(s =>
        important.some(word => s.toLowerCase().includes(word))
      );

      const summary = [
        sentences[0],
        ...keySentences.slice(0, 2),
        sentences[sentences.length - 1]
      ].filter(s => s).join('. ') + '.';

      return {
        ...msg,
        content: summary,
        _summarized: true
      };
    });

    const tokens = this.estimateConversationTokens(summarized);
    const summarizedCount = summarized.filter(msg => msg._summarized).length;

    return { messages: summarized, tokens, summarized: summarizedCount };
  }

  /**
   * Get optimization recommendations
   */
  getRecommendations(messages, model) {
    const currentTokens = this.estimateConversationTokens(messages);
    const limit = this.getEffectiveLimit(model);
    const utilization = (currentTokens / limit) * 100;

    const recommendations = [];

    if (utilization > 90) {
      recommendations.push({
        severity: 'critical',
        message: `Token usage at ${utilization.toFixed(1)}% of limit`,
        action: 'Optimization required immediately',
        estimatedSavings: Math.floor(currentTokens * 0.3)
      });
    } else if (utilization > 75) {
      recommendations.push({
        severity: 'warning',
        message: `Token usage at ${utilization.toFixed(1)}% of limit`,
        action: 'Consider optimization soon',
        estimatedSavings: Math.floor(currentTokens * 0.2)
      });
    } else if (utilization > 50) {
      recommendations.push({
        severity: 'info',
        message: `Token usage at ${utilization.toFixed(1)}% of limit`,
        action: 'Optimization optional',
        estimatedSavings: Math.floor(currentTokens * 0.1)
      });
    }

    // Check message count
    if (messages.length > 50) {
      recommendations.push({
        severity: 'warning',
        message: `Conversation has ${messages.length} messages`,
        action: 'Consider truncating old messages',
        estimatedSavings: Math.floor(currentTokens * 0.2)
      });
    }

    // Check for very long individual messages
    const longMessages = messages.filter(m =>
      this.estimateTokens(m.content) > 500
    );

    if (longMessages.length > 0) {
      recommendations.push({
        severity: 'info',
        message: `${longMessages.length} very long messages detected`,
        action: 'Consider summarization',
        estimatedSavings: longMessages.length * 200
      });
    }

    return {
      utilization: utilization.toFixed(1),
      currentTokens,
      limit,
      remaining: limit - currentTokens,
      recommendations
    };
  }

  /**
   * Calculate cost based on tokens
   */
  estimateCost(tokens, model) {
    // Cost per 1M tokens (approximate)
    const pricing = {
      'gpt-4-0125-preview': { input: 10, output: 30 },
      'gpt-4-turbo-preview': { input: 10, output: 30 },
      'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
      'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
      'claude-3-opus-20240229': { input: 15, output: 75 },
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 }
    };

    const modelPricing = pricing[model] || { input: 1, output: 2 };

    // Assume 50/50 split for estimation
    const inputTokens = Math.floor(tokens * 0.5);
    const outputTokens = Math.floor(tokens * 0.5);

    const inputCost = (inputTokens / 1000000) * modelPricing.input;
    const outputCost = (outputTokens / 1000000) * modelPricing.output;

    return inputCost + outputCost;
  }

  /**
   * Analyze token efficiency
   */
  analyzeEfficiency(messages) {
    const analysis = {
      totalMessages: messages.length,
      totalTokens: this.estimateConversationTokens(messages),
      byRole: {},
      longestMessage: null,
      averageLength: 0
    };

    // Analyze by role
    const roles = ['system', 'user', 'assistant'];
    for (const role of roles) {
      const roleMessages = messages.filter(m => m.role === role);
      const roleTokens = this.estimateConversationTokens(roleMessages);

      analysis.byRole[role] = {
        count: roleMessages.length,
        tokens: roleTokens,
        percentage: (roleTokens / analysis.totalTokens * 100).toFixed(1)
      };
    }

    // Find longest message
    let maxTokens = 0;
    for (const msg of messages) {
      const tokens = this.estimateTokens(msg.content);
      if (tokens > maxTokens) {
        maxTokens = tokens;
        analysis.longestMessage = {
          role: msg.role,
          tokens,
          preview: msg.content.substring(0, 100) + '...'
        };
      }
    }

    // Average length
    analysis.averageLength = Math.floor(analysis.totalTokens / messages.length);

    return analysis;
  }

  /**
   * Get optimization statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageSavings: this.stats.optimizations > 0
        ? Math.floor(this.stats.tokensSaved / this.stats.optimizations)
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      optimizations: 0,
      tokensSaved: 0,
      compressions: 0,
      summarizations: 0,
      truncations: 0
    };
  }

  /**
   * Set optimization strategies
   */
  setStrategies(strategies) {
    this.strategies = {
      ...this.strategies,
      ...strategies
    };
  }

  /**
   * Export configuration
   */
  exportConfig() {
    return {
      modelLimits: this.modelLimits,
      strategies: this.strategies,
      safetyMargin: this.safetyMargin,
      tokenMultiplier: this.tokenMultiplier,
      stats: this.getStats()
    };
  }
}

module.exports = TokenOptimizer;
