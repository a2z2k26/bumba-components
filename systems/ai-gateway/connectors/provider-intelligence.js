/**
 * Provider Intelligence Engine for BUMBA
 * Sprint 2.7: Smart provider selection, consensus, and optimization
 *
 * Provides:
 * - Performance history tracking
 * - Smart provider selection based on multiple factors
 * - Consensus mechanism for multi-provider responses
 * - Quality scoring and comparison
 * - Cost optimization
 * - Latency optimization
 */

const EventEmitter = require('events');

/**
 * Provider performance tracker
 */
class ProviderPerformanceTracker {
  constructor() {
    this.history = new Map(); // provider -> metrics
    this.maxHistorySize = 100; // Keep last 100 requests per provider
  }

  /**
   * Record a request result
   */
  recordRequest(provider, data) {
    if (!this.history.has(provider)) {
      this.history.set(provider, {
        requests: [],
        stats: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          totalLatency: 0,
          totalCost: 0,
          totalTokens: 0,
          avgLatency: 0,
          avgCost: 0,
          successRate: 0
        }
      });
    }

    const providerData = this.history.get(provider);

    // Add request to history
    const request = {
      timestamp: Date.now(),
      success: data.success,
      latency: data.latency,
      cost: data.cost || 0,
      tokens: data.tokens || 0,
      model: data.model,
      error: data.error || null
    };

    providerData.requests.push(request);

    // Limit history size
    if (providerData.requests.length > this.maxHistorySize) {
      providerData.requests.shift();
    }

    // Update stats
    this.updateStats(provider);
  }

  /**
   * Update provider statistics
   */
  updateStats(provider) {
    const providerData = this.history.get(provider);
    if (!providerData) return;

    const requests = providerData.requests;
    const stats = providerData.stats;

    stats.totalRequests = requests.length;
    stats.successfulRequests = requests.filter(r => r.success).length;
    stats.failedRequests = requests.filter(r => !r.success).length;
    stats.totalLatency = requests.reduce((sum, r) => sum + r.latency, 0);
    stats.totalCost = requests.reduce((sum, r) => sum + r.cost, 0);
    stats.totalTokens = requests.reduce((sum, r) => sum + r.tokens, 0);

    stats.avgLatency = stats.totalRequests > 0
      ? stats.totalLatency / stats.totalRequests
      : 0;

    stats.avgCost = stats.totalRequests > 0
      ? stats.totalCost / stats.totalRequests
      : 0;

    stats.successRate = stats.totalRequests > 0
      ? stats.successfulRequests / stats.totalRequests
      : 0;
  }

  /**
   * Get provider statistics
   */
  getStats(provider) {
    const providerData = this.history.get(provider);
    return providerData ? { ...providerData.stats } : null;
  }

  /**
   * Get recent performance trend
   */
  getRecentTrend(provider, windowSize = 10) {
    const providerData = this.history.get(provider);
    if (!providerData) return null;

    const recentRequests = providerData.requests.slice(-windowSize);
    if (recentRequests.length === 0) return null;

    const successRate = recentRequests.filter(r => r.success).length / recentRequests.length;
    const avgLatency = recentRequests.reduce((sum, r) => sum + r.latency, 0) / recentRequests.length;

    return {
      successRate,
      avgLatency,
      requestCount: recentRequests.length
    };
  }

  /**
   * Compare two providers
   */
  compareProviders(provider1, provider2) {
    const stats1 = this.getStats(provider1);
    const stats2 = this.getStats(provider2);

    if (!stats1 || !stats2) return null;

    return {
      provider1: provider1,
      provider2: provider2,
      successRate: stats1.successRate - stats2.successRate,
      avgLatency: stats2.avgLatency - stats1.avgLatency, // Lower is better
      avgCost: stats2.avgCost - stats1.avgCost, // Lower is better
      winner: this.determineWinner(stats1, stats2)
    };
  }

  /**
   * Determine winner between two providers
   */
  determineWinner(stats1, stats2) {
    // Weight: success rate (50%), latency (30%), cost (20%)
    const score1 = (stats1.successRate * 0.5) +
                   ((1000 / Math.max(stats1.avgLatency, 1)) * 0.3) +
                   ((1 / Math.max(stats1.avgCost, 0.001)) * 0.2);

    const score2 = (stats2.successRate * 0.5) +
                   ((1000 / Math.max(stats2.avgLatency, 1)) * 0.3) +
                   ((1 / Math.max(stats2.avgCost, 0.001)) * 0.2);

    return score1 > score2 ? 'provider1' : 'provider2';
  }

  /**
   * Get all provider stats
   */
  getAllStats() {
    const allStats = {};
    for (const [provider, data] of this.history.entries()) {
      allStats[provider] = { ...data.stats };
    }
    return allStats;
  }

  /**
   * Reset statistics for a provider
   */
  reset(provider) {
    if (provider) {
      this.history.delete(provider);
    } else {
      this.history.clear();
    }
  }
}

