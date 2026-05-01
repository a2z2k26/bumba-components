/**
 * BUMBA Compare Engine
 * A/B testing orchestration vs simple mode execution
 *
 * Part of BUMBA Observability Enhancement - Phase 3: Compare Mode
 * Sprint P3-S1: Base Structure
 */

class CompareEngine {
  constructor() {
    this.orchestrationResults = null;
    this.simpleResults = null;
    this.comparison = null;
  }

  /**
   * Run A/B comparison (documented API)
   * Phase 8-S131: Added to match documentation
   * @param {string} query - The query to test
   * @param {Object} options - Optional configuration
   * @returns {Object} Comparison result with winner, confidence, and recommendation
   */
  async runComparison(query, options = {}) {
    // Use the existing compare() method
    const fullComparison = await this.compare(query, options);

    // Return simplified result matching documented API
    return {
      winner: fullComparison.winner.winner,
      confidence: fullComparison.winner.confidence,
      recommendation: fullComparison.recommendations[0]?.message || fullComparison.winner.reason,
      metrics: {
        orchestration: {
          duration: fullComparison.metrics.duration.orchestration,
          quality: fullComparison.metrics.quality.orchestration,
          success: fullComparison.metrics.success.orchestration
        },
        simple: {
          duration: fullComparison.metrics.duration.simple,
          quality: fullComparison.metrics.quality.simple,
          success: fullComparison.metrics.success.simple
        }
      },
      fullComparison // Include full details for advanced usage
    };
  }

  /**
   * Run the same query in both modes and compare
   * P3-S2: Implemented
   */
  async compare(query, options = {}) {
    const comparisonId = `cmp${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`;
    const startTime = Date.now();

    // Execute in both modes
    this.orchestrationResults = await this.executeOrchestration(query, options);
    this.simpleResults = await this.executeSimple(query, options);

    // Calculate metrics
    const metrics = this.calculateMetrics();

    // Determine winner
    const winner = this.determineWinner();

    // Generate recommendations
    const recommendations = this.generateRecommendations();

    // Build comparison object
    this.comparison = {
      comparisonId,
      query,
      timestamp: new Date().toISOString(),
      totalDuration: Date.now() - startTime,
      orchestration: this.orchestrationResults,
      simple: this.simpleResults,
      metrics,
      winner,
      recommendations
    };

    return this.comparison;
  }

