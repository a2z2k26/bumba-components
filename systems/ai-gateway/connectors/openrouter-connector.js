/**
 * OpenRouter API Connector for BUMBA
 * Sprint 2.2: Unified gateway to 100+ AI models
 * Provides access to GPT-4, Claude, Gemini, LLaMA, Mistral, and more through a single API
 */

const BaseAIConnector = require('./base-connector');

class OpenRouterConnector extends BaseAIConnector {
  constructor(options = {}) {
    super({
      ...options,
      provider: 'openrouter',
      baseURL: options.baseURL || 'https://openrouter.ai/api/v1',
      requestsPerMinute: options.requestsPerMinute || 200 // OpenRouter default
    });

    this.options = {
      ...this.options,
      apiKey: options.apiKey || process.env.OPENROUTER_API_KEY,
      httpReferer: options.httpReferer || process.env.OPENROUTER_HTTP_REFERER || 'https://bumba.dev',
      appName: options.appName || process.env.OPENROUTER_APP_NAME || 'BUMBA',
      includeGenerationCost: options.includeGenerationCost !== false
    };

    // Validate API key
    if (!this.options.apiKey) {
      throw new Error('OpenRouter API key is required');
    }

    // OpenRouter uses OpenAI-compatible format
    this.format = 'openai';

    // Rate limiting (credit-based)
    this.rateLimits.credits = {
      limit: options.creditsPerDay || 10000,
      window: 86400000, // 24 hours
      current: 0,
      lastReset: Date.now()
    };

    // Enhanced usage tracking (includes credits)
    this.usage.totalCredits = 0;
    this.usage.byModel = {};

    // Provider capabilities
    this.capabilities = {
      chat: true,
      stream: true,
      embed: true, // Via text-embedding models
      tools: true,
      vision: true, // Via GPT-4V, Claude, Gemini
      imageGeneration: false, // Not through OpenRouter
      audio: false,
      tts: false,
      tokenCounting: false,
      modelRouting: true, // Unique to OpenRouter
      fallback: true, // Unique to OpenRouter
      costOptimization: true // Unique to OpenRouter
    };

    // Routing strategies
    this.routingStrategies = {
      CHEAPEST: 'cost',
      FASTEST: 'latency',
      BEST: 'quality',
      FALLBACK: 'fallback'
    };

    // Model registry (populated from API)
    this.modelRegistry = null;
    this.modelRegistryLastFetch = 0;
    this.modelRegistryCacheDuration = 3600000; // 1 hour

    // Popular model aliases for easy access
    this.modelAliases = {
      'gpt-4': 'openai/gpt-4-turbo',
      'gpt-3.5': 'openai/gpt-3.5-turbo',
      'claude-opus': 'anthropic/claude-3-opus',
      'claude-sonnet': 'anthropic/claude-3-sonnet',
      'claude-haiku': 'anthropic/claude-3-haiku',
      'gemini-pro': 'google/gemini-pro-1.5',
      'gemini-flash': 'google/gemini-flash-1.5',
      'llama-70b': 'meta-llama/llama-3-70b-instruct',
      'mixtral': 'mistralai/mixtral-8x7b-instruct'
    };
  }

  // ============================================================================
  // REQUIRED METHODS - BaseAIConnector interface
  // ============================================================================

  /**
   * Unified chat interface (OpenAI-compatible)
   * @param {Array|String} messages - Chat messages or single prompt
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} Response in unified format
   */
  async chat(messages, options = {}) {
    const normalizedMessages = this.normalizeMessages(messages);
    const model = this.resolveModelAlias(options.model || 'anthropic/claude-3-sonnet');

    const body = {
      model,
      messages: normalizedMessages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stop,
      stream: false
    };

    // Add OpenRouter-specific options
    if (options.transforms) {
      body.transforms = options.transforms;
    }

    if (options.route) {
      body.route = options.route;
    }

    if (options.models && options.route === 'fallback') {
      body.models = options.models;
    }

    // Add tool/function calling if specified
    if (options.tools) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice || 'auto';
    }

