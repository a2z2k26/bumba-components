const { EventEmitter } = require('events');
const { performance } = require('perf_hooks');

class AIPerformanceOptimizer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enableCaching: options.enableCaching ?? true,
      enableCompression: options.enableCompression ?? true,
      enableBatching: options.enableBatching ?? true,
      enablePrediction: options.enablePrediction ?? true,
      enableLoadBalancing: options.enableLoadBalancing ?? true,
      cacheSize: options.cacheSize || 1000,
      compressionThreshold: options.compressionThreshold || 1000,
      batchSize: options.batchSize || 10,
      batchTimeout: options.batchTimeout || 100,
      predictionWindow: options.predictionWindow || 300000, // 5 minutes
      ...options
    };

    // Performance metrics
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        cached: 0,
        batched: 0
      },
      latency: {
        min: Infinity,
        max: 0,
        avg: 0,
        p95: 0,
        p99: 0,
        history: []
      },
      throughput: {
        current: 0,
        peak: 0,
        average: 0,
        history: []
      },
      tokenUsage: {
        totalTokens: 0,
        avgTokensPerRequest: 0,
        costSaved: 0,
        history: []
      },
      cachePerformance: {
        hitRate: 0,
        hits: 0,
        misses: 0,
        evictions: 0
      }
    };

    // Optimization components
    this.cache = new Map();
    this.compressionCache = new Map();
    this.batchQueue = [];
    this.batchTimer = null;
    this.loadBalancer = null;
    this.predictor = null;

    // Provider performance tracking
    this.providerMetrics = new Map();
    this.providerLoadHistory = new Map();

    this.initializeOptimizations();
  }

  initializeOptimizations() {
    if (this.options.enableCaching) {
      this.initializeIntelligentCaching();
    }

    if (this.options.enableCompression) {
      this.initializeCompression();
    }

    if (this.options.enableBatching) {
      this.initializeBatching();
    }

    if (this.options.enablePrediction) {
      this.initializePredictiveOptimization();
    }

    if (this.options.enableLoadBalancing) {
      this.initializeLoadBalancing();
    }

    // Start performance monitoring
    this.startPerformanceMonitoring();
  }

  initializeIntelligentCaching() {
    // Smart cache with TTL and usage-based eviction
    this.cache.set('store', new Map());
    this.cache.set('metadata', new Map());
    this.cache.set('accessPattern', new Map());

    // Cache strategies
    this.cache.set('strategies', {
      // LRU with smart eviction
      lruEvict: (maxSize) => {
        const store = this.cache.get('store');
        const metadata = this.cache.get('metadata');

        if (store.size <= maxSize) return;

        const entries = Array.from(metadata.entries())
          .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)
          .slice(0, store.size - maxSize);

        for (const [key] of entries) {
          store.delete(key);
          metadata.delete(key);
          this.metrics.cachePerformance.evictions++;
        }
      },

      // Frequency-based eviction
      frequencyEvict: (maxSize) => {
        const store = this.cache.get('store');
        const metadata = this.cache.get('metadata');

        if (store.size <= maxSize) return;

        const entries = Array.from(metadata.entries())
          .sort((a, b) => a[1].accessCount - b[1].accessCount)
          .slice(0, store.size - maxSize);

        for (const [key] of entries) {
          store.delete(key);
          metadata.delete(key);
          this.metrics.cachePerformance.evictions++;
        }
      },

      // Hybrid strategy (LRU + frequency)
      hybridEvict: (maxSize) => {
        const store = this.cache.get('store');
        const metadata = this.cache.get('metadata');

        if (store.size <= maxSize) return;

        const entries = Array.from(metadata.entries())
          .map(([key, meta]) => {
            const score = meta.accessCount * 0.7 + (Date.now() - meta.lastAccessed) * 0.3;
            return [key, score];
          })
          .sort((a, b) => a[1] - b[1])
          .slice(0, store.size - maxSize);

        for (const [key] of entries) {
          store.delete(key);
          metadata.delete(key);
          this.metrics.cachePerformance.evictions++;
        }
      }
    });
  }

  initializeCompression() {
    // Compression strategies for different content types
    this.compressionStrategies = {
      // Text compression
      text: (content) => {
        if (content.length < this.options.compressionThreshold) return content;

        // Simple text compression (remove extra whitespace, abbreviate common words)
        return content
          .replace(/\s+/g, ' ')
          .replace(/\b(the|and|or|but|in|on|at|to|for|of|with|by)\b/gi, (match) => {
            const abbrev = {
              'the': 'th', 'and': '&', 'or': '|', 'but': 'bt',
              'in': 'n', 'on': 'o', 'at': '@', 'to': '2',
              'for': '4', 'of': 'o', 'with': 'w/', 'by': 'b'
            };
            return abbrev[match.toLowerCase()] || match;
          })
          .trim();
      },

      // Code compression
      code: (content) => {
        if (content.length < this.options.compressionThreshold) return content;

        return content
          .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
          .replace(/\/\/.*$/gm, '') // Remove line comments
          .replace(/\s*\n\s*/g, '\n') // Remove extra whitespace
          .replace(/\s*{\s*/g, '{')
          .replace(/\s*}\s*/g, '}')
          .replace(/\s*;\s*/g, ';')
          .trim();
      },

      // JSON compression
      json: (content) => {
        try {
          const parsed = JSON.parse(content);
          return JSON.stringify(parsed); // Remove formatting
        } catch {
          return content;
        }
      }
    };
  }

  initializeBatching() {
    // Request batching for efficiency
    this.batchProcessor = {
      queue: [],
      processing: false,

      add: (request) => {
        this.batchProcessor.queue.push({
          ...request,
          timestamp: Date.now(),
          id: this.generateRequestId()
        });

        if (this.batchProcessor.queue.length >= this.options.batchSize) {
          this.processBatch();
        } else if (!this.batchTimer) {
          this.batchTimer = setTimeout(() => {
            this.processBatch();
          }, this.options.batchTimeout);
        }
      },

      process: async () => {
        if (this.batchProcessor.processing || this.batchProcessor.queue.length === 0) {
          return;
        }

        this.batchProcessor.processing = true;
        const batch = this.batchProcessor.queue.splice(0, this.options.batchSize);

        try {
          await this.processBatchRequests(batch);
          this.metrics.requests.batched += batch.length;
        } catch (error) {
          this.emit('batch-error', { batch, error });
        } finally {
          this.batchProcessor.processing = false;

          if (this.batchProcessor.queue.length > 0) {
            setImmediate(() => this.batchProcessor.process());
          }
        }
      }
    };
  }

  initializePredictiveOptimization() {
    // Predictive model for request patterns
    this.predictor = {
      patterns: new Map(),
      predictions: new Map(),

      learn: (request, response, metadata) => {
        const hour = new Date().getHours();
        const dayOfWeek = new Date().getDay();
        const pattern = `${hour}-${dayOfWeek}`;

        if (!this.predictor.patterns.has(pattern)) {
          this.predictor.patterns.set(pattern, {
            requests: 0,
            totalLatency: 0,
            avgLatency: 0,
            commonTypes: new Map(),
            popularProviders: new Map()
          });
        }

        const patternData = this.predictor.patterns.get(pattern);
        patternData.requests++;
        patternData.totalLatency += metadata.latency || 0;
        patternData.avgLatency = patternData.totalLatency / patternData.requests;

        // Track request types
        const requestType = request.type || 'general';
        patternData.commonTypes.set(requestType, (patternData.commonTypes.get(requestType) || 0) + 1);

        // Track provider usage
        const provider = request.provider || 'default';
        patternData.popularProviders.set(provider, (patternData.popularProviders.get(provider) || 0) + 1);
      },

      predict: () => {
        const hour = new Date().getHours();
        const dayOfWeek = new Date().getDay();
        const pattern = `${hour}-${dayOfWeek}`;

        const patternData = this.predictor.patterns.get(pattern);
        if (!patternData) return null;

        // Predict next hour's load
        const nextHour = (hour + 1) % 24;
        const nextPattern = `${nextHour}-${dayOfWeek}`;
        const nextPatternData = this.predictor.patterns.get(nextPattern);

        return {
          currentLoad: patternData.requests,
          predictedLoad: nextPatternData?.requests || patternData.requests,
          avgLatency: patternData.avgLatency,
          recommendedProvider: this.getMostPopularProvider(patternData.popularProviders),
          confidence: Math.min(patternData.requests / 100, 1) // Max confidence at 100 requests
        };
      },

      getMostPopularProvider: (providers) => {
        let maxCount = 0;
        let popularProvider = null;

        for (const [provider, count] of providers) {
          if (count > maxCount) {
            maxCount = count;
            popularProvider = provider;
          }
        }

        return popularProvider;
      }
    };
  }

  initializeLoadBalancing() {
    // Intelligent load balancing across providers
    this.loadBalancer = {
      providers: new Map(),
      weights: new Map(),
      currentLoads: new Map(),

      addProvider: (name, config) => {
        this.loadBalancer.providers.set(name, config);
        this.loadBalancer.weights.set(name, config.weight || 1);
        this.loadBalancer.currentLoads.set(name, 0);
        this.providerMetrics.set(name, {
          requests: 0,
          latency: [],
          errors: 0,
          successRate: 1,
          lastUsed: 0
        });
      },

      selectProvider: (requestType) => {
        const availableProviders = Array.from(this.loadBalancer.providers.keys())
          .filter(name => {
            const config = this.loadBalancer.providers.get(name);
            return config.enabled !== false && (config.types || []).includes(requestType);
          });

        if (availableProviders.length === 0) return null;

        // Weighted round-robin with performance adjustments
        let bestProvider = null;
        let bestScore = -Infinity;

        for (const provider of availableProviders) {
          const metrics = this.providerMetrics.get(provider);
          const weight = this.loadBalancer.weights.get(provider);
          const load = this.loadBalancer.currentLoads.get(provider);

          // Calculate score based on weight, success rate, latency, and current load
          const avgLatency = metrics.latency.length > 0
            ? metrics.latency.reduce((sum, l) => sum + l, 0) / metrics.latency.length
            : 1000;

          const score = (weight * metrics.successRate * 1000) / (avgLatency * (load + 1));

          if (score > bestScore) {
            bestScore = score;
            bestProvider = provider;
          }
        }

        if (bestProvider) {
          const currentLoad = this.loadBalancer.currentLoads.get(bestProvider) || 0;
          this.loadBalancer.currentLoads.set(bestProvider, currentLoad + 1);
        }

        return bestProvider;
      },

      recordRequest: (provider, latency, success) => {
        const metrics = this.providerMetrics.get(provider);
        if (!metrics) return;

        metrics.requests++;
        metrics.latency.push(latency);
        metrics.lastUsed = Date.now();

        if (!success) {
          metrics.errors++;
        }

        metrics.successRate = (metrics.requests - metrics.errors) / metrics.requests;

        // Keep only last 100 latency measurements
        if (metrics.latency.length > 100) {
          metrics.latency.splice(0, metrics.latency.length - 100);
        }

        // Decrease current load
        const currentLoad = this.loadBalancer.currentLoads.get(provider) || 0;
        this.loadBalancer.currentLoads.set(provider, Math.max(0, currentLoad - 1));
      }
    };
  }

  startPerformanceMonitoring() {
    // Monitor performance metrics every 30 seconds
    setInterval(() => {
      this.updateMetrics();
      this.optimizePerformance();
      this.emit('metrics-updated', this.getMetrics());
    }, 30000);

    // Update throughput every second
    setInterval(() => {
      this.updateThroughputMetrics();
    }, 1000);
  }

  async optimizeRequest(request, options = {}) {
    const startTime = performance.now();
    let result = null;
    let cached = false;

    try {
      // Check cache first
      if (this.options.enableCaching) {
        result = this.getCached(request);
        if (result) {
          cached = true;
          this.metrics.requests.cached++;
          this.metrics.cachePerformance.hits++;
        } else {
          this.metrics.cachePerformance.misses++;
        }
      }

      if (!result) {
        // Apply compression if needed
        if (this.options.enableCompression && request.content) {
          request = this.compressRequest(request);
        }

        // Select optimal provider
        if (this.options.enableLoadBalancing && this.loadBalancer) {
          const optimalProvider = this.loadBalancer.selectProvider(request.type);
          if (optimalProvider) {
            request.provider = optimalProvider;
          }
        }

        // Process request (this would integrate with actual AI providers)
        result = await this.processOptimizedRequest(request, options);

        // Cache the result
        if (this.options.enableCaching && result && !result.error) {
          this.setCached(request, result);
        }
      }

      const endTime = performance.now();
      const latency = endTime - startTime;

      // Record metrics
      this.recordRequestMetrics(request, result, {
        latency,
        cached,
        success: !result.error
      });

      // Learn from this request for future predictions
      if (this.predictor) {
        this.predictor.learn(request, result, { latency, cached });
      }

      this.metrics.requests.total++;
      if (result.error) {
        this.metrics.requests.failed++;
      } else {
        this.metrics.requests.successful++;
      }

      return {
        ...result,
        metadata: {
          ...result.metadata,
          optimized: true,
          cached,
          latency,
          provider: request.provider
        }
      };

    } catch (error) {
      this.metrics.requests.failed++;
      this.emit('optimization-error', { request, error });

      return {
        error: error.message,
        metadata: {
          optimized: false,
          error: true
        }
      };
    }
  }

  getCached(request) {
    const cacheKey = this.generateCacheKey(request);
    const store = this.cache.get('store');
    const metadata = this.cache.get('metadata');

    const cached = store.get(cacheKey);
    if (cached) {
      const meta = metadata.get(cacheKey);

      // Check TTL
      if (meta.ttl && Date.now() > meta.expires) {
        store.delete(cacheKey);
        metadata.delete(cacheKey);
        return null;
      }

      // Update access metadata
      meta.accessCount++;
      meta.lastAccessed = Date.now();
      metadata.set(cacheKey, meta);

      return cached;
    }

    return null;
  }

  setCached(request, result) {
    const cacheKey = this.generateCacheKey(request);
    const store = this.cache.get('store');
    const metadata = this.cache.get('metadata');

    // Check cache size and evict if necessary
    if (store.size >= this.options.cacheSize) {
      const strategies = this.cache.get('strategies');
      strategies.hybridEvict(Math.floor(this.options.cacheSize * 0.8));
    }

    const ttl = this.calculateTTL(request, result);

    store.set(cacheKey, result);
    metadata.set(cacheKey, {
      created: Date.now(),
      ttl,
      expires: ttl ? Date.now() + ttl : null,
      accessCount: 1,
      lastAccessed: Date.now(),
      size: JSON.stringify(result).length
    });
  }

  compressRequest(request) {
    if (!request.content || request.content.length < this.options.compressionThreshold) {
      return request;
    }

    const contentType = request.contentType || 'text';
    const compressor = this.compressionStrategies[contentType] || this.compressionStrategies.text;

    const compressed = compressor(request.content);
    const compressionRatio = compressed.length / request.content.length;

    return {
      ...request,
      content: compressed,
      metadata: {
        ...request.metadata,
        compressed: true,
        originalSize: request.content.length,
        compressedSize: compressed.length,
        compressionRatio
      }
    };
  }

  async processOptimizedRequest(request, options) {
    // This would integrate with the actual AI providers
    // For now, simulate processing
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          content: `Processed: ${request.content}`,
          provider: request.provider,
          tokens: Math.floor(request.content?.length / 4) || 10,
          success: true
        });
      }, Math.random() * 100 + 50); // Simulate 50-150ms processing time
    });
  }

  recordRequestMetrics(request, result, metadata) {
    // Update latency metrics
    const latencies = this.metrics.latency.history;
    latencies.push(metadata.latency);

    if (latencies.length > 1000) {
      latencies.splice(0, latencies.length - 1000);
    }

    // Calculate percentiles
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const len = sortedLatencies.length;

    this.metrics.latency.min = Math.min(this.metrics.latency.min, metadata.latency);
    this.metrics.latency.max = Math.max(this.metrics.latency.max, metadata.latency);
    this.metrics.latency.avg = latencies.reduce((sum, l) => sum + l, 0) / len;
    this.metrics.latency.p95 = sortedLatencies[Math.floor(len * 0.95)] || 0;
    this.metrics.latency.p99 = sortedLatencies[Math.floor(len * 0.99)] || 0;

    // Update provider metrics
    if (request.provider && this.loadBalancer) {
      this.loadBalancer.recordRequest(request.provider, metadata.latency, metadata.success);
    }

    // Update token usage
    if (result.tokens) {
      this.metrics.tokenUsage.totalTokens += result.tokens;
      this.metrics.tokenUsage.avgTokensPerRequest =
        this.metrics.tokenUsage.totalTokens / this.metrics.requests.total;
    }
  }

  updateMetrics() {
    // Update cache hit rate
    const totalCacheRequests = this.metrics.cachePerformance.hits + this.metrics.cachePerformance.misses;
    if (totalCacheRequests > 0) {
      this.metrics.cachePerformance.hitRate = this.metrics.cachePerformance.hits / totalCacheRequests;
    }
  }

  updateThroughputMetrics() {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    // Calculate current throughput (requests per minute)
    this.metrics.throughput.current = this.metrics.requests.total; // Simplified
    this.metrics.throughput.peak = Math.max(this.metrics.throughput.peak, this.metrics.throughput.current);
  }

  optimizePerformance() {
    // Adaptive optimization based on current metrics
    if (this.metrics.cachePerformance.hitRate < 0.3) {
      // Low cache hit rate - increase cache size
      this.options.cacheSize = Math.min(this.options.cacheSize * 1.1, 5000);
      this.emit('optimization-applied', { type: 'cache-size-increase', newSize: this.options.cacheSize });
    }

    if (this.metrics.latency.p95 > 2000) {
      // High latency - reduce batch timeout
      this.options.batchTimeout = Math.max(this.options.batchTimeout * 0.9, 50);
      this.emit('optimization-applied', { type: 'batch-timeout-decrease', newTimeout: this.options.batchTimeout });
    }
  }

  generateCacheKey(request) {
    const keyData = {
      content: request.content,
      type: request.type,
      provider: request.provider,
      options: request.options
    };

    return Buffer.from(JSON.stringify(keyData)).toString('base64').substring(0, 32);
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  calculateTTL(request, result) {
    // Adaptive TTL based on content type and result
    if (request.type === 'static') return 3600000; // 1 hour for static content
    if (request.type === 'completion') return 1800000; // 30 minutes for completions
    if (result.tokens && result.tokens > 1000) return 600000; // 10 minutes for large responses

    return 300000; // 5 minutes default
  }

  // Public API methods
  getMetrics() {
    return {
      ...this.metrics,
      uptime: process.uptime(),
      timestamp: Date.now()
    };
  }

  getProviderMetrics() {
    const metrics = {};
    for (const [provider, data] of this.providerMetrics) {
      metrics[provider] = { ...data };
    }
    return metrics;
  }

  clearCache() {
    this.cache.get('store').clear();
    this.cache.get('metadata').clear();
    this.metrics.cachePerformance = {
      hitRate: 0,
      hits: 0,
      misses: 0,
      evictions: 0
    };
    this.emit('cache-cleared');
  }

  addProvider(name, config) {
    if (this.loadBalancer) {
      this.loadBalancer.addProvider(name, config);
      this.emit('provider-added', { name, config });
    }
  }

  removeProvider(name) {
    if (this.loadBalancer) {
      this.loadBalancer.providers.delete(name);
      this.loadBalancer.weights.delete(name);
      this.loadBalancer.currentLoads.delete(name);
      this.providerMetrics.delete(name);
      this.emit('provider-removed', { name });
    }
  }

  getPredictions() {
    return this.predictor ? this.predictor.predict() : null;
  }

  // Cleanup
  cleanup() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.removeAllListeners();
    this.clearCache();
    this.emit('cleanup');
  }
}

module.exports = { AIPerformanceOptimizer };