  /**
   * Execute query in orchestration mode
   * P3-S3: Implemented
   */
  async executeOrchestration(query, options) {
    const startTime = Date.now();
    const metrics = {
      startTime,
      specialists: [],
      routing: null,
      models: [],
      errors: []
    };

    try {
      // Import required components

      // Step 1: Query Analysis
      const router = new CommandRouter();
      const analysisStart = Date.now();
      const analysis = await router.analyzeQuery(query);
      const analysisTime = Date.now() - analysisStart;

      metrics.routing = {
        department: analysis.department,
        taskType: analysis.taskType,
        complexity: analysis.complexity,
        analysisTime
      };

      // Step 2: Get Department Manager
      const managerStart = Date.now();
      const manager = router.getManagerForDepartment(analysis.department);

      if (!manager) {
        throw new Error(`No manager found for department: ${analysis.department}`);
      }

      const managerTime = Date.now() - managerStart;
      metrics.managerTime = managerTime;

      // Step 3: Execute Specialists
      const executionStart = Date.now();
      const specialists = await manager.executeTask(query, {
        taskType: analysis.taskType,
        context: options.context || {}
      });

      const executionTime = Date.now() - executionStart;
      metrics.executionTime = executionTime;
      metrics.specialistCount = specialists.length;

      // Capture specialist details
      specialists.forEach((specialist, index) => {
        metrics.specialists.push({
          index: index + 1,
          type: specialist.type || 'unknown',
          model: specialist.model || 'unknown',
          duration: specialist.duration || 0,
          success: specialist.success !== false
        });

        if (specialist.model && !metrics.models.includes(specialist.model)) {
          metrics.models.push(specialist.model);
        }
      });

      // Step 4: Synthesize Response
      const synthesisStart = Date.now();
      const synthesizer = new ResponseSynthesizer();
      const response = await synthesizer.synthesize(specialists, {
        query,
        taskType: analysis.taskType
      });
      const synthesisTime = Date.now() - synthesisStart;
      metrics.synthesisTime = synthesisTime;

      // Calculate total duration
      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      return {
        success: true,
        response: response.text || response,
        metrics: {
          ...metrics,
          endTime,
          totalDuration,
          overhead: analysisTime + managerTime + synthesisTime,
          actualWork: executionTime
        },
        analysis,
        specialists: specialists.length
      };

    } catch (error) {
      const endTime = Date.now();
      metrics.errors.push({
        message: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        metrics: {
          ...metrics,
          endTime,
          totalDuration: endTime - startTime
        }
      };
    }
  }

  /**
   * Execute query in simple mode
   * P3-S4: Implemented
   */
  async executeSimple(query, options) {
    const startTime = Date.now();
    const metrics = {
      startTime,
      model: null,
      errors: []
    };

    try {
      // Import AI provider
      const Anthropic = require('@anthropic-ai/sdk');

      // Use default model (can be overridden in options)
      const model = options.simpleModel || 'claude-sonnet-4-5-20250929';
      metrics.model = model;

      // Initialize client
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });

      // Make direct API call without orchestration
      const apiStart = Date.now();
      const completion = await anthropic.messages.create({
        model: model,
        max_tokens: options.maxTokens || 4096,
        messages: [
          {
            role: 'user',
            content: query
          }
        ]
      });
      const apiTime = Date.now() - apiStart;
      metrics.apiTime = apiTime;

      // Extract response
      const response = completion.content[0].text;

      // Calculate total duration
      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      return {
        success: true,
        response,
        metrics: {
          ...metrics,
          endTime,
          totalDuration,
          overhead: totalDuration - apiTime,
          actualWork: apiTime,
          inputTokens: completion.usage?.input_tokens || 0,
          outputTokens: completion.usage?.output_tokens || 0
        },
        model
      };

    } catch (error) {
      const endTime = Date.now();
      metrics.errors.push({
        message: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        metrics: {
          ...metrics,
          endTime,
          totalDuration: endTime - startTime
        }
      };
    }
  }

  /**
   * Calculate comparison metrics
   * P3-S5: Implemented
   */
  calculateMetrics() {
    if (!this.orchestrationResults || !this.simpleResults) {
      throw new Error('Both orchestration and simple results required for metrics calculation');
    }

    const metrics = {
      duration: {
        orchestration: this.orchestrationResults.metrics?.totalDuration || 0,
        simple: this.simpleResults.metrics?.totalDuration || 0,
        difference: 0,
        percentageDiff: 0,
        faster: null
      },
      overhead: {
        orchestration: this.orchestrationResults.metrics?.overhead || 0,
        simple: this.simpleResults.metrics?.overhead || 0,
        difference: 0
      },
      quality: {
        orchestration: null,
        simple: null,
        difference: 0,
        better: null
      },
      specialists: {
        count: this.orchestrationResults.specialists || 0,
        models: this.orchestrationResults.metrics?.models || []
      },
      tokens: {
        orchestration: {
          input: this.orchestrationResults.metrics?.inputTokens || 0,
          output: this.orchestrationResults.metrics?.outputTokens || 0,
          total: 0
        },
        simple: {
          input: this.simpleResults.metrics?.inputTokens || 0,
          output: this.simpleResults.metrics?.outputTokens || 0,
          total: 0
        }
      },
      success: {
        orchestration: this.orchestrationResults.success,
        simple: this.simpleResults.success,
        bothSucceeded: false
      }
    };

    // Calculate duration metrics
    metrics.duration.difference = metrics.duration.orchestration - metrics.duration.simple;
    if (metrics.duration.simple > 0) {
      metrics.duration.percentageDiff = Math.round(
        (metrics.duration.difference / metrics.duration.simple) * 100
      );
    }
    metrics.duration.faster = metrics.duration.difference < 0 ? 'orchestration' : 'simple';

    // Calculate overhead difference
    metrics.overhead.difference = metrics.overhead.orchestration - metrics.overhead.simple;

    // Calculate quality scores
    if (this.orchestrationResults.success) {
      metrics.quality.orchestration = this.calculateQualityScore(this.orchestrationResults.response);
    }
    if (this.simpleResults.success) {
      metrics.quality.simple = this.calculateQualityScore(this.simpleResults.response);
    }

    if (metrics.quality.orchestration !== null && metrics.quality.simple !== null) {
      metrics.quality.difference = metrics.quality.orchestration - metrics.quality.simple;
      metrics.quality.better = metrics.quality.difference > 0 ? 'orchestration' : 'simple';
    }

    // Calculate token totals
    metrics.tokens.orchestration.total =
      metrics.tokens.orchestration.input + metrics.tokens.orchestration.output;
    metrics.tokens.simple.total =
      metrics.tokens.simple.input + metrics.tokens.simple.output;

    // Success status
    metrics.success.bothSucceeded =
      metrics.success.orchestration && metrics.success.simple;

    return metrics;
  }

