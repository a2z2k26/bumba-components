const { EventEmitter } = require('events');
const { performance } = require('perf_hooks');

class ProviderBenchmarker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.providers = new Map();
    this.benchmarkResults = new Map();
    this.testSuites = new Map();
    this.concurrencyLevels = options.concurrencyLevels || [1, 5, 10];
    this.warmupRuns = options.warmupRuns || 3;
    this.benchmarkRuns = options.benchmarkRuns || 10;
    this.timeout = options.timeout || 30000;

    this.initializeTestSuites();
  }

  initializeTestSuites() {
    // Simple text completion
    this.testSuites.set('simple-completion', {
      name: 'Simple Text Completion',
      description: 'Basic text completion performance',
      prompts: [
        'Hello, how are you?',
        'What is the capital of France?',
        'Explain quantum computing in one sentence.',
        'Write a haiku about coding.',
        'What is 2 + 2?'
      ],
      options: { maxTokens: 50, temperature: 0.7 },
      metrics: ['latency', 'throughput', 'tokens_per_second']
    });

    // Complex reasoning
    this.testSuites.set('complex-reasoning', {
      name: 'Complex Reasoning',
      description: 'Multi-step reasoning tasks',
      prompts: [
        'If a train travels 120 miles in 2 hours, and another train travels 200 miles in 3 hours, which train is faster and by how much?',
        'Explain the causes of World War I and their interconnections.',
        'Write a Python function to find the longest palindromic substring.',
        'Compare and contrast democracy and autocracy in 3 paragraphs.',
        'Solve this riddle: I am not alive, but I grow; I don\'t have lungs, but I need air; I don\'t have a mouth, but water kills me. What am I?'
      ],
      options: { maxTokens: 200, temperature: 0.3 },
      metrics: ['latency', 'reasoning_quality', 'accuracy']
    });

    // Code generation
    this.testSuites.set('code-generation', {
      name: 'Code Generation',
      description: 'Programming task performance',
      prompts: [
        'Write a JavaScript function to reverse a string.',
        'Create a Python class for a binary search tree.',
        'Write SQL to find the top 5 customers by sales.',
        'Implement bubble sort in C++.',
        'Create a React component for a todo list.'
      ],
      options: { maxTokens: 300, temperature: 0.1 },
      metrics: ['latency', 'code_quality', 'syntax_correctness']
    });

    // Creative writing
    this.testSuites.set('creative-writing', {
      name: 'Creative Writing',
      description: 'Creative and narrative tasks',
      prompts: [
        'Write a short story about a robot learning to paint.',
        'Create a poem about the internet.',
        'Write dialogue between two AI discussing consciousness.',
        'Describe a futuristic city in vivid detail.',
        'Create a compelling product description for a smart coffee mug.'
      ],
      options: { maxTokens: 250, temperature: 0.8 },
      metrics: ['latency', 'creativity', 'coherence']
    });

    // Streaming performance
    this.testSuites.set('streaming', {
      name: 'Streaming Performance',
      description: 'Real-time streaming capabilities',
      prompts: [
        'Tell me a detailed story about space exploration.',
        'Explain machine learning concepts step by step.',
        'Describe how to cook a perfect pasta dish.',
        'Write a technical explanation of blockchain technology.',
        'Create a comprehensive guide to starting a business.'
      ],
      options: { maxTokens: 500, temperature: 0.7, stream: true },
      metrics: ['time_to_first_token', 'tokens_per_second', 'stream_stability']
    });

    // Context handling
    this.testSuites.set('context-handling', {
      name: 'Context Window Utilization',
      description: 'Long context processing efficiency',
      prompts: [
        this.generateLongContext(1000) + '\n\nSummarize the key points above.',
        this.generateLongContext(2000) + '\n\nWhat are the main themes?',
        this.generateLongContext(4000) + '\n\nExtract the most important information.',
      ],
      options: { maxTokens: 200, temperature: 0.5 },
      metrics: ['latency', 'context_retention', 'summary_quality']
    });
  }

  generateLongContext(words) {
    const topics = [
      'artificial intelligence', 'machine learning', 'quantum computing',
      'blockchain technology', 'renewable energy', 'space exploration',
      'biotechnology', 'climate change', 'cybersecurity', 'robotics'
    ];

    let text = '';
    for (let i = 0; i < words; i++) {
      if (i % 50 === 0) {
        text += `\n\nParagraph ${Math.floor(i / 50) + 1}: `;
      }
      text += topics[Math.floor(Math.random() * topics.length)] + ' ';
    }

    return text.trim();
  }

  registerProvider(name, provider) {
    this.providers.set(name, provider);
    this.emit('provider-registered', { name });
  }

  async runBenchmark(providerName, testSuite, options = {}) {
    const provider = this.providers.get(providerName);
    const suite = this.testSuites.get(testSuite);

    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    if (!suite) {
      throw new Error(`Test suite ${testSuite} not found`);
    }

    this.emit('benchmark-started', { provider: providerName, suite: testSuite });

    const results = {
      provider: providerName,
      testSuite,
      timestamp: new Date().toISOString(),
      results: {},
      summary: {}
    };

    // Warmup runs
    await this.runWarmup(provider, suite, options);

    // Run benchmarks for each concurrency level
    for (const concurrency of this.concurrencyLevels) {
      this.emit('concurrency-started', { provider: providerName, concurrency });

      const concurrencyResults = await this.runConcurrencyTest(
        provider,
        suite,
        concurrency,
        options
      );

      results.results[`concurrency_${concurrency}`] = concurrencyResults;

      this.emit('concurrency-completed', {
        provider: providerName,
        concurrency,
        results: concurrencyResults
      });
    }

    // Calculate summary statistics
    results.summary = this.calculateSummary(results.results, suite);

    // Store results
    if (!this.benchmarkResults.has(providerName)) {
      this.benchmarkResults.set(providerName, new Map());
    }
    this.benchmarkResults.get(providerName).set(testSuite, results);

    this.emit('benchmark-completed', { provider: providerName, results });

    return results;
  }

  async runWarmup(provider, suite, options) {
    for (let i = 0; i < this.warmupRuns; i++) {
      try {
        const prompt = suite.prompts[i % suite.prompts.length];
        await this.executeSingleTest(provider, prompt, suite.options, true);
      } catch (error) {
        // Ignore warmup errors
      }
    }
  }

  async runConcurrencyTest(provider, suite, concurrency, options) {
    const results = {
      concurrency,
      tests: [],
      metrics: {},
      errors: 0
    };

    const promises = [];

    for (let batch = 0; batch < this.benchmarkRuns; batch += concurrency) {
      const batchPromises = [];

      for (let i = 0; i < concurrency && (batch + i) < this.benchmarkRuns; i++) {
        const promptIndex = (batch + i) % suite.prompts.length;
        const prompt = suite.prompts[promptIndex];

        const promise = this.executeSingleTest(provider, prompt, suite.options)
          .then(result => {
            results.tests.push(result);
            return result;
          })
          .catch(error => {
            results.errors++;
            results.tests.push({
              error: error.message,
              timestamp: Date.now()
            });
            return null;
          });

        batchPromises.push(promise);
      }

      await Promise.all(batchPromises);
    }

    // Calculate metrics for this concurrency level
    results.metrics = this.calculateMetrics(results.tests, suite);

    return results;
  }

  async executeSingleTest(provider, prompt, options, isWarmup = false) {
    const startTime = performance.now();
    const startTimestamp = Date.now();

    try {
      let result;
      let firstTokenTime = null;
      let tokenCount = 0;

      if (options.stream) {
        // Streaming test
        result = await provider.streamChat(
          [{ role: 'user', content: prompt }],
          options,
          (chunk) => {
            if (firstTokenTime === null) {
              firstTokenTime = performance.now();
            }
            tokenCount += chunk.length / 4; // Rough token estimation
          }
        );
      } else {
        // Non-streaming test
        result = await provider.chat([{ role: 'user', content: prompt }], options);
        tokenCount = result.usage?.totalTokens || result.content.length / 4;
      }

      const endTime = performance.now();
      const latency = endTime - startTime;

      const testResult = {
        prompt: isWarmup ? '[warmup]' : prompt.substring(0, 50) + '...',
        latency,
        tokenCount,
        tokensPerSecond: tokenCount / (latency / 1000),
        startTimestamp,
        endTimestamp: Date.now(),
        success: true
      };

      if (options.stream && firstTokenTime) {
        testResult.timeToFirstToken = firstTokenTime - startTime;
      }

      if (result.usage) {
        testResult.usage = result.usage;
      }

      return testResult;
    } catch (error) {
      const endTime = performance.now();

      return {
        prompt: isWarmup ? '[warmup]' : prompt.substring(0, 50) + '...',
        latency: endTime - startTime,
        error: error.message,
        startTimestamp,
        endTimestamp: Date.now(),
        success: false
      };
    }
  }

  calculateMetrics(tests, suite) {
    const successfulTests = tests.filter(t => t.success && !t.error);

    if (successfulTests.length === 0) {
      return {
        success_rate: 0,
        average_latency: 0,
        median_latency: 0,
        p95_latency: 0,
        average_tokens_per_second: 0,
        total_tokens: 0
      };
    }

    const latencies = successfulTests.map(t => t.latency).sort((a, b) => a - b);
    const tokensPerSecond = successfulTests.map(t => t.tokensPerSecond).filter(t => t > 0);
    const totalTokens = successfulTests.reduce((sum, t) => sum + (t.tokenCount || 0), 0);

    const metrics = {
      success_rate: successfulTests.length / tests.length,
      total_tests: tests.length,
      successful_tests: successfulTests.length,
      failed_tests: tests.length - successfulTests.length,
      average_latency: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
      median_latency: latencies[Math.floor(latencies.length / 2)],
      p95_latency: latencies[Math.floor(latencies.length * 0.95)],
      min_latency: Math.min(...latencies),
      max_latency: Math.max(...latencies),
      total_tokens: totalTokens,
      average_tokens_per_second: tokensPerSecond.length > 0
        ? tokensPerSecond.reduce((sum, t) => sum + t, 0) / tokensPerSecond.length
        : 0
    };

    // Add streaming-specific metrics
    const streamingTests = successfulTests.filter(t => t.timeToFirstToken);
    if (streamingTests.length > 0) {
      const ttfts = streamingTests.map(t => t.timeToFirstToken);
      metrics.average_time_to_first_token = ttfts.reduce((sum, t) => sum + t, 0) / ttfts.length;
      metrics.median_time_to_first_token = ttfts.sort((a, b) => a - b)[Math.floor(ttfts.length / 2)];
    }

    return metrics;
  }

  calculateSummary(results, suite) {
    const allMetrics = Object.values(results).map(r => r.metrics);

    const summary = {
      overall_success_rate: allMetrics.reduce((sum, m) => sum + m.success_rate, 0) / allMetrics.length,
      best_latency: Math.min(...allMetrics.map(m => m.average_latency)),
      worst_latency: Math.max(...allMetrics.map(m => m.average_latency)),
      peak_throughput: Math.max(...allMetrics.map(m => m.average_tokens_per_second)),
      total_tokens_processed: allMetrics.reduce((sum, m) => sum + m.total_tokens, 0),
      scalability_score: this.calculateScalabilityScore(allMetrics),
      reliability_score: allMetrics.reduce((sum, m) => sum + m.success_rate, 0) / allMetrics.length
    };

    // Add cost estimation if pricing is available
    summary.estimated_cost = this.estimateCost(summary.total_tokens_processed);

    return summary;
  }

  calculateScalabilityScore(metrics) {
    // Score based on how well performance scales with concurrency
    const latencyIncrease = metrics[metrics.length - 1].average_latency / metrics[0].average_latency;
    const throughputIncrease = metrics[metrics.length - 1].average_tokens_per_second / metrics[0].average_tokens_per_second;

    // Perfect scaling would maintain latency and increase throughput proportionally
    const idealThroughputIncrease = this.concurrencyLevels[this.concurrencyLevels.length - 1] / this.concurrencyLevels[0];

    const scalabilityScore = Math.max(0, 100 - (latencyIncrease - 1) * 50 - Math.abs(throughputIncrease - idealThroughputIncrease) * 20);

    return Math.round(scalabilityScore);
  }

  estimateCost(totalTokens) {
    // Rough cost estimation (would need actual provider pricing)
    const avgCostPer1KTokens = 0.002; // $0.002 per 1K tokens average
    return (totalTokens / 1000) * avgCostPer1KTokens;
  }

  async runFullBenchmarkSuite(providerName, options = {}) {
    const suites = options.suites || Array.from(this.testSuites.keys());
    const results = {
      provider: providerName,
      timestamp: new Date().toISOString(),
      suites: {},
      overall: {}
    };

    this.emit('full-benchmark-started', { provider: providerName, suites });

    for (const suiteName of suites) {
      try {
        const suiteResult = await this.runBenchmark(providerName, suiteName, options);
        results.suites[suiteName] = suiteResult;
      } catch (error) {
        results.suites[suiteName] = {
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Calculate overall performance score
    results.overall = this.calculateOverallScore(results.suites);

    this.emit('full-benchmark-completed', { provider: providerName, results });

    return results;
  }

  calculateOverallScore(suiteResults) {
    const validSuites = Object.values(suiteResults).filter(r => !r.error && r.summary);

    if (validSuites.length === 0) {
      return { score: 0, grade: 'F' };
    }

    const metrics = {
      averageLatency: validSuites.reduce((sum, s) => sum + s.summary.best_latency, 0) / validSuites.length,
      averageReliability: validSuites.reduce((sum, s) => sum + s.summary.reliability_score, 0) / validSuites.length,
      averageScalability: validSuites.reduce((sum, s) => sum + s.summary.scalability_score, 0) / validSuites.length,
      peakThroughput: Math.max(...validSuites.map(s => s.summary.peak_throughput)),
      totalCost: validSuites.reduce((sum, s) => sum + s.summary.estimated_cost, 0)
    };

    // Calculate composite score (0-100)
    const latencyScore = Math.max(0, 100 - metrics.averageLatency / 10); // Penalize high latency
    const reliabilityScore = metrics.averageReliability * 100;
    const scalabilityScore = metrics.averageScalability;
    const throughputScore = Math.min(100, metrics.peakThroughput / 10); // Cap at 100

    const overallScore = (latencyScore * 0.3 + reliabilityScore * 0.3 + scalabilityScore * 0.2 + throughputScore * 0.2);

    const grade = this.getGrade(overallScore);

    return {
      score: Math.round(overallScore),
      grade,
      metrics,
      breakdown: {
        latency: Math.round(latencyScore),
        reliability: Math.round(reliabilityScore),
        scalability: Math.round(scalabilityScore),
        throughput: Math.round(throughputScore)
      }
    };
  }

  getGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'A-';
    if (score >= 75) return 'B+';
    if (score >= 70) return 'B';
    if (score >= 65) return 'B-';
    if (score >= 60) return 'C+';
    if (score >= 55) return 'C';
    if (score >= 50) return 'C-';
    if (score >= 45) return 'D+';
    if (score >= 40) return 'D';
    return 'F';
  }

  async compareProviders(providerNames, testSuite, options = {}) {
    const comparisons = {};

    for (const providerName of providerNames) {
      try {
        comparisons[providerName] = await this.runBenchmark(providerName, testSuite, options);
      } catch (error) {
        comparisons[providerName] = {
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Generate comparison report
    const report = this.generateComparisonReport(comparisons, testSuite);

    this.emit('comparison-completed', { providers: providerNames, testSuite, report });

    return report;
  }

  generateComparisonReport(comparisons, testSuite) {
    const validResults = Object.entries(comparisons).filter(([_, result]) => !result.error);

    if (validResults.length === 0) {
      return { error: 'No valid benchmark results to compare' };
    }

    const report = {
      testSuite,
      timestamp: new Date().toISOString(),
      providers: validResults.length,
      rankings: {},
      summary: {}
    };

    // Rank by different metrics
    const metrics = ['average_latency', 'average_tokens_per_second', 'success_rate', 'scalability_score'];

    for (const metric of metrics) {
      const sorted = validResults
        .map(([name, result]) => ({
          provider: name,
          value: result.summary[metric] || 0
        }))
        .sort((a, b) => {
          // For latency, lower is better; for others, higher is better
          return metric === 'average_latency' ? a.value - b.value : b.value - a.value;
        });

      report.rankings[metric] = sorted;
    }

    // Overall winner
    const overallScores = validResults.map(([name, result]) => {
      const latencyScore = 100 - (result.summary.average_latency || 1000) / 10;
      const throughputScore = Math.min(100, (result.summary.average_tokens_per_second || 0) / 10);
      const reliabilityScore = (result.summary.reliability_score || 0) * 100;
      const scalabilityScore = result.summary.scalability_score || 0;

      const overall = (latencyScore * 0.3 + throughputScore * 0.3 + reliabilityScore * 0.2 + scalabilityScore * 0.2);

      return { provider: name, score: overall };
    }).sort((a, b) => b.score - a.score);

    report.rankings.overall = overallScores;
    report.winner = overallScores[0]?.provider;

    return report;
  }

  getResults(providerName, testSuite) {
    return this.benchmarkResults.get(providerName)?.get(testSuite);
  }

  getAllResults(providerName) {
    return this.benchmarkResults.get(providerName);
  }

  exportResults(format = 'json') {
    const data = {};

    for (const [provider, results] of this.benchmarkResults) {
      data[provider] = {};
      for (const [suite, result] of results) {
        data[provider][suite] = result;
      }
    }

    if (format === 'csv') {
      return this.convertToCSV(data);
    }

    return JSON.stringify(data, null, 2);
  }

  convertToCSV(data) {
    const rows = [];
    const headers = ['Provider', 'Test Suite', 'Concurrency', 'Avg Latency', 'Tokens/Sec', 'Success Rate', 'Total Tokens'];

    rows.push(headers.join(','));

    for (const [provider, suites] of Object.entries(data)) {
      for (const [suiteName, suite] of Object.entries(suites)) {
        if (suite.results) {
          for (const [concurrency, result] of Object.entries(suite.results)) {
            const row = [
              provider,
              suiteName,
              concurrency.replace('concurrency_', ''),
              result.metrics.average_latency?.toFixed(2) || 0,
              result.metrics.average_tokens_per_second?.toFixed(2) || 0,
              (result.metrics.success_rate * 100)?.toFixed(1) || 0,
              result.metrics.total_tokens || 0
            ];
            rows.push(row.join(','));
          }
        }
      }
    }

    return rows.join('\n');
  }

  clearResults(providerName, testSuite) {
    if (testSuite) {
      this.benchmarkResults.get(providerName)?.delete(testSuite);
    } else {
      this.benchmarkResults.delete(providerName);
    }
  }

  getAvailableTestSuites() {
    return Array.from(this.testSuites.entries()).map(([name, suite]) => ({
      name,
      description: suite.description,
      prompts: suite.prompts.length,
      metrics: suite.metrics
    }));
  }

  getProviderList() {
    return Array.from(this.providers.keys());
  }
}

module.exports = { ProviderBenchmarker };