    if (options.functions) {
      body.functions = options.functions;
      body.function_call = options.functionCall || 'auto';
    }

    const startTime = Date.now();
    const response = await this.makeRequest('/chat/completions', {
      method: 'POST',
      body,
      model
    });
    const latency = Date.now() - startTime;

    // Emit completion event
    this.emit('completion', {
      provider: this.provider,
      model: response.model,
      messages: normalizedMessages.length,
      response: response.choices[0].message
    });

    // Return unified format
    return this.formatUnifiedResponse(response, { model, latency });
  }

  /**
   * Streaming chat interface
   * @param {Array|String} messages - Chat messages or single prompt
   * @param {Object} options - Configuration options
   * @returns {AsyncIterator} Stream of response chunks
   */
  async stream(messages, options = {}) {
    const normalizedMessages = this.normalizeMessages(messages);
    const model = this.resolveModelAlias(options.model || 'anthropic/claude-3-sonnet');

    const body = {
      model,
      messages: normalizedMessages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      stream: true
    };

    // Add OpenRouter-specific options
    if (options.transforms) {
      body.transforms = options.transforms;
    }

    if (options.route) {
      body.route = options.route;
    }

    // Add tool/function calling if specified
    if (options.tools) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice || 'auto';
    }

    return this.streamChatCompletion(body);
  }

  /**
   * Create embeddings
   * @param {String|Array} text - Text to embed
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} Embedding vectors
   */
  async embed(text, options = {}) {
    const model = options.model || 'openai/text-embedding-3-small';
    const input = Array.isArray(text) ? text : [text];

    const body = {
      model,
      input,
      encoding_format: options.encodingFormat || 'float'
    };

    const response = await this.makeRequest('/embeddings', {
      method: 'POST',
      body,
      model
    });

    this.emit('embedding', {
      provider: this.provider,
      model,
      inputCount: input.length
    });

    return response;
  }

  /**
   * Tool/function calling
   * @param {Array} messages - Chat messages
   * @param {Array} tools - Tool definitions
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response with tool calls
   */
  async callTool(messages, tools, options = {}) {
    return this.chat(messages, {
      ...options,
      tools,
      toolChoice: options.toolChoice || 'auto'
    });
  }

  /**
   * Validate API key
   * @returns {Promise<Object>} Validation result
   */
  async validateApiKey() {
    try {
      const models = await this.getAvailableModels();
      return {
        valid: true,
        modelCount: models.length,
        sampleModels: models.slice(0, 5).map(m => m.id)
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // OPENROUTER-SPECIFIC METHODS
  // ============================================================================

  /**
   * Smart provider routing
   * @param {Array} messages - Chat messages
   * @param {String} strategy - Routing strategy (CHEAPEST, FASTEST, BEST, FALLBACK)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response
   */
  async routeToProvider(messages, strategy = 'BEST', options = {}) {
    let model;
    let route;

    switch (strategy) {
      case 'CHEAPEST':
        model = await this.getCheapestModel(messages, options);
        break;

      case 'FASTEST':
        model = await this.getFastestModel(options);
        break;

      case 'BEST':
        model = await this.getBestModel(options);
        break;

      case 'FALLBACK':
        model = options.primaryModel || 'anthropic/claude-3-sonnet';
        route = 'fallback';
        break;

      default:
        model = options.model || 'anthropic/claude-3-sonnet';
    }

    return this.chat(messages, {
      ...options,
      model,
      route
    });
  }

  /**
   * Get cheapest model for a given request
   * @param {Array} messages - Messages to estimate tokens
   * @param {Object} options - Filters (minContextLength, capabilities)
   * @returns {Promise<String>} Model ID
   */
  async getCheapestModel(messages, options = {}) {
    const models = await this.getAvailableModels();
    const tokenCount = this.estimateTokens(messages);

    // Filter models by requirements
    let candidates = models.filter(m => {
      if (options.minContextLength && m.context_length < options.minContextLength) {
        return false;
      }
      if (options.requiresVision && !m.supports_vision) {
        return false;
      }
      if (options.requiresTools && !m.supports_function_calling) {
        return false;
      }
      return true;
    });

    // Calculate costs
    const costs = candidates.map(model => {
      const promptCost = (tokenCount * model.pricing.prompt) / 1000000;
      const completionCost = ((options.maxTokens || 500) * model.pricing.completion) / 1000000;
      const totalCost = promptCost + completionCost;

      return {
        model: model.id,
        cost: totalCost,
        pricing: model.pricing
      };
    });

    // Sort by cost
    costs.sort((a, b) => a.cost - b.cost);

    return costs[0]?.model || 'anthropic/claude-3-haiku'; // Fallback to cheapest known model
  }

  /**
   * Get fastest model
   * @param {Object} options - Filters
   * @returns {Promise<String>} Model ID
   */
  async getFastestModel(options = {}) {
    // Fast models: Haiku, Gemini Flash, GPT-3.5
    const fastModels = [
      'anthropic/claude-3-haiku',
      'google/gemini-flash-1.5',
      'openai/gpt-3.5-turbo'
    ];

    // Filter by requirements
    if (options.requiresVision) {
      return 'google/gemini-flash-1.5'; // Fast + vision
    }

    if (options.minContextLength > 100000) {
      return 'google/gemini-flash-1.5'; // Fast + large context
    }

    return fastModels[0];
  }

  /**
   * Get best quality model
   * @param {Object} options - Filters
   * @returns {Promise<String>} Model ID
   */
  async getBestModel(options = {}) {
    // Best models: Claude Opus, GPT-4, Gemini Pro
    const bestModels = [
      'anthropic/claude-3-opus',
      'openai/gpt-4-turbo',
      'google/gemini-pro-1.5'
    ];

    // Filter by requirements
    if (options.requiresVision) {
      return 'anthropic/claude-3-opus'; // Best + vision
    }

    if (options.minContextLength > 100000) {
      return 'google/gemini-pro-1.5'; // Best + large context
    }

    return bestModels[0];
  }

  /**
   * Get available models from OpenRouter
   * @returns {Promise<Array>} Model list
   */
  async getAvailableModels() {
    const now = Date.now();

    // Return cached registry if still valid
    if (this.modelRegistry && (now - this.modelRegistryLastFetch < this.modelRegistryCacheDuration)) {
      return this.modelRegistry;
    }

    // Fetch fresh model list
    const response = await this.makeRequest('/models', {
      method: 'GET'
    });

    this.modelRegistry = response.data || [];
    this.modelRegistryLastFetch = now;

    return this.modelRegistry;
  }

  /**
   * Get model details including pricing
   * @param {String} modelId - Model identifier
   * @returns {Promise<Object>} Model details
   */
  async getModelDetails(modelId) {
    const models = await this.getAvailableModels();
    return models.find(m => m.id === modelId);
  }

  /**
   * Get real-time pricing for a model
   * @param {String} modelId - Model identifier
   * @returns {Promise<Object>} Pricing information
   */
  async getModelPricing(modelId) {
    const model = await this.getModelDetails(modelId);
    return model?.pricing || null;
  }

  /**
   * Calculate estimated cost for a request
   * @param {Array} messages - Messages
   * @param {String} modelId - Model to use
   * @param {Object} options - Additional options
   * @returns {Promise<Number>} Estimated cost in USD
   */
  async estimateRequestCost(messages, modelId, options = {}) {
    const model = await this.getModelDetails(modelId);
    if (!model || !model.pricing) {
      return 0;
    }

    const tokenCount = this.estimateTokens(messages);
    const maxTokens = options.maxTokens || 500;

    const promptCost = (tokenCount * model.pricing.prompt) / 1000000;
    const completionCost = (maxTokens * model.pricing.completion) / 1000000;

    return promptCost + completionCost;
  }

  /**
   * Get generation statistics
   * @param {String} generationId - Generation ID from response
   * @returns {Promise<Object>} Generation stats
   */
  async getGenerationStats(generationId) {
    const response = await this.makeRequest(`/generation?id=${generationId}`, {
      method: 'GET'
    });

    return response.data;
  }

  // ============================================================================
  // STREAMING IMPLEMENTATION
  // ============================================================================

  /**
   * Stream chat completion
   * @param {Object} body - Request body
   * @returns {AsyncIterator} Stream iterator
   */
  async streamChatCompletion(body) {
    const url = `${this.options.baseURL}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Stream request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return {
      async *[Symbol.asyncIterator]() {
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);

                if (data === '[DONE]') {
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  yield parsed;
                } catch {
                  // Invalid JSON, skip
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get authentication headers
   * @param {Object} additionalHeaders - Additional headers
   * @returns {Object} Headers object
   */
  getHeaders(additionalHeaders = {}) {
    return {
      'Authorization': `Bearer ${this.options.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': this.options.httpReferer,
      'X-Title': this.options.appName,
      ...additionalHeaders
    };
  }

  /**
   * Track OpenRouter-specific usage
   * @param {Object} usage - Usage data
   * @param {String} model - Model used
   */
  trackUsage(usage, model) {
    // Call base tracking
    super.trackUsage(usage, model);

    // Track OpenRouter-specific metrics
    if (usage.native_tokens_prompt && usage.native_tokens_completion) {
      const credits = usage.native_tokens_prompt + usage.native_tokens_completion;
      this.usage.totalCredits += credits;
    }

    // Track by model
    if (!this.usage.byModel[model]) {
      this.usage.byModel[model] = {
        requests: 0,
        tokens: 0,
        cost: 0
      };
    }

    this.usage.byModel[model].requests++;
    this.usage.byModel[model].tokens += usage.total_tokens || 0;

    // Actual cost from OpenRouter (if provided)
    if (this.options.includeGenerationCost && usage.cost) {
      this.usage.byModel[model].cost += usage.cost;
    }
  }

  /**
   * Resolve model alias to full model ID
   * @param {String} model - Model name or alias
   * @returns {String} Full model ID
   */
  resolveModelAlias(model) {
    return this.modelAliases[model] || model;
  }

  /**
   * Estimate token count for messages
   * Rough estimation: ~4 chars per token
   * @param {Array} messages - Messages to estimate
   * @returns {Number} Estimated token count
   */
  estimateTokens(messages) {
    const normalizedMessages = this.normalizeMessages(messages);
    const text = normalizedMessages.map(m => m.content).join(' ');
    return Math.ceil(text.length / 4);
  }

  /**
   * Format response in unified format
   * @param {Object} rawResponse - Raw OpenRouter response
   * @param {Object} options - Format options
   * @returns {Object} Unified response format
   */
  formatUnifiedResponse(rawResponse, options = {}) {
    const choice = rawResponse.choices?.[0];
    const message = choice?.message;

    return {
      provider: this.provider,
      model: rawResponse.model,
      content: message?.content || '',
      usage: {
        inputTokens: rawResponse.usage?.prompt_tokens || 0,
        outputTokens: rawResponse.usage?.completion_tokens || 0,
        totalTokens: rawResponse.usage?.total_tokens || 0,
        cost: rawResponse.usage?.cost || 0,
        nativeInputTokens: rawResponse.usage?.native_tokens_prompt || 0,
        nativeOutputTokens: rawResponse.usage?.native_tokens_completion || 0
      },
      toolCalls: message?.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
      })) || [],
      finishReason: choice?.finish_reason || 'stop',
      timestamp: new Date().toISOString(),
      latency: options.latency || 0,
      generationId: rawResponse.id,
      raw: rawResponse
    };
  }

  /**
   * Get enhanced usage statistics
   * @returns {Object} Usage stats with OpenRouter-specific metrics
   */
  getUsage() {
    const baseUsage = super.getUsage();

    return {
      ...baseUsage,
      totalCredits: this.usage.totalCredits,
      byModel: this.usage.byModel,
      modelCount: Object.keys(this.usage.byModel).length
    };
  }
}

module.exports = OpenRouterConnector;