  /**
   * Determine which mode performed better
   * P3-S6: Implemented
   */
  determineWinner() {
    if (!this.orchestrationResults || !this.simpleResults) {
      return {
        winner: 'undetermined',
        reason: 'Missing execution results',
        confidence: 0,
        scores: {}
      };
    }

    const scores = {
      orchestration: 0,
      simple: 0
    };

    const factors = [];

    // Factor 1: Success (40 points) - Most important
    if (this.orchestrationResults.success && !this.simpleResults.success) {
      scores.orchestration += 40;
      factors.push('Orchestration succeeded while simple mode failed (+40 orchestration)');
    } else if (this.simpleResults.success && !this.orchestrationResults.success) {
      scores.simple += 40;
      factors.push('Simple mode succeeded while orchestration failed (+40 simple)');
    } else if (this.orchestrationResults.success && this.simpleResults.success) {
      // Both succeeded, split points
      scores.orchestration += 20;
      scores.simple += 20;
      factors.push('Both modes succeeded (+20 each)');
    }

    // Factor 2: Quality (30 points)
    const qualityDiff = (this.orchestrationResults.metrics?.quality?.orchestration || 0) -
                        (this.simpleResults.metrics?.quality?.simple || 0);

    if (Math.abs(qualityDiff) > 10) {
      // Significant quality difference
      if (qualityDiff > 0) {
        scores.orchestration += 30;
        factors.push(`Orchestration quality significantly better (+30 orchestration)`);
      } else {
        scores.simple += 30;
        factors.push(`Simple mode quality significantly better (+30 simple)`);
      }
    } else if (Math.abs(qualityDiff) > 5) {
      // Moderate quality difference
      if (qualityDiff > 0) {
        scores.orchestration += 15;
        factors.push(`Orchestration quality moderately better (+15 orchestration)`);
      } else {
        scores.simple += 15;
        factors.push(`Simple mode quality moderately better (+15 simple)`);
      }
    } else {
      // Similar quality
      scores.orchestration += 15;
      scores.simple += 15;
      factors.push('Quality similar between modes (+15 each)');
    }

    // Factor 3: Speed (20 points)
    const orchestrationDuration = this.orchestrationResults.metrics?.totalDuration || 0;
    const simpleDuration = this.simpleResults.metrics?.totalDuration || 0;
    const speedDiff = ((orchestrationDuration - simpleDuration) / simpleDuration) * 100;

    if (speedDiff < -20) {
      // Orchestration significantly faster (rare but possible)
      scores.orchestration += 20;
      factors.push(`Orchestration significantly faster (+20 orchestration)`);
    } else if (speedDiff < -10) {
      scores.orchestration += 10;
      factors.push(`Orchestration moderately faster (+10 orchestration)`);
    } else if (speedDiff > 50) {
      // Simple mode much faster
      scores.simple += 20;
      factors.push(`Simple mode much faster (+20 simple)`);
    } else if (speedDiff > 20) {
      scores.simple += 10;
      factors.push(`Simple mode faster (+10 simple)`);
    } else {
      // Similar speed
      scores.orchestration += 10;
      scores.simple += 10;
      factors.push('Speed similar between modes (+10 each)');
    }

    // Factor 4: Specialist utilization bonus (10 points)
    const specialistCount = this.orchestrationResults.specialists || 0;
    if (specialistCount > 2) {
      scores.orchestration += 10;
      factors.push(`Multiple specialists used effectively (+10 orchestration)`);
    } else if (specialistCount > 0) {
      scores.orchestration += 5;
      factors.push(`Specialists used (+5 orchestration)`);
    }

    // Determine winner
    const totalScore = scores.orchestration + scores.simple;
    const orchestrationPercentage = Math.round((scores.orchestration / totalScore) * 100);
    const simplePercentage = Math.round((scores.simple / totalScore) * 100);

    let winner;
    let confidence;
    let reason;

    if (scores.orchestration > scores.simple) {
      winner = 'orchestration';
      confidence = orchestrationPercentage;
      reason = `Orchestration performed better (${orchestrationPercentage}% vs ${simplePercentage}%)`;
    } else if (scores.simple > scores.orchestration) {
      winner = 'simple';
      confidence = simplePercentage;
      reason = `Simple mode performed better (${simplePercentage}% vs ${orchestrationPercentage}%)`;
    } else {
      winner = 'tie';
      confidence = 50;
      reason = 'Both modes performed equally well';
    }

    return {
      winner,
      reason,
      confidence,
      scores: {
        orchestration: scores.orchestration,
        simple: scores.simple,
        orchestrationPercentage,
        simplePercentage
      },
      factors
    };
  }

