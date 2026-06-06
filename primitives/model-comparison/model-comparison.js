/**
 * Sprint 3-1: Model Comparison System
 * Compare responses from different AI models
 */

const EventEmitter = require('events');
const chalk = require('chalk');

class ModelComparison extends EventEmitter {
  constructor(options = {}) {
    super();

    this.models = options.models || [];
    this.results = [];

    // Comparison metrics
    this.metrics = {
      responseTime: true,
      tokenCount: true,
      cost: true,
      quality: options.includeQuality !== false,
      similarity: options.includeSimilarity !== false
    };

    // Scoring weights for ranking
    this.weights = {
      speed: options.speedWeight || 0.3,
      cost: options.costWeight || 0.3,
      quality: options.qualityWeight || 0.4
    };
  }

  /**
   * Run comparison across multiple models
   */
  async runComparison(prompt, apiClient, options = {}) {
    if (!this.models || this.models.length === 0) {
      throw new Error('No models configured for comparison');
    }

    this.results = [];
    const startTime = Date.now();

    console.log(chalk.bold.cyan(` Comparing ${this.models.length} models...\n`));

    // Run each model
    for (const model of this.models) {
      try {
        console.log(chalk.gray(`Testing ${model}...`));

        const modelStart = Date.now();

        // Call API
        const response = await apiClient.sendMessage({
          model,
          messages: [{ role: 'user', content: prompt }],
          ...options
        });

        const responseTime = Date.now() - modelStart;

        // Collect result
        const result = {
          model,
          response: response.content,
          responseTime,
          tokens: response.usage?.total_tokens || 0,
          cost: this.estimateCost(model, response.usage),
          timestamp: new Date().toISOString(),
          metadata: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0
          }
        };

        this.results.push(result);

        this.emit('model-completed', result);

      } catch (error) {
        console.error(chalk.red(`  Error with ${model}:`), error.message);

        this.results.push({
          model,
          error: error.message,
          failed: true,
          timestamp: new Date().toISOString()
        });
      }
    }

    const totalTime = Date.now() - startTime;

    // Calculate additional metrics
    if (this.metrics.similarity) {
      this.calculateSimilarity();
    }

    if (this.metrics.quality) {
      this.scoreQuality();
    }

    // Generate rankings
    const rankings = this.generateRankings();

    const comparison = {
      prompt,
      models: this.models,
      results: this.results,
      rankings,
      totalTime,
      timestamp: new Date().toISOString()
    };

    this.emit('comparison-complete', comparison);

