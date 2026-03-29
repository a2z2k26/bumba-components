/**
 * Base AI Connector for BUMBA
 * Sprint 2.2: Foundation class for all AI provider connectors
 * Enforces consistent interface and provides common functionality
 */

const EventEmitter = require('events');

class BaseAIConnector extends EventEmitter {
  constructor(options = {}) {
    super();

    // Provider identification
    this.provider = options.provider || 'unknown';

    // API configuration
    this.options = {
      apiKey: options.apiKey || '',
      baseURL: options.baseURL || '',
      timeout: options.timeout || 30000,
      maxRetries: options.maxRetries || 3,
      ...options
    };

    // Rate limiting state
    this.rateLimits = {
      requests: {
        limit: options.requestsPerMinute || 60,
        window: 60000, // 1 minute
        current: 0,
        lastReset: Date.now()
      },
      tokens: {
        limit: options.tokensPerMinute || 100000,
        window: 60000,
        current: 0,
        lastReset: Date.now()
      }
    };

    // Usage tracking
    this.usage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      requests: 0,
      errors: 0,
      startTime: Date.now()
    };

    // Model registry (to be populated by subclasses)
    this.models = {};

    // Request history (last 100 requests for debugging)
    this.requestHistory = [];
    this.maxHistorySize = 100;
  }

  // ============================================================================
  // REQUIRED METHODS - Must be implemented by all connectors
  // ============================================================================

  /**
   * Unified chat interface
   * @param {Array|String} messages - Chat messages or single prompt
   * @param {Object} options - Model, temperature, maxTokens, etc.
   * @returns {Promise<Object>} Response with unified format
   */
  async chat(messages, options = {}) {
    throw new Error(`${this.provider}: chat() must be implemented by subclass`);
  }

  /**
   * Streaming chat interface
   * @param {Array|String} messages - Chat messages or single prompt
   * @param {Object} options - Model, temperature, maxTokens, etc.
   * @returns {AsyncIterator} Stream of response chunks
   */
  async stream(messages, options = {}) {
    throw new Error(`${this.provider}: stream() must be implemented by subclass`);
  }

  /**
   * Create embeddings
   * @param {String|Array} text - Text to embed
   * @param {Object} options - Model, dimensions, etc.
   * @returns {Promise<Object>} Embedding vectors
   */
  async embed(text, options = {}) {
    throw new Error(`${this.provider}: embed() not supported`);
  }

  /**
   * Tool/function calling
   * @param {Array} messages - Chat messages
   * @param {Array} tools - Tool definitions
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response with tool calls
   */
  async callTool(messages, tools, options = {}) {
    throw new Error(`${this.provider}: callTool() not supported`);
  }

  // ============================================================================
  // OPTIONAL METHODS - Provider-specific capabilities
  // ============================================================================

  /**
   * Generate images (OpenAI DALL-E only)
   */
  async generateImage(prompt, options = {}) {
    throw new Error(`${this.provider}: Image generation not supported`);
  }

  /**
   * Analyze images (Anthropic, Google, OpenAI GPT-4V)
   */
  async analyzeImage(image, prompt, options = {}) {
    throw new Error(`${this.provider}: Image analysis not supported`);
  }

  /**
   * Transcribe audio (OpenAI Whisper only)
   */
  async transcribeAudio(audio, options = {}) {
    throw new Error(`${this.provider}: Audio transcription not supported`);
  }

  /**
   * Text-to-speech (OpenAI TTS only)
   */
  async createSpeech(text, options = {}) {
    throw new Error(`${this.provider}: Text-to-speech not supported`);
  }

  /**
   * Count tokens before making request
   */
  async countTokens(text, options = {}) {
    throw new Error(`${this.provider}: Token counting not supported`);
  }

  // ============================================================================
  // LIFECYCLE METHODS - Consistent across all providers
  // ============================================================================

  /**
   * Validate API key
   * @returns {Promise<Object>} { valid: boolean, error?: string }
   */
  async validateApiKey() {
    throw new Error(`${this.provider}: validateApiKey() must be implemented by subclass`);
  }

  /**
   * Get usage statistics
   * @returns {Object} Usage metrics
   */
  getUsage() {
    const uptime = Date.now() - this.usage.startTime;
    const requestsPerSecond = this.usage.requests / (uptime / 1000);
    const avgCostPerRequest = this.usage.requests > 0 ? this.usage.totalCost / this.usage.requests : 0;

    return {
      ...this.usage,
      provider: this.provider,
      uptime,
      requestsPerSecond: requestsPerSecond.toFixed(2),
      avgCostPerRequest: avgCostPerRequest.toFixed(6),
      rateLimits: {
        requests: {
          current: this.rateLimits.requests.current,
          limit: this.rateLimits.requests.limit,
          remaining: Math.max(0, this.rateLimits.requests.limit - this.rateLimits.requests.current)
        },
        tokens: {
          current: this.rateLimits.tokens.current,
          limit: this.rateLimits.tokens.limit,
          remaining: Math.max(0, this.rateLimits.tokens.limit - this.rateLimits.tokens.current)
        }
      }
    };
  }

  /**
   * Reset usage statistics
   */
  resetUsage() {
    this.usage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      requests: 0,
      errors: 0,
      startTime: Date.now()
    };

    this.emit('usage:reset', { provider: this.provider });
  }

  /**
   * Get available models
   * @returns {Array} List of model IDs
   */
  getAvailableModels() {
    return Object.keys(this.models);
  }

  /**
   * Get model information
   * @param {String} modelId - Model identifier
   * @returns {Object} Model details
   */
  getModelInfo(modelId) {
    return this.models[modelId] || null;
  }

  /**
   * Get provider capabilities
   * @returns {Object} Capability flags
   */
  getCapabilities() {
    return {
      chat: true,
      stream: true,
      embed: false,
      tools: false,
      vision: false,
      imageGeneration: false,
      audio: false,
      tts: false,
      tokenCounting: false,
      ...this.capabilities
    };
  }

  /**
   * Get provider status
   * @returns {Object} Status information
   */
  getStatus() {
    const usage = this.getUsage();
    const capabilities = this.getCapabilities();

    return {
      provider: this.provider,
      healthy: this.usage.errors < 10, // Consider unhealthy if 10+ consecutive errors
      apiKeyValid: !!this.options.apiKey,
      capabilities,
      usage,
      lastError: this.lastError || null,
      lastRequest: this.requestHistory[this.requestHistory.length - 1] || null
    };
  }

  // ============================================================================
  // INTERNAL METHODS - Shared utilities
  // ============================================================================

  /**
   * Make authenticated API request with retry logic
   * @param {String} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.options.baseURL}${endpoint}`;
    const method = options.method || 'POST';

    // Check rate limits
    await this.checkRateLimits();

    let lastError;
    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        // Prepare headers
        const headers = this.getHeaders(options.headers || {});

        // Make request
        const response = await fetch(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(this.options.timeout)
        });

        const latency = Date.now() - startTime;

        // Update rate limits from headers
        this.updateRateLimits(response.headers);

        // Handle errors
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));

          // Record request in history
          this.recordRequest({
            endpoint,
            method,
            status: response.status,
            success: false,
            latency,
            error: error.error?.message || `HTTP ${response.status}`,
            attempt: attempt + 1
          });

          // Rate limit - retry with exponential backoff
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') || String(Math.pow(2, attempt)));
            await this.delay(retryAfter * 1000);
            continue;
          }

          // Server errors - retry with exponential backoff
          if (response.status >= 500) {
            if (attempt < this.options.maxRetries - 1) {
              await this.delay(Math.pow(2, attempt) * 1000);
              continue;
            }
          }

          // Client errors - don't retry
          const errorMessage = error.error?.message || error.message || `API error: ${response.status}`;
          throw new Error(errorMessage);
        }

        // Success - parse response
        const data = await response.json();

        // Record successful request
        this.recordRequest({
          endpoint,
          method,
          status: response.status,
          success: true,
          latency,
          attempt: attempt + 1
        });

        // Track usage if provided in response
        if (data.usage) {
          this.trackUsage(data.usage, options.body?.model || options.model);
        }

        // Increment request counter
        this.usage.requests++;

        // Emit request event
        this.emit('request', {
          provider: this.provider,
          endpoint,
          success: true,
          latency
        });

        return data;

      } catch (error) {
        lastError = error;
        this.usage.errors++;
        this.lastError = {
          message: error.message,
          timestamp: new Date().toISOString()
        };

        // Emit error event
        this.emit('error', {
          provider: this.provider,
          endpoint,
          error: error.message,
          attempt: attempt + 1
        });

        // Retry with exponential backoff
        if (attempt < this.options.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError;
  }

  /**
   * Get authentication headers
   * Must be implemented by subclass
   */
  getHeaders(additionalHeaders = {}) {
    throw new Error(`${this.provider}: getHeaders() must be implemented by subclass`);
  }

  /**
   * Check rate limits before making request
   */
  async checkRateLimits() {
    const now = Date.now();

    // Reset request counter if window has passed
    if (now - this.rateLimits.requests.lastReset > this.rateLimits.requests.window) {
      this.rateLimits.requests.current = 0;
      this.rateLimits.requests.lastReset = now;
    }

    // Reset token counter if window has passed
    if (now - this.rateLimits.tokens.lastReset > this.rateLimits.tokens.window) {
      this.rateLimits.tokens.current = 0;
      this.rateLimits.tokens.lastReset = now;
    }

    // Check if at request limit
    if (this.rateLimits.requests.current >= this.rateLimits.requests.limit) {
      const waitTime = this.rateLimits.requests.window - (now - this.rateLimits.requests.lastReset);

      this.emit('ratelimit:wait', {
        provider: this.provider,
        type: 'requests',
        waitTime
      });

      await this.delay(waitTime);
      this.rateLimits.requests.current = 0;
      this.rateLimits.requests.lastReset = Date.now();
    }

    // Increment request counter
    this.rateLimits.requests.current++;
  }

  /**
   * Update rate limits from response headers
   * Can be overridden by subclasses for provider-specific headers
   */
  updateRateLimits(headers) {
    // Default implementation - override in subclasses
  }

  /**
   * Track usage and costs
   * @param {Object} usage - Usage data from API response
   * @param {String} model - Model used
   */
  trackUsage(usage, model) {
    // Update token counts
    const inputTokens = usage.input_tokens || usage.prompt_tokens || usage.promptTokenCount || 0;
    const outputTokens = usage.output_tokens || usage.completion_tokens || usage.candidatesTokenCount || 0;
    const totalTokens = usage.total_tokens || usage.totalTokenCount || (inputTokens + outputTokens);

    this.usage.totalInputTokens += inputTokens;
    this.usage.totalOutputTokens += outputTokens;
    this.usage.totalTokens += totalTokens;

    // Calculate cost if model pricing is available
    if (model && this.models[model]) {
      const cost = this.calculateCost(usage, model);
      this.usage.totalCost += cost;
    }

    // Emit usage event
    this.emit('usage', {
      provider: this.provider,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      cost: this.usage.totalCost,
      requests: this.usage.requests
    });
  }

  /**
   * Calculate cost for a request
   * Can be overridden by subclasses for provider-specific pricing
   * @param {Object} usage - Usage data
   * @param {String} model - Model used
   * @returns {Number} Cost in USD
   */
  calculateCost(usage, model) {
    if (!this.models[model] || !this.models[model].costPer1k) {
      return 0;
    }

    const costs = this.models[model].costPer1k;
    const inputTokens = usage.input_tokens || usage.prompt_tokens || usage.promptTokenCount || 0;
    const outputTokens = usage.output_tokens || usage.completion_tokens || usage.candidatesTokenCount || 0;

    const inputCost = (inputTokens / 1000) * costs.input;
    const outputCost = (outputTokens / 1000) * costs.output;

    return inputCost + outputCost;
  }

  /**
   * Record request in history
   */
  recordRequest(request) {
    this.requestHistory.push({
      ...request,
      timestamp: new Date().toISOString()
    });

    // Keep only last N requests
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory.shift();
    }
  }

  /**
   * Get request history
   */
  getRequestHistory(limit = 10) {
    return this.requestHistory.slice(-limit);
  }

  /**
   * Delay helper for retries
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Normalize messages to array format
   */
  normalizeMessages(messages) {
    if (typeof messages === 'string') {
      return [{ role: 'user', content: messages }];
    }

    if (!Array.isArray(messages)) {
      return [messages];
    }

    return messages;
  }

  /**
   * Format response in unified format
   */
  formatUnifiedResponse(rawResponse, options = {}) {
    return {
      provider: this.provider,
      model: options.model || 'unknown',
      content: rawResponse.content || rawResponse.text || '',
      usage: {
        inputTokens: rawResponse.usage?.input_tokens || 0,
        outputTokens: rawResponse.usage?.output_tokens || 0,
        totalTokens: rawResponse.usage?.total_tokens || 0,
        cost: 0 // Calculated separately
      },
      toolCalls: rawResponse.toolCalls || [],
      finishReason: rawResponse.finish_reason || rawResponse.stop_reason || 'stop',
      timestamp: new Date().toISOString(),
      latency: options.latency || 0,
      raw: rawResponse
    };
  }
}

module.exports = BaseAIConnector;