  /**
   * Generate recommendations based on comparison
   * P3-S7: Implemented
   */
  generateRecommendations() {
    if (!this.comparison) {
      return ['Run a comparison first to get recommendations'];
    }

    const recommendations = [];
    const { metrics, winner } = this.comparison;

    // Recommendation 1: Based on winner
    if (winner.winner === 'orchestration') {
      recommendations.push(
        `✅ Use orchestration mode for this type of query (${winner.confidence}% confidence)`
      );

      if (metrics.specialists.count > 2) {
        recommendations.push(
          `🎯 Complex tasks benefit from orchestration's ${metrics.specialists.count} specialized models`
        );
      }

      if (metrics.quality.better === 'orchestration') {
        recommendations.push(
          `⭐ Orchestration provides better quality responses despite longer execution time`
        );
      }
    } else if (winner.winner === 'simple') {
      recommendations.push(
        `✅ Use simple mode for this type of query (${winner.confidence}% confidence)`
      );

      if (metrics.duration.percentageDiff > 50) {
        recommendations.push(
          `⚡ Simple mode is ${metrics.duration.percentageDiff}% faster with similar quality`
        );
      }

      if (metrics.quality.better === 'simple' || Math.abs(metrics.quality.difference) < 5) {
        recommendations.push(
          `💡 Simple queries don't benefit from orchestration complexity`
        );
      }
    } else {
      recommendations.push(
        `⚖️  Both modes perform similarly - use simple mode for faster responses`
      );
    }

    // Recommendation 2: Based on speed
    if (metrics.duration.orchestration > metrics.duration.simple * 2) {
      recommendations.push(
        `⏱️  Orchestration overhead is significant (${Math.round(metrics.duration.percentageDiff)}%). Consider simple mode for time-sensitive queries.`
      );
    }

    // Recommendation 3: Based on quality difference
    if (metrics.quality.difference > 15) {
      recommendations.push(
        `📊 Large quality difference detected. Orchestration specialization is valuable here.`
      );
    } else if (Math.abs(metrics.quality.difference) < 5) {
      recommendations.push(
        `📊 Quality is similar between modes. Choose based on speed requirements.`
      );
    }

    // Recommendation 4: Based on success rates
    if (!metrics.success.bothSucceeded) {
      if (metrics.success.orchestration && !metrics.success.simple) {
        recommendations.push(
          `🔧 Orchestration succeeded where simple mode failed - complexity handling is crucial`
        );
      } else if (metrics.success.simple && !metrics.success.orchestration) {
        recommendations.push(
          `⚠️  Orchestration failed - this query may be too simple or edge case handling needs improvement`
        );
      }
    }

    // Recommendation 5: Cost consideration (if token data available)
    if (metrics.tokens.orchestration.total > metrics.tokens.simple.total * 1.5) {
      const tokenIncrease = Math.round(
        ((metrics.tokens.orchestration.total - metrics.tokens.simple.total) /
          metrics.tokens.simple.total) * 100
      );
      recommendations.push(
        `💰 Orchestration uses ${tokenIncrease}% more tokens. Consider cost vs quality tradeoff.`
      );
    }

    // Recommendation 6: General guidance
    if (metrics.specialists.count === 1) {
      recommendations.push(
        `💡 Only one specialist used - simple mode likely sufficient for similar queries`
      );
    }

    if (metrics.overhead.orchestration > 1000) {
      // > 1 second overhead
      recommendations.push(
        `⚙️  High orchestration overhead (${Math.round(metrics.overhead.orchestration)}ms). Best for complex tasks only.`
      );
    }

    // Recommendation 7: Query type specific
    if (this.comparison.query.length < 50 && winner.winner === 'simple') {
      recommendations.push(
        `📝 Short queries typically don't benefit from orchestration complexity`
      );
    }

    if (this.comparison.query.length > 200 && winner.winner === 'orchestration') {
      recommendations.push(
        `📚 Complex, detailed queries benefit from orchestration's specialized approach`
      );
    }

    return recommendations;
  }