/**
 * Response consensus engine
 */
class ConsensusEngine {
  constructor() {
    this.similarityThreshold = 0.7; // 70% similarity
  }

  /**
   * Calculate similarity between two responses
   */
  calculateSimilarity(response1, response2) {
    const content1 = this.normalizeContent(response1.content);
    const content2 = this.normalizeContent(response2.content);

    // Use Levenshtein distance for similarity
    const distance = this.levenshteinDistance(content1, content2);
    const maxLength = Math.max(content1.length, content2.length);

    return maxLength > 0 ? 1 - (distance / maxLength) : 1;
  }

  /**
   * Normalize content for comparison
   */
  normalizeContent(content) {
    return content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate Levenshtein distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Find consensus among multiple responses
   */
  findConsensus(responses) {
    if (responses.length === 0) return null;
    if (responses.length === 1) return responses[0];

    // Calculate pairwise similarities
    const similarities = [];

    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        const similarity = this.calculateSimilarity(responses[i], responses[j]);
        similarities.push({
          index1: i,
          index2: j,
          similarity
        });
      }
    }

    // Score each response by average similarity to others
    const scores = responses.map((response, index) => {
      const relevantSims = similarities.filter(s =>
        s.index1 === index || s.index2 === index
      );

      const avgSimilarity = relevantSims.length > 0
        ? relevantSims.reduce((sum, s) => sum + s.similarity, 0) / relevantSims.length
        : 0;

      return {
        response,
        index,
        score: avgSimilarity
      };
    });

    // Sort by score (highest first)
    scores.sort((a, b) => b.score - a.score);

    return {
      consensus: scores[0].response,
      confidence: scores[0].score,
      alternatives: scores.slice(1).map(s => s.response),
      agreement: scores[0].score >= this.similarityThreshold
    };
  }

  /**
   * Majority vote among responses
   */
  majorityVote(responses) {
    if (responses.length === 0) return null;

    // Group similar responses
    const groups = [];

    for (const response of responses) {
      let foundGroup = false;

      for (const group of groups) {
        const similarity = this.calculateSimilarity(response, group[0]);

        if (similarity >= this.similarityThreshold) {
          group.push(response);
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        groups.push([response]);
      }
    }

    // Find largest group
    groups.sort((a, b) => b.length - a.length);

    return {
      winner: groups[0][0],
      votes: groups[0].length,
      totalVotes: responses.length,
      confidence: groups[0].length / responses.length,
      alternatives: groups.slice(1).map(g => g[0])
    };
  }
}

/**
 * Provider Intelligence Engine
 */
class ProviderIntelligenceEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enablePerformanceTracking: options.enablePerformanceTracking !== false,
      enableConsensus: options.enableConsensus !== false,
      selectionStrategy: options.selectionStrategy || 'balanced', // balanced, cost, speed, quality
      ...options
    };

    this.performanceTracker = new ProviderPerformanceTracker();
    this.consensusEngine = new ConsensusEngine();

    // Selection strategies
    this.strategies = {
      balanced: this.selectBalanced.bind(this),
      cost: this.selectByCost.bind(this),
      speed: this.selectBySpeed.bind(this),
      quality: this.selectByQuality.bind(this),
      reliability: this.selectByReliability.bind(this)
    };
  }

  /**
   * Select best provider for a request
   */
  selectProvider(availableProviders, requestContext = {}) {
    if (availableProviders.length === 0) {
      throw new Error('No providers available');
    }

    if (availableProviders.length === 1) {
      return availableProviders[0];
    }

    // Use specified strategy or default
    const strategy = requestContext.strategy || this.options.selectionStrategy;
    const selectFn = this.strategies[strategy] || this.strategies.balanced;

    const selected = selectFn(availableProviders, requestContext);

    this.emit('provider:selected', {
      selected,
      strategy,
      availableProviders,
      requestContext
    });

    return selected;
  }

  /**
   * Balanced selection (consider all factors)
   */
  selectBalanced(providers, context) {
    const scores = providers.map(provider => {
      const stats = this.performanceTracker.getStats(provider);

      if (!stats || stats.totalRequests < 5) {
        // Not enough data, give neutral score
        return { provider, score: 0.5 };
      }

      // Balanced weights: success (40%), speed (30%), cost (30%)
      const successScore = stats.successRate;
      const speedScore = stats.avgLatency > 0
        ? Math.min(1, 1000 / stats.avgLatency)
        : 0;
      const costScore = stats.avgCost > 0
        ? Math.min(1, 0.01 / stats.avgCost)
        : 0;

      const score = (successScore * 0.4) + (speedScore * 0.3) + (costScore * 0.3);

      return { provider, score };
    });

    scores.sort((a, b) => b.score - a.score);
    return scores[0].provider;
  }

  /**
   * Select by cost (cheapest)
   */
  selectByCost(providers, context) {
    const scores = providers.map(provider => {
      const stats = this.performanceTracker.getStats(provider);

      if (!stats || stats.totalRequests < 3) {
        return { provider, cost: Infinity };
      }

      return { provider, cost: stats.avgCost };
    });

    scores.sort((a, b) => a.cost - b.cost);
    return scores[0].provider;
  }

  /**
   * Select by speed (fastest)
   */
  selectBySpeed(providers, context) {
    const scores = providers.map(provider => {
      const stats = this.performanceTracker.getStats(provider);

      if (!stats || stats.totalRequests < 3) {
        return { provider, latency: Infinity };
      }

      return { provider, latency: stats.avgLatency };
    });

    scores.sort((a, b) => a.latency - b.latency);
    return scores[0].provider;
  }

  /**
   * Select by quality (best success rate)
   */
  selectByQuality(providers, context) {
    const scores = providers.map(provider => {
      const stats = this.performanceTracker.getStats(provider);

      if (!stats || stats.totalRequests < 5) {
        return { provider, quality: 0 };
      }

      return { provider, quality: stats.successRate };
    });

    scores.sort((a, b) => b.quality - a.quality);
    return scores[0].provider;
  }

  /**
   * Select by reliability (consistent performance)
   */
  selectByReliability(providers, context) {
    const scores = providers.map(provider => {
      const trend = this.performanceTracker.getRecentTrend(provider, 10);

      if (!trend || trend.requestCount < 5) {
        return { provider, reliability: 0 };
      }

      // Reliability = high success rate + consistent latency
      const reliability = trend.successRate;

      return { provider, reliability };
    });

    scores.sort((a, b) => b.reliability - a.reliability);
    return scores[0].provider;
  }

  /**
   * Record request result for learning
   */
  recordResult(provider, result) {
    if (!this.options.enablePerformanceTracking) return;

    this.performanceTracker.recordRequest(provider, result);

    this.emit('result:recorded', {
      provider,
      success: result.success,
      latency: result.latency,
      cost: result.cost
    });
  }

  /**
   * Find consensus among multiple provider responses
   */
  findConsensus(responses) {
    if (!this.options.enableConsensus) {
      return responses[0] || null;
    }

    const consensus = this.consensusEngine.findConsensus(responses);

    this.emit('consensus:found', {
      responseCount: responses.length,
      confidence: consensus?.confidence || 0,
      agreement: consensus?.agreement || false
    });

    return consensus;
  }

  /**
   * Get provider rankings
   */
  getProviderRankings(providers) {
    const rankings = providers.map(provider => {
      const stats = this.performanceTracker.getStats(provider);

      if (!stats) {
        return {
          provider,
          rank: 0,
          score: 0,
          stats: null
        };
      }

      // Calculate overall score
      const score = (stats.successRate * 0.4) +
                   (Math.min(1, 1000 / Math.max(stats.avgLatency, 1)) * 0.3) +
                   (Math.min(1, 0.01 / Math.max(stats.avgCost, 0.001)) * 0.3);

      return {
        provider,
        score,
        stats
      };
    });

    rankings.sort((a, b) => b.score - a.score);

    // Assign ranks
    rankings.forEach((ranking, index) => {
      ranking.rank = index + 1;
    });

    return rankings;
  }

  /**
   * Get performance comparison between providers
   */
  compareProviders(provider1, provider2) {
    return this.performanceTracker.compareProviders(provider1, provider2);
  }

  /**
   * Get all provider statistics
   */
  getAllStats() {
    return this.performanceTracker.getAllStats();
  }

  /**
   * Reset statistics
   */
  resetStats(provider = null) {
    this.performanceTracker.reset(provider);
    this.emit('stats:reset', { provider });
  }
}

module.exports = {
  ProviderIntelligenceEngine,
  ProviderPerformanceTracker,
  ConsensusEngine
};
