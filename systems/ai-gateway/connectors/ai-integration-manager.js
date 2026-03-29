/**
 * AI Integration Manager for BUMBA
 * Sprint 2.3: Unified interface for AI providers only
 *
 * Manages OpenAI, Anthropic, Google AI, and OpenRouter connectors
 * Services (GitHub, Notion, Slack, etc.) are handled by MCP servers
 */

const EventEmitter = require('events');

// Import AI connectors only
const BaseAIConnector = require('./base-connector');
const OpenAIConnector = require('./openai-connector');
const AnthropicConnector = require('./anthropic-connector');
const GoogleAIConnector = require('./google-ai-connector');
const OpenRouterConnector = require('./openrouter-connector');

// Sprint 2.6: Streaming Manager
const { StreamingManager } = require('./streaming-manager');

// Sprint 2.7: Provider Intelligence
const { ProviderIntelligenceEngine } = require('./provider-intelligence');

class AIIntegrationManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = config;
    this.connectors = {};
    this.initialized = false;

    // Sprint 2.6: Initialize Streaming Manager
    this.streamingManager = new StreamingManager({
      enableAggregation: config.enableStreamAggregation !== false,
      enableTokenCounting: config.enableStreamTokenCounting !== false,
      enableProgressTracking: config.enableStreamProgressTracking !== false,
      progressInterval: config.streamProgressInterval || 100,
      maxConcurrentStreams: config.maxConcurrentStreams || 10
    });

    // Forward streaming events
    this.streamingManager.on('stream:start', (data) => this.emit('stream:start', data));
    this.streamingManager.on('stream:chunk', (data) => this.emit('stream:chunk', data));
    this.streamingManager.on('stream:progress', (data) => this.emit('stream:progress', data));
    this.streamingManager.on('stream:complete', (data) => this.emit('stream:complete', data));
    this.streamingManager.on('stream:error', (data) => this.emit('stream:error', data));
    this.streamingManager.on('stream:cancelled', (data) => this.emit('stream:cancelled', data));

    // Sprint 2.7: Initialize Provider Intelligence Engine
    this.intelligenceEngine = new ProviderIntelligenceEngine({
      enablePerformanceTracking: config.enableProviderTracking !== false,
      enableConsensus: config.enableProviderConsensus !== false,
      selectionStrategy: config.providerSelectionStrategy || 'balanced' // balanced, cost, speed, quality, reliability
    });

    // Forward intelligence events
    this.intelligenceEngine.on('provider:selected', (data) => this.emit('provider:selected', data));
    this.intelligenceEngine.on('result:recorded', (data) => this.emit('result:recorded', data));
    this.intelligenceEngine.on('consensus:found', (data) => this.emit('consensus:found', data));
    this.intelligenceEngine.on('stats:reset', (data) => this.emit('stats:reset', data));

    // Track AI usage across all providers
    this.globalUsage = {
      requests: 0,
      errors: 0,
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      byProvider: {}
    };

    // Provider priority for fallback
    this.providerPriority = config.providerPriority || [
      'openrouter', // Default to OpenRouter for unified access
      'anthropic',
      'openai',
      'google'
    ];
  }

  /**
   * Initialize all configured AI providers
   */
  async initialize() {
    if (this.initialized) return;

    // Initialize OpenRouter (unified gateway to 100+ models)
    if (this.config.apiKeys?.openrouter) {
      this.connectors.openrouter = new OpenRouterConnector({
        apiKey: this.config.apiKeys.openrouter,
        baseURL: this.config.openrouterBaseURL,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries
      });
      this.setupConnectorEvents('openrouter');
    }

    // Initialize OpenAI
    if (this.config.apiKeys?.openai) {
      this.connectors.openai = new OpenAIConnector({
        apiKey: this.config.apiKeys.openai,
        organization: this.config.openaiOrganization,
        baseURL: this.config.openaiBaseURL,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries
      });
      this.setupConnectorEvents('openai');
    }

    // Initialize Anthropic
    if (this.config.apiKeys?.anthropic) {
      this.connectors.anthropic = new AnthropicConnector({
        apiKey: this.config.apiKeys.anthropic,
        baseURL: this.config.anthropicBaseURL,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        beta: this.config.anthropicBeta || []
      });
      this.setupConnectorEvents('anthropic');
    }

    // Initialize Google AI
    if (this.config.apiKeys?.google) {
      this.connectors.google = new GoogleAIConnector({
        apiKey: this.config.apiKeys.google,
        baseURL: this.config.googleBaseURL,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries
      });
      this.setupConnectorEvents('google');
    }

    this.initialized = true;
    this.emit('initialized', {
      connectors: Object.keys(this.connectors),
      defaultProvider: this.getDefaultProvider()
    });
  }

  /**
   * Set up event listeners for a connector
   */
  setupConnectorEvents(name) {
    const connector = this.connectors[name];

    if (!connector || !connector.on) return;

    // Usage tracking
    connector.on('usage', (usage) => {
      this.trackUsage(name, usage);
    });

    // Error tracking
    connector.on('error', (error) => {
      this.globalUsage.errors++;
      this.emit('connector:error', { connector: name, error });
    });

    // Request tracking
    connector.on('request', (request) => {
      this.emit('connector:request', { connector: name, request });
    });

    // Rate limit warnings
    connector.on('ratelimit:wait', (event) => {
      this.emit('connector:ratelimit', { connector: name, ...event });
    });
  }

  /**
   * Track usage across providers
   */
  trackUsage(provider, usage) {
    this.globalUsage.requests++;

    if (!this.globalUsage.byProvider[provider]) {
      this.globalUsage.byProvider[provider] = {
        requests: 0,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        errors: 0
      };
    }

    const providerStats = this.globalUsage.byProvider[provider];
    providerStats.requests++;

    if (usage.cost) {
      providerStats.cost += usage.cost;
      this.globalUsage.totalCost += usage.cost;
    }

    if (usage.inputTokens) {
      providerStats.inputTokens += usage.inputTokens;
      this.globalUsage.totalInputTokens += usage.inputTokens;
    }

    if (usage.outputTokens) {
      providerStats.outputTokens += usage.outputTokens;
      this.globalUsage.totalOutputTokens += usage.outputTokens;
    }

    if (usage.totalTokens) {
      providerStats.totalTokens += usage.totalTokens;
    }

    // Sprint 2.7: Record result for intelligence learning
    if (this.intelligenceEngine && usage.latency !== undefined) {
      this.intelligenceEngine.recordResult(provider, {
        success: usage.error ? false : true,
        latency: usage.latency,
        cost: usage.cost || 0,
        tokens: usage.totalTokens || 0,
        model: usage.model || '',
        error: usage.error || null
      });
    }

    this.emit('usage', { provider, usage, global: this.globalUsage });
  }

  // ============================================================================
  // UNIFIED AI INTERFACE
  // ============================================================================

  /**
   * Unified chat interface across all AI providers
   * @param {Array|String} messages - Chat messages or single prompt
   * @param {Object} options - Model, temperature, maxTokens, provider, etc.
   * @returns {Promise<Object>} Unified response
   */
  async chat(messages, options = {}) {
    const provider = options.provider || this.getDefaultProvider();
    const connector = this.connectors[provider];

    if (!connector) {
      throw new Error(`Chat provider ${provider} not available. Available: ${this.getAvailableProviders().join(', ')}`);
    }

    // Use BaseAIConnector's unified chat method
    return connector.chat(messages, options);
  }

  /**
   * Streaming chat interface (Sprint 2.6: Enhanced with unified streaming)
   * @param {Array|String} messages - Chat messages or single prompt
   * @param {Object} options - Model, temperature, maxTokens, provider, etc.
   * @returns {AsyncIterator} Stream of unified response chunks
   */
  async stream(messages, options = {}) {
    const provider = options.provider || this.getDefaultProvider();
    const connector = this.connectors[provider];

    if (!connector) {
      throw new Error(`Stream provider ${provider} not available`);
    }

    // Get raw stream from connector
    const rawStream = await connector.stream(messages, options);

    // Wrap with unified streaming manager
    const unifiedStream = await this.streamingManager.createUnifiedStream(rawStream, {
      provider,
      model: options.model || connector.options?.model || ''
    });

    return unifiedStream;
  }

  /**
   * Create embeddings
   * @param {String|Array} text - Text to embed
   * @param {Object} options - Model, dimensions, provider, etc.
   * @returns {Promise<Object>} Embedding vectors
   */
  async embed(text, options = {}) {
    const provider = options.provider || this.getDefaultEmbeddingProvider();
    const connector = this.connectors[provider];

    if (!connector) {
      throw new Error(`Embedding provider ${provider} not available`);
    }

    return connector.embed(text, options);
  }

  /**
   * Tool/function calling
   * @param {Array} messages - Chat messages
   * @param {Array} tools - Tool definitions
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response with tool calls
   */
  async callTool(messages, tools, options = {}) {
    const provider = options.provider || this.getDefaultProvider();
    const connector = this.connectors[provider];

    if (!connector) {
      throw new Error(`Tool provider ${provider} not available`);
    }

    return connector.callTool(messages, tools, options);
  }

  // ============================================================================
  // STREAMING MANAGEMENT (Sprint 2.6)
  // ============================================================================

  /**
   * Stream with multiple providers simultaneously
   * @param {Array|String} messages - Chat messages
   * @param {Array} providers - List of providers to stream from
   * @param {Object} options - Additional options
   * @returns {AsyncIterator} Multiplexed stream
   */
  async multiProviderStream(messages, providers = [], options = {}) {
    const targetProviders = providers.length > 0
      ? providers
      : this.getAvailableProviders().filter(p => p !== 'openrouter');

    // Create stream configs
    const streamConfigs = await Promise.all(
      targetProviders.map(async (provider) => ({
        provider,
        stream: await this.stream(messages, { ...options, provider })
      }))
    );

    return this.streamingManager.createMultiplexedStream(streamConfigs);
  }

  /**
   * Get active streams
   * @returns {Array} List of active streams
   */
  getActiveStreams() {
    return this.streamingManager.getActiveStreams();
  }

  /**
   * Cancel a specific stream
   * @param {String} streamId - Stream ID
   * @returns {Boolean} Success
   */
  cancelStream(streamId) {
    return this.streamingManager.cancelStream(streamId);
  }

  /**
   * Cancel all active streams
   * @returns {Array} List of cancelled stream IDs
   */
  cancelAllStreams() {
    return this.streamingManager.cancelAllStreams();
  }

  /**
   * Get streaming statistics
   * @returns {Object} Streaming stats
   */
  getStreamingStats() {
    return this.streamingManager.getStats();
  }

  // ============================================================================
  // OPENROUTER SMART ROUTING
  // ============================================================================

  /**
   * Smart routing via OpenRouter (CHEAPEST, FASTEST, BEST, FALLBACK)
   * @param {Array|String} messages - Chat messages
   * @param {String} strategy - CHEAPEST | FASTEST | BEST | FALLBACK
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response from selected model
   */
  async routeToProvider(messages, strategy = 'BEST', options = {}) {
    const openrouter = this.connectors.openrouter;

    if (!openrouter) {
      throw new Error('OpenRouter not available. Configure OPENROUTER_API_KEY to use smart routing.');
    }

    return openrouter.routeToProvider(messages, strategy, options);
  }

  /**
   * Get cheapest model that meets requirements
   * @param {Array|String} messages - Chat messages for token estimation
   * @param {Object} options - Requirements (minContextLength, requiresVision, etc.)
   * @returns {Promise<String>} Model ID
   */
  async getCheapestModel(messages, options = {}) {
    const openrouter = this.connectors.openrouter;

    if (!openrouter) {
      throw new Error('OpenRouter not available');
    }

    return openrouter.getCheapestModel(messages, options);
  }

  /**
   * Get fastest model that meets requirements
   * @param {Object} options - Requirements
   * @returns {Promise<String>} Model ID
   */
  async getFastestModel(options = {}) {
    const openrouter = this.connectors.openrouter;

    if (!openrouter) {
      throw new Error('OpenRouter not available');
    }

    return openrouter.getFastestModel(options);
  }

  /**
   * Get best quality model that meets requirements
   * @param {Object} options - Requirements
   * @returns {Promise<String>} Model ID
   */
  async getBestModel(options = {}) {
    const openrouter = this.connectors.openrouter;

    if (!openrouter) {
      throw new Error('OpenRouter not available');
    }

    return openrouter.getBestModel(options);
  }

  /**
   * Get available models from OpenRouter
   * @returns {Promise<Array>} List of models
   */
  async getAvailableModels() {
    const openrouter = this.connectors.openrouter;

    if (!openrouter) {
      throw new Error('OpenRouter not available');
    }

    return openrouter.getAvailableModels();
  }

  // ============================================================================
  // MULTI-PROVIDER OPERATIONS
  // ============================================================================

  /**
   * Get responses from multiple providers simultaneously
   * @param {Array|String} messages - Chat messages
   * @param {Array} providers - List of providers to query (defaults to all)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Results from all providers
   */
  async multiProviderChat(messages, providers = [], options = {}) {
    const targetProviders = providers.length > 0
      ? providers
      : this.getAvailableProviders().filter(p => p !== 'openrouter'); // Exclude OpenRouter to avoid duplicate requests

    const promises = targetProviders.map(provider =>
      this.chat(messages, { ...options, provider })
        .then(response => ({ provider, response, success: true }))
        .catch(error => ({ provider, error: error.message, success: false }))
    );

    const results = await Promise.all(promises);

    return {
      responses: results.filter(r => r.success),
      errors: results.filter(r => !r.success),
      summary: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    };
  }

  /**
   * Fallback chat with automatic provider retry
   * @param {Array|String} messages - Chat messages
   * @param {Object} options - Options
   * @returns {Promise<Object>} Response from first successful provider
   */
  async chatWithFallback(messages, options = {}) {
    const providers = options.providers || this.providerPriority.filter(p => this.connectors[p]);

    let lastError;

    for (const provider of providers) {
      try {
        const response = await this.chat(messages, { ...options, provider });

        // Mark if fallback was used
        if (provider !== providers[0]) {
          response.fallbackUsed = true;
          response.primaryProvider = providers[0];
          response.actualProvider = provider;
        }

        return response;
      } catch (error) {
        lastError = error;
        this.emit('fallback:attempt', {
          provider,
          error: error.message,
          nextProvider: providers[providers.indexOf(provider) + 1]
        });
        continue;
      }
    }

    throw new Error(`All providers failed. Last error: ${lastError.message}`);
  }

  // ============================================================================
  // PROVIDER INTELLIGENCE (Sprint 2.7)
  // ============================================================================

  /**
   * Smart chat with intelligent provider selection
   * @param {Array|String} messages - Chat messages
   * @param {Object} options - Options with strategy (balanced, cost, speed, quality, reliability)
   * @returns {Promise<Object>} Response from intelligently selected provider
   */
  async smartChat(messages, options = {}) {
    const availableProviders = this.getAvailableProviders().filter(p => p !== 'openrouter');

    if (availableProviders.length === 0) {
      throw new Error('No providers available for smart chat');
    }

    // Use intelligence engine to select best provider
    const selectedProvider = this.intelligenceEngine.selectProvider(
      availableProviders,
      {
        strategy: options.strategy,
        requirements: options.requirements || {}
      }
    );

    // Execute chat with selected provider
    const startTime = Date.now();

    try {
      const response = await this.chat(messages, {
        ...options,
        provider: selectedProvider
      });

      // Mark as smart selected
      response.smartSelected = true;
      response.selectedProvider = selectedProvider;
      response.selectionStrategy = options.strategy || 'balanced';

      return response;

    } catch (error) {
      // If selected provider fails, fallback to chatWithFallback
      this.emit('smart:fallback', {
        selectedProvider,
        error: error.message
      });

      return this.chatWithFallback(messages, options);
    }
  }

  /**
   * Smart streaming with intelligent provider selection
   * @param {Array|String} messages - Chat messages
   * @param {Object} options - Options with strategy
   * @returns {AsyncIterator} Stream from intelligently selected provider
   */
  async smartStream(messages, options = {}) {
    const availableProviders = this.getAvailableProviders().filter(p => p !== 'openrouter');

    if (availableProviders.length === 0) {
      throw new Error('No providers available for smart streaming');
    }

    // Use intelligence engine to select best provider
    const selectedProvider = this.intelligenceEngine.selectProvider(
      availableProviders,
      {
        strategy: options.strategy,
        requirements: options.requirements || {}
      }
    );

    // Execute stream with selected provider
    return this.stream(messages, {
      ...options,
      provider: selectedProvider
    });
  }

  /**
   * Get consensus response from multiple providers
   * @param {Array|String} messages - Chat messages
   * @param {Array} providers - List of providers (defaults to all except OpenRouter)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Consensus response with confidence and alternatives
   */
  async consensusChat(messages, providers = [], options = {}) {
    // Get responses from multiple providers
    const multiResponse = await this.multiProviderChat(messages, providers, options);

    if (multiResponse.responses.length === 0) {
      throw new Error('No successful responses for consensus');
    }

    // Convert to format expected by consensus engine
    const formattedResponses = multiResponse.responses.map(r => ({
      provider: r.provider,
      content: r.response.content,
      model: r.response.model,
      usage: r.response.usage
    }));

    // Find consensus
    const consensus = this.intelligenceEngine.findConsensus(formattedResponses);

    return {
      consensus: consensus.consensus,
      confidence: consensus.confidence,
      agreement: consensus.agreement,
      alternatives: consensus.alternatives,
      summary: multiResponse.summary
    };
  }

  /**
   * Get provider rankings based on performance
   * @param {Array} providers - Providers to rank (defaults to all)
   * @returns {Array} Ranked providers with scores
   */
  getProviderRankings(providers = null) {
    const targetProviders = providers || this.getAvailableProviders();
    return this.intelligenceEngine.getProviderRankings(targetProviders);
  }

  /**
   * Compare two providers
   * @param {String} provider1 - First provider
   * @param {String} provider2 - Second provider
   * @returns {Object} Comparison results
   */
  compareProviders(provider1, provider2) {
    return this.intelligenceEngine.compareProviders(provider1, provider2);
  }

  /**
   * Get provider performance statistics
   * @returns {Object} Performance stats for all providers
   */
  getProviderStats() {
    return this.intelligenceEngine.getAllStats();
  }

  /**
   * Reset provider performance statistics
   * @param {String} provider - Optional specific provider to reset
   */
  resetProviderStats(provider = null) {
    this.intelligenceEngine.resetStats(provider);
  }

  // ============================================================================
  // PROVIDER MANAGEMENT
  // ============================================================================

  /**
   * Get specific connector
   * @param {String} name - Provider name
   * @returns {BaseAIConnector} Connector instance
   */
  getConnector(name) {
    return this.connectors[name];
  }

  /**
   * Get all available providers
   * @returns {Array} List of provider names
   */
  getAvailableProviders() {
    return Object.keys(this.connectors);
  }

  /**
   * Get default provider based on priority
   * @returns {String} Provider name
   */
  getDefaultProvider() {
    for (const provider of this.providerPriority) {
      if (this.connectors[provider]) {
        return provider;
      }
    }

    throw new Error('No AI provider available');
  }

  /**
   * Get default embedding provider
   * @returns {String} Provider name
   */
  getDefaultEmbeddingProvider() {
    // OpenRouter and OpenAI have best embedding support
    if (this.connectors.openrouter) return 'openrouter';
    if (this.connectors.openai) return 'openai';
    if (this.connectors.google) return 'google';

    throw new Error('No embedding provider available');
  }

  /**
   * Check if provider is available
   * @param {String} provider - Provider name
   * @returns {Boolean}
   */
  isProviderAvailable(provider) {
    return !!this.connectors[provider];
  }

  /**
   * Get provider capabilities
   * @param {String} provider - Provider name
   * @returns {Object} Capabilities
   */
  getProviderCapabilities(provider) {
    const connector = this.connectors[provider];

    if (!connector) {
      return null;
    }

    return connector.getCapabilities ? connector.getCapabilities() : {};
  }

  // ============================================================================
  // USAGE & MONITORING
  // ============================================================================

  /**
   * Get comprehensive usage statistics
   * @returns {Object} Usage stats for all providers
   */
  getUsageStats() {
    const stats = {
      global: { ...this.globalUsage },
      byProvider: {}
    };

    // Get provider-specific stats from connectors
    for (const [name, connector] of Object.entries(this.connectors)) {
      if (connector.getUsage) {
        stats.byProvider[name] = connector.getUsage();
      }
    }

    // Calculate averages
    stats.global.avgCostPerRequest = stats.global.requests > 0
      ? stats.global.totalCost / stats.global.requests
      : 0;

    stats.global.avgTokensPerRequest = stats.global.requests > 0
      ? (stats.global.totalInputTokens + stats.global.totalOutputTokens) / stats.global.requests
      : 0;

    return stats;
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats() {
    this.globalUsage = {
      requests: 0,
      errors: 0,
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      byProvider: {}
    };

    // Reset provider-specific stats
    for (const connector of Object.values(this.connectors)) {
      if (connector.resetUsage) {
        connector.resetUsage();
      }
    }

    this.emit('usage:reset');
  }

  /**
   * Get provider health status
   * @returns {Object} Health status for all providers
   */
  async getHealthStatus() {
    const health = {
      healthy: true,
      providers: {}
    };

    for (const [name, connector] of Object.entries(this.connectors)) {
      if (connector.getStatus) {
        const status = connector.getStatus();
        health.providers[name] = status;

        if (!status.healthy) {
          health.healthy = false;
        }
      }
    }

    return health;
  }

  /**
   * Validate all configured API keys
   * @returns {Promise<Object>} Validation results
   */
  async validateAllKeys() {
    const results = {};

    for (const [name, connector] of Object.entries(this.connectors)) {
      if (connector.validateApiKey) {
        try {
          results[name] = await connector.validateApiKey();
        } catch (error) {
          results[name] = { valid: false, error: error.message };
        }
      } else {
        results[name] = { valid: true, message: 'No validation available' };
      }
    }

    return results;
  }

  // ============================================================================
  // LIFECYCLE MANAGEMENT
  // ============================================================================

  /**
   * Cleanup all connectors
   */
  async cleanup() {
    for (const connector of Object.values(this.connectors)) {
      if (connector.cleanup) {
        await connector.cleanup();
      }
    }

    this.connectors = {};
    this.initialized = false;
    this.emit('cleanup');
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AIIntegrationManager;