  /**
   * Format comparison results for display
   * P3-S8: Implemented
   */
  formatResults() {
    if (!this.comparison) {
      return 'No comparison results available. Run compare() first.';
    }

    const chalk = require('chalk');
    const { comparisonId, query, timestamp, totalDuration, metrics, winner, recommendations } = this.comparison;

    let output = '\n';
    output += chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    output += chalk.cyan('  BUMBA Compare Mode - Results\n');
    output += chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');

    // Metadata
    output += chalk.gray(`Comparison ID: ${comparisonId}\n`);
    output += chalk.gray(`Timestamp: ${new Date(timestamp).toLocaleString()}\n`);
    output += chalk.gray(`Total Duration: ${totalDuration}ms\n\n`);

    // Query
    output += chalk.yellow('📝 Query:\n');
    output += chalk.white(`"${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"\n\n`);

    // Winner
    output += chalk.yellow('🏆 Winner:\n');
    if (winner.winner === 'orchestration') {
      output += chalk.green(`✅ Orchestration Mode (${winner.confidence}% confidence)\n`);
    } else if (winner.winner === 'simple') {
      output += chalk.green(`✅ Simple Mode (${winner.confidence}% confidence)\n`);
    } else {
      output += chalk.blue(`⚖️  Tie - Both modes performed equally\n`);
    }
    output += chalk.gray(`${winner.reason}\n\n`);

    // Metrics Comparison Table
    output += chalk.yellow('📊 Metrics Comparison:\n\n');

    // Header
    output += chalk.white(`${'Metric'.padEnd(25)} ${'Orchestration'.padEnd(20)} ${'Simple'.padEnd(20)} ${'Difference'.padEnd(15)}\n`);
    output += chalk.gray('─'.repeat(80) + '\n');

    // Duration
    output += chalk.white('Duration'.padEnd(25));
    output += `${metrics.duration.orchestration}ms`.padEnd(20);
    output += `${metrics.duration.simple}ms`.padEnd(20);
    const durationDiff = metrics.duration.faster === 'simple'
      ? chalk.green(`-${Math.abs(metrics.duration.percentageDiff)}%`)
      : chalk.red(`+${metrics.duration.percentageDiff}%`);
    output += durationDiff.padEnd(15) + '\n';

    // Overhead
    output += chalk.white('Overhead'.padEnd(25));
    output += `${Math.round(metrics.overhead.orchestration)}ms`.padEnd(20);
    output += `${Math.round(metrics.overhead.simple)}ms`.padEnd(20);
    output += `${Math.round(metrics.overhead.difference)}ms\n`.padEnd(15);

    // Quality
    if (metrics.quality.orchestration !== null && metrics.quality.simple !== null) {
      output += chalk.white('Quality Score'.padEnd(25));
      output += `${Math.round(metrics.quality.orchestration)}/100`.padEnd(20);
      output += `${Math.round(metrics.quality.simple)}/100`.padEnd(20);
      const qualityDiff = metrics.quality.better === 'orchestration'
        ? chalk.green(`+${Math.abs(Math.round(metrics.quality.difference))}`)
        : chalk.red(`${Math.round(metrics.quality.difference)}`);
      output += qualityDiff.padEnd(15) + '\n';
    }

    // Specialists
    output += chalk.white('Specialists Used'.padEnd(25));
    output += `${metrics.specialists.count}`.padEnd(20);
    output += `0`.padEnd(20);
    output += '-\n';

    // Tokens
    if (metrics.tokens.orchestration.total > 0 || metrics.tokens.simple.total > 0) {
      output += chalk.white('Total Tokens'.padEnd(25));
      output += `${metrics.tokens.orchestration.total}`.padEnd(20);
      output += `${metrics.tokens.simple.total}`.padEnd(20);
      const tokenDiff = metrics.tokens.orchestration.total - metrics.tokens.simple.total;
      output += `${tokenDiff > 0 ? '+' : ''}${tokenDiff}\n`;
    }

    // Success
    output += chalk.white('Success'.padEnd(25));
    output += (metrics.success.orchestration ? chalk.green('✅ Yes') : chalk.red('❌ No')).padEnd(29);
    output += (metrics.success.simple ? chalk.green('✅ Yes') : chalk.red('❌ No')).padEnd(29);
    output += '-\n\n';

    // Recommendations
    output += chalk.yellow('💡 Recommendations:\n\n');
    recommendations.forEach((rec, index) => {
      output += chalk.white(`${index + 1}. ${rec}\n`);
    });

    output += '\n' + chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');

    return output;
  }

