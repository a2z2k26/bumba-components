const { EventEmitter } = require('events');
const crypto = require('crypto');

class ResponseProcessor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enableCaching: options.enableCaching ?? true,
      enableFiltering: options.enableFiltering ?? true,
      enableValidation: options.enableValidation ?? true,
      enableOptimization: options.enableOptimization ?? true,
      cacheDirectory: options.cacheDirectory || './.bumba-cache/responses',
      cacheTTL: options.cacheTTL || 3600000, // 1 hour
      maxCacheSize: options.maxCacheSize || 1000,
      compressionLevel: options.compressionLevel || 6,
      streamBufferSize: options.streamBufferSize || 1024,
      enableProfanityFilter: options.enableProfanityFilter ?? true,
      enableSafetyFilter: options.enableSafetyFilter ?? true,
      maxResponseLength: options.maxResponseLength || 50000,
      ...options
    };

    this.cache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      size: 0,
      evictions: 0
    };

    this.filterRules = new Map();
    this.validators = new Map();
    this.optimizers = new Map();
    this.processors = new Map();

    this.initializeComponents();
  }

  initializeComponents() {
    this.initializeFilters();
    this.initializeValidators();
    this.initializeOptimizers();
    this.initializeProcessors();
  }

  initializeFilters() {
    // Content safety filter
    this.filterRules.set('safety', {
      patterns: [
        /\b(harmful|dangerous|illegal|violence|weapon|drug)\b/gi,
        /\b(hate speech|discrimination|harassment)\b/gi,
        /\b(sexual|explicit|inappropriate)\b/gi
      ],
      action: 'flag',
      severity: 'high'
    });

    // Profanity filter
    this.filterRules.set('profanity', {
      patterns: [
        /\b(fuck|shit|damn|hell|bastard|bitch)\b/gi,
        /\b(asshole|idiot|stupid|moron)\b/gi
      ],
      action: 'censor',
      replacement: '[REDACTED]',
      severity: 'medium'
    });

    // PII filter
    this.filterRules.set('pii', {
      patterns: [
        /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
        /\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/g // Phone
      ],
      action: 'redact',
      replacement: '[REDACTED]',
      severity: 'critical'
    });

    // Code injection filter
    this.filterRules.set('injection', {
      patterns: [
        /<script[^>]*>.*?<\/script>/gi,
        /javascript:/gi,
        /eval\s*\(/gi,
        /exec\s*\(/gi,
        /system\s*\(/gi
      ],
      action: 'block',
      severity: 'critical'
    });
  }

  initializeValidators() {
    // JSON validator
    this.validators.set('json', (content) => {
      try {
        JSON.parse(content);
        return { valid: true };
      } catch (error) {
        return { valid: false, error: 'Invalid JSON format' };
      }
    });

    // Code validator
    this.validators.set('code', (content, language = 'javascript') => {
      const codePatterns = {
        javascript: /^[\s\S]*$/,
        python: /^[\s\S]*$/,
        sql: /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)[\s\S]*$/i
      };

      const pattern = codePatterns[language] || codePatterns.javascript;
      const valid = pattern.test(content);

      return {
        valid,
        language,
        error: valid ? null : `Invalid ${language} code format`
      };
    });

    // Length validator
    this.validators.set('length', (content, options = {}) => {
      const minLength = options.min || 0;
      const maxLength = options.max || this.options.maxResponseLength;
      const length = content.length;

      return {
        valid: length >= minLength && length <= maxLength,
        length,
        minLength,
        maxLength,
        error: length < minLength ? 'Content too short' :
               length > maxLength ? 'Content too long' : null
      };
    });

    // Format validator
    this.validators.set('format', (content, format) => {
      const formatPatterns = {
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        url: /^https?:\/\/[^\s$.?#].[^\s]*$/,
        markdown: /^[\s\S]*$/,
        html: /^<[^>]+>[\s\S]*<\/[^>]+>$/
      };

      const pattern = formatPatterns[format];
      if (!pattern) {
        return { valid: false, error: `Unknown format: ${format}` };
      }

      return {
        valid: pattern.test(content),
        format,
        error: null
      };
    });
  }

  initializeOptimizers() {
    // Whitespace optimizer
    this.optimizers.set('whitespace', (content) => {
      return content
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    });

    // Markdown optimizer
    this.optimizers.set('markdown', (content) => {
      return content
        .replace(/#{4,}/g, '###') // Limit heading depth
        .replace(/\*{3,}/g, '**') // Limit emphasis
        .replace(/_{3,}/g, '__') // Limit emphasis
        .replace(/`{4,}/g, '```'); // Limit code blocks
    });

    // Code optimizer
    this.optimizers.set('code', (content, language = 'javascript') => {
      if (language === 'javascript') {
        return content
          .replace(/;\s*;/g, ';')
          .replace(/\{\s*\}/g, '{}')
          .replace(/\[\s*\]/g, '[]');
      }
      return content;
    });

    // Token optimizer
    this.optimizers.set('tokens', (content) => {
      // Rough token optimization
      return content
        .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\s+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    });
  }

  initializeProcessors() {
    // Stream processor
    this.processors.set('stream', {
      process: (chunk, metadata = {}) => {
        return {
          content: chunk,
          tokens: this.estimateTokens(chunk),
          timestamp: Date.now(),
          ...metadata
        };
      },
      aggregate: (chunks) => {
        return {
          content: chunks.map(c => c.content).join(''),
          totalTokens: chunks.reduce((sum, c) => sum + c.tokens, 0),
          chunkCount: chunks.length,
          duration: chunks[chunks.length - 1]?.timestamp - chunks[0]?.timestamp
        };
      }
    });

    // Batch processor
    this.processors.set('batch', {
      process: (responses) => {
        return responses.map(response => this.processResponse(response));
      }
    });

    // Chain processor
    this.processors.set('chain', {
      process: (response, processors) => {
        return processors.reduce((result, processor) => {
          return this.applyProcessor(result, processor);
        }, response);
      }
    });
  }

  async processResponse(response, options = {}) {
    const startTime = Date.now();
    let processedResponse = { ...response };

    try {
      // Check cache first
      if (this.options.enableCaching && !options.skipCache) {
        const cached = await this.getCachedResponse(response);
        if (cached) {
          this.emit('cache-hit', { response, cached });
          return cached;
        }
      }

      // Validate response
      if (this.options.enableValidation) {
        const validationResult = await this.validateResponse(processedResponse, options);
        if (!validationResult.valid) {
          this.emit('validation-failed', { response: processedResponse, errors: validationResult.errors });
          return this.createErrorResponse('validation-failed', validationResult.errors);
        }
        processedResponse.validation = validationResult;
      }

      // Filter response
      if (this.options.enableFiltering) {
        const filterResult = await this.filterResponse(processedResponse, options);
        processedResponse = { ...processedResponse, ...filterResult };

        if (filterResult.blocked) {
          this.emit('response-blocked', { response: processedResponse, reason: filterResult.reason });
          return this.createErrorResponse('content-blocked', filterResult.reason);
        }
      }

      // Optimize response
      if (this.options.enableOptimization) {
        const optimized = await this.optimizeResponse(processedResponse, options);
        processedResponse = { ...processedResponse, ...optimized };
      }

      // Add metadata
      processedResponse.metadata = {
        ...processedResponse.metadata,
        processed: true,
        processingTime: Date.now() - startTime,
        processedAt: new Date().toISOString(),
        version: '1.0'
      };

      // Cache processed response
      if (this.options.enableCaching && !options.skipCache) {
        await this.cacheResponse(response, processedResponse);
      }

      this.emit('response-processed', { original: response, processed: processedResponse });
      return processedResponse;

    } catch (error) {
      this.emit('processing-error', { response, error: error.message });
      return this.createErrorResponse('processing-error', error.message);
    }
  }

  async processStreamChunk(chunk, metadata = {}) {
    const processor = this.processors.get('stream');
    const processed = processor.process(chunk, metadata);

    // Apply filters to chunk
    if (this.options.enableFiltering) {
      const filterResult = await this.filterContent(processed.content);
      if (filterResult.blocked) {
        processed.filtered = true;
        processed.content = filterResult.content || '[CONTENT FILTERED]';
      }
    }

    this.emit('chunk-processed', processed);
    return processed;
  }

  async validateResponse(response, options = {}) {
    const validators = options.validators || ['length'];
    const results = [];

    for (const validatorName of validators) {
      const validator = this.validators.get(validatorName);
      if (validator) {
        try {
          const result = validator(response.content || response.text, options[validatorName]);
          results.push({
            validator: validatorName,
            ...result
          });
        } catch (error) {
          results.push({
            validator: validatorName,
            valid: false,
            error: error.message
          });
        }
      }
    }

    const valid = results.every(r => r.valid);
    const errors = results.filter(r => !r.valid);

    return { valid, results, errors };
  }

  async filterResponse(response, options = {}) {
    const content = response.content || response.text || '';
    const filterResult = await this.filterContent(content, options);

    return {
      content: filterResult.content,
      filtered: filterResult.filtered,
      blocked: filterResult.blocked,
      reason: filterResult.reason,
      flags: filterResult.flags
    };
  }

  async filterContent(content, options = {}) {
    const activeFilters = options.filters || ['safety', 'pii'];
    let filteredContent = content;
    let filtered = false;
    let blocked = false;
    let reason = null;
    const flags = [];

    for (const filterName of activeFilters) {
      const filter = this.filterRules.get(filterName);
      if (!filter) continue;

      for (const pattern of filter.patterns) {
        const matches = content.match(pattern);
        if (matches) {
          flags.push({
            filter: filterName,
            matches: matches.length,
            severity: filter.severity,
            action: filter.action
          });

          switch (filter.action) {
            case 'block':
              blocked = true;
              reason = `Content blocked by ${filterName} filter`;
              break;

            case 'censor':
            case 'redact':
              filteredContent = filteredContent.replace(pattern, filter.replacement || '[REDACTED]');
              filtered = true;
              break;

            case 'flag':
              // Just flag, don't modify content
              break;
          }
        }
      }
    }

    return {
      content: filteredContent,
      filtered,
      blocked,
      reason,
      flags
    };
  }

  async optimizeResponse(response, options = {}) {
    const optimizers = options.optimizers || ['whitespace'];
    let optimizedContent = response.content || response.text || '';

    for (const optimizerName of optimizers) {
      const optimizer = this.optimizers.get(optimizerName);
      if (optimizer) {
        try {
          optimizedContent = optimizer(optimizedContent, options[optimizerName]);
        } catch (error) {
          console.warn(`Optimizer ${optimizerName} failed:`, error.message);
        }
      }
    }

    const originalLength = (response.content || response.text || '').length;
    const optimizedLength = optimizedContent.length;
    const saved = originalLength - optimizedLength;
    const percentage = originalLength > 0 ? (saved / originalLength) * 100 : 0;

    return {
      content: optimizedContent,
      optimization: {
        originalLength,
        optimizedLength,
        saved,
        percentage: Math.round(percentage * 100) / 100
      }
    };
  }

  async getCachedResponse(request) {
    if (!this.options.enableCaching) return null;

    const cacheKey = this.generateCacheKey(request);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      const now = Date.now();
      if (now - cached.timestamp < this.options.cacheTTL) {
        this.cacheStats.hits++;
        cached.metadata = {
          ...cached.metadata,
          fromCache: true,
          cacheHit: true
        };
        return cached;
      } else {
        // Expired
        this.cache.delete(cacheKey);
        this.cacheStats.evictions++;
      }
    }

    this.cacheStats.misses++;
    return null;
  }

  async cacheResponse(request, response) {
    if (!this.options.enableCaching) return;

    const cacheKey = this.generateCacheKey(request);

    // Check cache size limit
    if (this.cache.size >= this.options.maxCacheSize) {
      this.evictOldestEntries(Math.floor(this.options.maxCacheSize * 0.2));
    }

    const cacheEntry = {
      ...response,
      timestamp: Date.now(),
      cacheKey
    };

    this.cache.set(cacheKey, cacheEntry);
    this.cacheStats.size = this.cache.size;

    this.emit('response-cached', { key: cacheKey, response: cacheEntry });
  }

  generateCacheKey(request) {
    const keyData = {
      content: request.content || request.text || '',
      options: request.options || {},
      provider: request.provider
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex')
      .substring(0, 16);
  }

  evictOldestEntries(count) {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, count);

    for (const [key] of entries) {
      this.cache.delete(key);
      this.cacheStats.evictions++;
    }

    this.cacheStats.size = this.cache.size;
  }

  estimateTokens(text) {
    // Rough token estimation (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }

  createErrorResponse(type, message) {
    return {
      success: false,
      error: {
        type,
        message,
        timestamp: new Date().toISOString()
      },
      metadata: {
        processed: true,
        error: true
      }
    };
  }

  // Configuration methods
  addFilter(name, config) {
    this.filterRules.set(name, config);
    this.emit('filter-added', { name, config });
  }

  addValidator(name, validator) {
    this.validators.set(name, validator);
    this.emit('validator-added', { name });
  }

  addOptimizer(name, optimizer) {
    this.optimizers.set(name, optimizer);
    this.emit('optimizer-added', { name });
  }

  // Utility methods
  getCacheStats() {
    return {
      ...this.cacheStats,
      hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses),
      size: this.cache.size
    };
  }

  clearCache() {
    this.cache.clear();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      size: 0,
      evictions: 0
    };
    this.emit('cache-cleared');
  }

  getFilterRules() {
    return Array.from(this.filterRules.keys());
  }

  getValidators() {
    return Array.from(this.validators.keys());
  }

  getOptimizers() {
    return Array.from(this.optimizers.keys());
  }

  // Batch processing
  async processResponses(responses, options = {}) {
    const processor = this.processors.get('batch');
    return processor.process(responses, options);
  }

  // Pipeline processing
  async processWithPipeline(response, pipeline, options = {}) {
    const processor = this.processors.get('chain');
    return processor.process(response, pipeline, options);
  }

  // Statistics
  getProcessingStats() {
    return {
      cache: this.getCacheStats(),
      filters: this.getFilterRules().length,
      validators: this.getValidators().length,
      optimizers: this.getOptimizers().length,
      uptime: process.uptime()
    };
  }

  // Cleanup
  async cleanup() {
    this.clearCache();
    this.removeAllListeners();
    this.emit('cleanup');
  }
}

module.exports = { ResponseProcessor };