    return comparison;
  }

  /**
   * Estimate cost for model usage
   */
  estimateCost(model, usage) {
    if (!usage) return 0;

    // Cost per 1M tokens (approximate pricing as of 2024)
    const pricing = {
      'gpt-4-0125-preview': { input: 10, output: 30 },
      'gpt-4-turbo-preview': { input: 10, output: 30 },
      'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
      'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
      'claude-3-opus-20240229': { input: 15, output: 75 },
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 }
    };

    const modelPricing = pricing[model] || { input: 1, output: 2 };

    const inputCost = (usage.prompt_tokens / 1000000) * modelPricing.input;
    const outputCost = (usage.completion_tokens / 1000000) * modelPricing.output;

    return inputCost + outputCost;
  }

  /**
   * Calculate similarity between responses
   */
  calculateSimilarity() {
    const validResults = this.results.filter(r => !r.failed);

    if (validResults.length < 2) return;

    // Calculate pairwise similarity
    for (let i = 0; i < validResults.length; i++) {
      const similarities = [];

      for (let j = 0; j < validResults.length; j++) {
        if (i !== j) {
          const sim = this.computeSimilarity(
            validResults[i].response,
            validResults[j].response
          );
          similarities.push(sim);
        }
      }

      validResults[i].avgSimilarity = similarities.length > 0
        ? similarities.reduce((a, b) => a + b, 0) / similarities.length
        : 0;
    }
  }

  /**
   * Compute similarity between two strings (simple Jaccard)
   */
  computeSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    // Convert to word sets
    const words1 = new Set(str1.toLowerCase().split(/\s+/));
    const words2 = new Set(str2.toLowerCase().split(/\s+/));

    // Jaccard similarity
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Score response quality (heuristic-based)
   */
  scoreQuality() {
    const validResults = this.results.filter(r => !r.failed);

    for (const result of validResults) {
      const response = result.response || '';

      let score = 50; // Base score

      // Length score (prefer detailed responses)
      const wordCount = response.split(/\s+/).length;
      if (wordCount > 200) score += 15;
      else if (wordCount > 100) score += 10;
      else if (wordCount > 50) score += 5;
      else if (wordCount < 20) score -= 10;

      // Structure score (prefer well-formatted responses)
      if (response.includes('\n\n')) score += 5; // Paragraphs
      if (response.match(/^[\s]*[-*•]/m)) score += 5; // Lists
      if (response.match(/```/)) score += 5; // Code blocks
      if (response.match(/#{1,6}\s/)) score += 5; // Headers

      // Completeness score (penalize incomplete responses)
      if (response.endsWith('...')) score -= 10;
      if (response.length < 50) score -= 15;

      // Coherence score (simple heuristic)
      const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length > 5) score += 5;

      result.qualityScore = Math.max(0, Math.min(100, score));
    }
  }

  /**
   * Generate rankings across different criteria
   */
  generateRankings() {
    const validResults = this.results.filter(r => !r.failed);

    if (validResults.length === 0) {
      return {
        overall: [],
        bySpeed: [],
        byCost: [],
        byQuality: []
      };
    }

    // Normalize metrics for scoring
    const maxTime = Math.max(...validResults.map(r => r.responseTime));
    const maxCost = Math.max(...validResults.map(r => r.cost));
    const maxQuality = Math.max(...validResults.map(r => r.qualityScore || 0));

    // Calculate composite scores
    for (const result of validResults) {
      const speedScore = maxTime > 0 ? (1 - result.responseTime / maxTime) * 100 : 50;
      const costScore = maxCost > 0 ? (1 - result.cost / maxCost) * 100 : 50;
      const qualityScore = result.qualityScore || 50;

      result.compositeScore =
        (speedScore * this.weights.speed) +
        (costScore * this.weights.cost) +
        (qualityScore * this.weights.quality);
    }

    return {
      overall: [...validResults].sort((a, b) => b.compositeScore - a.compositeScore),
      bySpeed: [...validResults].sort((a, b) => a.responseTime - b.responseTime),
      byCost: [...validResults].sort((a, b) => a.cost - b.cost),
      byQuality: [...validResults].sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
    };
  }

  /**
   * Format comparison results for display
   */
  formatResults(comparison) {
    const lines = [];

    lines.push(chalk.bold.cyan('\n═'.repeat(70)));
    lines.push(chalk.bold.cyan('Model Comparison Results'));
    lines.push(chalk.bold.cyan('═'.repeat(70)));
    lines.push('');

    lines.push(chalk.bold('Prompt:'));
    lines.push(chalk.gray(comparison.prompt.substring(0, 100) + '...'));
    lines.push('');

    // Overall ranking
    lines.push(chalk.bold('Overall Ranking:'));
    comparison.rankings.overall.forEach((result, index) => {
      const medal = index === 0 ? '' : index === 1 ? '' : index === 2 ? '' : `${index + 1}.`;
      lines.push(chalk.green(
        `${medal} ${result.model} - Score: ${result.compositeScore.toFixed(1)}`
      ));
    });
    lines.push('');

    // Detailed results
    lines.push(chalk.bold('Detailed Results:'));
    for (const result of comparison.results) {
      if (result.failed) {
        lines.push(chalk.red(`\n ${result.model} - Failed`));
        lines.push(chalk.gray(`   Error: ${result.error}`));
        continue;
      }

      lines.push(chalk.bold(`\n${result.model}:`));
      lines.push(chalk.gray(`   Response Time: ${result.responseTime}ms`));
      lines.push(chalk.gray(`   Tokens: ${result.tokens} (${result.metadata.promptTokens} + ${result.metadata.completionTokens})`));
      lines.push(chalk.gray(`   Cost: $${result.cost.toFixed(6)}`));

      if (result.qualityScore !== undefined) {
        lines.push(chalk.gray(`   Quality Score: ${result.qualityScore}/100`));
      }

      if (result.avgSimilarity !== undefined) {
        lines.push(chalk.gray(`   Similarity to others: ${(result.avgSimilarity * 100).toFixed(1)}%`));
      }

      lines.push(chalk.gray(`   Response: ${result.response.substring(0, 150)}...`));
    }

    lines.push('');
    lines.push(chalk.bold('Summary:'));
    lines.push(chalk.gray(`   Fastest: ${comparison.rankings.bySpeed[0]?.model} (${comparison.rankings.bySpeed[0]?.responseTime}ms)`));
    lines.push(chalk.gray(`   Cheapest: ${comparison.rankings.byCost[0]?.model} ($${comparison.rankings.byCost[0]?.cost.toFixed(6)})`));
    lines.push(chalk.gray(`   Highest Quality: ${comparison.rankings.byQuality[0]?.model} (${comparison.rankings.byQuality[0]?.qualityScore}/100)`));
    lines.push(chalk.gray(`   Total Time: ${comparison.totalTime}ms`));

    lines.push('');
    lines.push(chalk.bold.cyan('═'.repeat(70)));
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Export comparison data
   */
  exportComparison(comparison) {
    return {
      prompt: comparison.prompt,
      models: comparison.models,
      results: comparison.results.map(r => ({
        model: r.model,
        response: r.response,
        responseTime: r.responseTime,
        tokens: r.tokens,
        cost: r.cost,
        qualityScore: r.qualityScore,
        avgSimilarity: r.avgSimilarity,
        failed: r.failed,
        error: r.error
      })),
      rankings: comparison.rankings,
      totalTime: comparison.totalTime,
      timestamp: comparison.timestamp
    };
  }

  /**
   * Set models to compare
   */
  setModels(models) {
    if (!Array.isArray(models) || models.length === 0) {
      throw new Error('Models must be a non-empty array');
    }

    this.models = models;
  }

  /**
   * Set ranking weights
   */
  setWeights(weights) {
    if (weights.speed !== undefined) this.weights.speed = weights.speed;
    if (weights.cost !== undefined) this.weights.cost = weights.cost;
    if (weights.quality !== undefined) this.weights.quality = weights.quality;

    // Normalize weights to sum to 1
    const total = this.weights.speed + this.weights.cost + this.weights.quality;
    if (total !== 1) {
      this.weights.speed /= total;
      this.weights.cost /= total;
      this.weights.quality /= total;
    }
  }
}

module.exports = ModelComparison;