  /**
   * Calculate quality score for a response
   * P3-S9: Implemented
   *
   * Uses heuristics to score response quality on a 0-100 scale
   */
  calculateQualityScore(response) {
    if (!response || typeof response !== 'string') {
      return 0;
    }

    let score = 0;

    // Factor 1: Length (20 points)
    // Optimal length: 200-2000 characters
    const length = response.length;
    if (length < 50) {
      score += 5; // Too short
    } else if (length < 200) {
      score += 10;
    } else if (length >= 200 && length <= 2000) {
      score += 20; // Optimal
    } else if (length <= 5000) {
      score += 15;
    } else {
      score += 10; // Very long
    }

    // Factor 2: Structure (20 points)
    let structureScore = 0;

    // Has paragraphs (multiple line breaks)
    const paragraphs = response.split('\n\n').filter(p => p.trim().length > 0);
    if (paragraphs.length >= 2) {
      structureScore += 5;
    }

    // Has lists (bullet points or numbered)
    const hasList = /[-*•]\s/.test(response) || /\d+\.\s/.test(response);
    if (hasList) {
      structureScore += 5;
    }

    // Has code blocks
    const hasCodeBlocks = /```/.test(response) || /`[^`]+`/.test(response);
    if (hasCodeBlocks) {
      structureScore += 5;
    }

    // Has headings or sections
    const hasSections = /#\s/.test(response) || /^[A-Z][^.!?]*:$/m.test(response);
    if (hasSections) {
      structureScore += 5;
    }

    score += structureScore;

    // Factor 3: Completeness (20 points)
    let completenessScore = 0;

    // Has introduction (first paragraph exists)
    if (paragraphs.length > 0 && paragraphs[0].length > 50) {
      completenessScore += 7;
    }

    // Has substantial middle content
    if (paragraphs.length > 2) {
      completenessScore += 7;
    }

    // Has conclusion or summary indicators
    const conclusionKeywords = /(in summary|in conclusion|finally|overall|to sum up|therefore)/i;
    if (conclusionKeywords.test(response)) {
      completenessScore += 6;
    }

    score += completenessScore;

    // Factor 4: Code Quality (15 points) - if code is present
    if (hasCodeBlocks) {
      let codeScore = 0;

      // Proper code formatting (indentation)
      const codeBlocks = response.match(/```[\s\S]*?```/g) || [];
      if (codeBlocks.length > 0) {
        // Has proper code blocks with language identifier
        const hasLangId = /```\w+/.test(response);
        if (hasLangId) {
          codeScore += 5;
        }

        // Code has comments
        const hasComments = /\/\/|\/\*|\*\/|#/.test(response);
        if (hasComments) {
          codeScore += 5;
        }

        // Code is reasonably formatted (has indentation)
        const hasIndentation = /\n\s{2,}/.test(response);
        if (hasIndentation) {
          codeScore += 5;
        }
      }

      score += codeScore;
    } else {
      // No code, give partial points for text-only quality
      score += 7;
    }

    // Factor 5: Clarity and Readability (15 points)
    let clarityScore = 0;

    // Sentence variety (not all sentences same length)
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 3) {
      const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
      // Good average sentence length: 50-150 characters
      if (avgLength >= 50 && avgLength <= 150) {
        clarityScore += 5;
      } else if (avgLength >= 30 && avgLength <= 200) {
        clarityScore += 3;
      }
    }

    // Uses examples or explanations
    const hasExamples = /(for example|such as|e\.g\.|for instance|consider)/i.test(response);
    if (hasExamples) {
      clarityScore += 5;
    }

    // Avoids excessive jargon (reasonable word length average)
    const words = response.split(/\s+/);
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    if (avgWordLength >= 4 && avgWordLength <= 7) {
      clarityScore += 5; // Good balance
    } else if (avgWordLength >= 3 && avgWordLength <= 9) {
      clarityScore += 3;
    }

    score += clarityScore;

    // Factor 6: Actionability and Usefulness (10 points)
    let actionabilityScore = 0;

    // Has action verbs or instructions
    const hasActions = /(you can|you should|to do|follow these|steps:|instructions:)/i.test(response);
    if (hasActions) {
      actionabilityScore += 5;
    }

    // Provides specific details (numbers, file paths, commands)
    const hasSpecifics = /\d+|\/[\w/]+|`[^`]+`/.test(response);
    if (hasSpecifics) {
      actionabilityScore += 5;
    }

    score += actionabilityScore;

    // Ensure score is within 0-100 range
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Save comparison results to disk
   * P3-S10: Implemented
   */
  async saveComparison(comparison) {
    const fs = require('fs').promises;
    const path = require('path');
    const os = require('os');

    // Use the comparison argument or this.comparison
    const comparisonToSave = comparison || this.comparison;

    if (!comparisonToSave) {
      throw new Error('No comparison results to save');
    }

    // Create comparisons directory
    const comparisonsDir = path.join(os.homedir(), '.bumba', 'comparisons');

    try {
      await fs.mkdir(comparisonsDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    // Generate filename: comparison-{comparisonId}-{timestamp}.json
    const filename = `comparison-${comparisonToSave.comparisonId}-${Date.now()}.json`;
    const filepath = path.join(comparisonsDir, filename);

    // Save to disk
    await fs.writeFile(
      filepath,
      JSON.stringify(comparisonToSave, null, 2),
      'utf-8'
    );

    return filepath;
  }
}

module.exports = CompareEngine;
