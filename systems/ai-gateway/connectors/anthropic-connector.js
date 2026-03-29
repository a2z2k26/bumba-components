/**
 * Anthropic API Connector for BUMBA
 * Handles all interactions with Anthropic's Claude API
 */

const EventEmitter = require('events');

class AnthropicConnector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: options.baseURL || 'https://api.anthropic.com',
      apiVersion: options.apiVersion || '2023-06-01',
      timeout: options.timeout || 60000,
      maxRetries: options.maxRetries || 3,
      beta: options.beta || [],
      ...options
    };
    
    // Validate API key
    if (!this.options.apiKey) {
      throw new Error('Anthropic API key is required');
    }
    
    // Rate limiting
    this.rateLimits = {
      requests: { limit: 50, window: 60000, current: 0, lastReset: Date.now() },
      tokens: { limit: 100000, window: 60000, current: 0, lastReset: Date.now() }
    };
    
    // Usage tracking
    this.usage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      requests: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0
    };
    
    // Model configurations with pricing
    this.models = {
      'claude-3-opus-20240229': {
        maxTokens: 200000,
        costPer1M: { input: 15, output: 75 },
        cacheCostPer1M: { write: 18.75, read: 0.15 }
      },
      'claude-3-sonnet-20240229': {
        maxTokens: 200000,
        costPer1M: { input: 3, output: 15 },
        cacheCostPer1M: { write: 3.75, read: 0.03 }
      },
      'claude-3-haiku-20240307': {
        maxTokens: 200000,
        costPer1M: { input: 0.25, output: 1.25 },
        cacheCostPer1M: { write: 0.30, read: 0.03 }
      },
      'claude-sonnet-4-5-20250929': {
        maxTokens: 200000,
        costPer1M: { input: 3, output: 15 },
        cacheCostPer1M: { write: 3.75, read: 0.03 }
      },
      'claude-3-5-haiku-20241022': {
        maxTokens: 200000,
        costPer1M: { input: 1, output: 5 },
        cacheCostPer1M: { write: 1.25, read: 0.01 }
      },
      'claude-2.1': {
        maxTokens: 200000,
        costPer1M: { input: 8, output: 24 }
      },
      'claude-2.0': {
        maxTokens: 100000,
        costPer1M: { input: 8, output: 24 }
      },
      'claude-instant-1.2': {
        maxTokens: 100000,
        costPer1M: { input: 0.8, output: 2.4 }
      }
    };
  }

  /**
   * Make authenticated request to Anthropic API
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.options.baseURL}${endpoint}`;
    
    const headers = {
      'x-api-key': this.options.apiKey,
      'anthropic-version': this.options.apiVersion,
      'content-type': 'application/json',
      ...options.headers
    };
    
    // Add beta headers if specified
    if (this.options.beta.length > 0) {
      headers['anthropic-beta'] = this.options.beta.join(',');
    }
    
    // Check rate limits
    await this.checkRateLimits();
    
    let lastError;
    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: options.method || 'POST',
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(this.options.timeout)
        });
        
        // Update rate limit info
        this.updateRateLimits(response.headers);
        
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          
          if (response.status === 429) {
            // Rate limited
            const retryAfter = parseInt(response.headers.get('retry-after') || '5');
            await this.delay(retryAfter * 1000);
            continue;
          }
          
          if (response.status === 529) {
            // Overloaded
            await this.delay(Math.pow(2, attempt) * 1000);
            continue;
          }
          
          throw new Error(error.error?.message || `API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Track usage
        if (data.usage) {
          this.trackUsage(data.usage, options.body?.model);
        }
        
        return data;
        
      } catch (error) {
        lastError = error;
        
        if (attempt < this.options.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Create a message (main chat completion method)
   */
  async createMessage(messages, options = {}) {
    // Convert messages to Anthropic format if needed
    const anthropicMessages = this.convertMessages(messages);
    
    const body = {
      model: options.model || 'claude-3-sonnet-20240229',
      messages: anthropicMessages,
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature ?? 1,
      top_p: options.topP ?? 1,
      top_k: options.topK,
      stop_sequences: options.stopSequences,
      stream: options.stream || false,
      metadata: options.metadata
    };
    
    // Add system prompt if provided
    if (options.system) {
      body.system = options.system;
    }
    
    // Add tools if provided
    if (options.tools) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice;
    }
    
    if (body.stream) {
      return this.streamMessage(body);
    }
    
    const response = await this.makeRequest('/v1/messages', {
      method: 'POST',
      body
    });
    
    this.emit('message', {
      model: body.model,
      messages: messages.length,
      response: response.content
    });
    
    return response;
  }

  /**
   * Stream message response
   */
  async streamMessage(body) {
    const url = `${this.options.baseURL}/v1/messages`;
    
    const headers = {
      'x-api-key': this.options.apiKey,
      'anthropic-version': this.options.apiVersion,
      'content-type': 'application/json'
    };
    
    if (this.options.beta.length > 0) {
      headers['anthropic-beta'] = this.options.beta.join(',');
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
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
      }
    };
  }

  /**
   * Create message with prompt caching
   */
  async createCachedMessage(messages, options = {}) {
    // Enable prompt caching beta
    const originalBeta = this.options.beta;
    this.options.beta = [...new Set([...this.options.beta, 'prompt-caching-2024-07-31'])];
    
    try {
      // Mark cacheable content
      const cachedMessages = this.markCacheableContent(messages, options.cacheBreakpoints);
      
      const response = await this.createMessage(cachedMessages, options);
      
      return response;
    } finally {
      this.options.beta = originalBeta;
    }
  }

  /**
   * Create message batch
   */
  async createMessageBatch(requests, options = {}) {
    const batchRequests = requests.map((req, index) => ({
      custom_id: req.id || `request-${index}`,
      params: {
        model: req.model || options.model || 'claude-3-sonnet-20240229',
        messages: this.convertMessages(req.messages),
        max_tokens: req.maxTokens || options.maxTokens || 1024,
        temperature: req.temperature ?? options.temperature ?? 1,
        system: req.system || options.system,
        tools: req.tools || options.tools
      }
    }));
    
    const response = await this.makeRequest('/v1/messages/batch', {
      method: 'POST',
      body: {
        requests: batchRequests
      }
    });
    
    return response;
  }

  /**
   * Count tokens in text
   */
  async countTokens(text, options = {}) {
    const body = {
      model: options.model || 'claude-3-sonnet-20240229',
      messages: [
        {
          role: 'user',
          content: text
        }
      ]
    };
    
    const response = await this.makeRequest('/v1/messages/count_tokens', {
      method: 'POST',
      body
    });
    
    return response;
  }

  /**
   * Convert messages to Anthropic format
   */
  convertMessages(messages) {
    // Handle different message formats
    if (typeof messages === 'string') {
      return [{ role: 'user', content: messages }];
    }
    
    if (!Array.isArray(messages)) {
      return [messages];
    }
    
    return messages.map(msg => {
      // Already in Anthropic format
      if (msg.role && msg.content) {
        return msg;
      }
      
      // OpenAI format conversion
      if (msg.role === 'system') {
        // System messages are handled separately in Anthropic
        return null;
      }
      
      if (msg.role === 'assistant' && msg.function_call) {
        // Convert function calls to tool use
        return {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: msg.function_call.id || 'tool-1',
              name: msg.function_call.name,
              input: JSON.parse(msg.function_call.arguments || '{}')
            }
          ]
        };
      }
      
      if (msg.role === 'function') {
        // Convert function results to tool results
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.tool_call_id || 'tool-1',
              content: msg.content
            }
          ]
        };
      }
      
      // Standard message
      return {
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      };
    }).filter(Boolean);
  }

  /**
   * Mark cacheable content for prompt caching
   */
  markCacheableContent(messages, breakpoints = []) {
    return messages.map((msg, index) => {
      if (breakpoints.includes(index) && msg.content && typeof msg.content === 'string') {
        return {
          ...msg,
          content: [
            {
              type: 'text',
              text: msg.content,
              cache_control: { type: 'ephemeral' }
            }
          ]
        };
      }
      return msg;
    });
  }

  /**
   * Computer use capability
   */
  async computerUse(instructions, options = {}) {
    // Enable computer use beta
    const originalBeta = this.options.beta;
    this.options.beta = [...new Set([...this.options.beta, 'computer-use-2024-10-22'])];
    
    try {
      const tools = [
        {
          type: 'computer_20241022',
          name: 'computer',
          display_width_px: options.displayWidth || 1920,
          display_height_px: options.displayHeight || 1080,
          display_number: options.displayNumber || 0
        }
      ];
      
      const response = await this.createMessage(
        [{ role: 'user', content: instructions }],
        {
          ...options,
          tools,
          tool_choice: { type: 'any' }
        }
      );
      
      return response;
    } finally {
      this.options.beta = originalBeta;
    }
  }

  /**
   * PDF understanding capability
   */
  async analyzePDF(pdfBase64, query, options = {}) {
    // Enable PDF support beta
    const originalBeta = this.options.beta;
    this.options.beta = [...new Set([...this.options.beta, 'pdfs-2024-09-25'])];
    
    try {
      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64
              }
            },
            {
              type: 'text',
              text: query
            }
          ]
        }
      ];
      
      const response = await this.createMessage(messages, options);
      
      return response;
    } finally {
      this.options.beta = originalBeta;
    }
  }

  /**
   * Vision capability
   */
  async analyzeImage(imageData, query, options = {}) {
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageData.mediaType || 'image/jpeg',
              data: imageData.base64 || imageData
            }
          },
          {
            type: 'text',
            text: query
          }
        ]
      }
    ];
    
    const response = await this.createMessage(messages, options);
    
    return response;
  }

  /**
   * Function calling / Tool use
   */
  async callFunction(messages, tools, options = {}) {
    const response = await this.createMessage(messages, {
      ...options,
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters || tool.input_schema
      })),
      tool_choice: options.toolChoice || { type: 'auto' }
    });
    
    // Extract tool calls from response
    const toolCalls = [];
    if (response.content) {
      for (const content of response.content) {
        if (content.type === 'tool_use') {
          toolCalls.push({
            id: content.id,
            name: content.name,
            arguments: content.input
          });
        }
      }
    }
    
    return {
      ...response,
      toolCalls
    };
  }

  /**
   * Legacy completion API (for Claude 2 and earlier)
   */
  async complete(prompt, options = {}) {
    const body = {
      model: options.model || 'claude-2.1',
      prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
      max_tokens_to_sample: options.maxTokens || 1024,
      temperature: options.temperature ?? 1,
      top_p: options.topP ?? 1,
      top_k: options.topK,
      stop_sequences: options.stopSequences || ['\n\nHuman:'],
      stream: options.stream || false
    };
    
    const response = await this.makeRequest('/v1/complete', {
      method: 'POST',
      body
    });
    
    return response;
  }

  /**
   * Check rate limits
   */
  async checkRateLimits() {
    const now = Date.now();
    
    // Reset counters if window has passed
    if (now - this.rateLimits.requests.lastReset > this.rateLimits.requests.window) {
      this.rateLimits.requests.current = 0;
      this.rateLimits.requests.lastReset = now;
    }
    
    if (now - this.rateLimits.tokens.lastReset > this.rateLimits.tokens.window) {
      this.rateLimits.tokens.current = 0;
      this.rateLimits.tokens.lastReset = now;
    }
    
    // Check if at limit
    if (this.rateLimits.requests.current >= this.rateLimits.requests.limit) {
      const waitTime = this.rateLimits.requests.window - (now - this.rateLimits.requests.lastReset);
      await this.delay(waitTime);
      this.rateLimits.requests.current = 0;
      this.rateLimits.requests.lastReset = Date.now();
    }
    
    this.rateLimits.requests.current++;
  }

  /**
   * Update rate limits from response headers
   */
  updateRateLimits(headers) {
    const requestsLimit = headers.get('anthropic-ratelimit-requests-limit');
    const requestsRemaining = headers.get('anthropic-ratelimit-requests-remaining');
    const requestsReset = headers.get('anthropic-ratelimit-requests-reset');
    const tokensLimit = headers.get('anthropic-ratelimit-tokens-limit');
    const tokensRemaining = headers.get('anthropic-ratelimit-tokens-remaining');
    const tokensReset = headers.get('anthropic-ratelimit-tokens-reset');
    
    if (requestsLimit) {
      this.rateLimits.requests.limit = parseInt(requestsLimit);
    }
    
    if (requestsRemaining) {
      this.rateLimits.requests.current = this.rateLimits.requests.limit - parseInt(requestsRemaining);
    }
    
    if (requestsReset) {
      this.rateLimits.requests.resetAt = new Date(requestsReset).getTime();
    }
    
    if (tokensLimit) {
      this.rateLimits.tokens.limit = parseInt(tokensLimit);
    }
    
    if (tokensRemaining) {
      this.rateLimits.tokens.current = this.rateLimits.tokens.limit - parseInt(tokensRemaining);
    }
    
    if (tokensReset) {
      this.rateLimits.tokens.resetAt = new Date(tokensReset).getTime();
    }
  }

  /**
   * Track usage and costs
   */
  trackUsage(usage, model) {
    this.usage.totalInputTokens += usage.input_tokens || 0;
    this.usage.totalOutputTokens += usage.output_tokens || 0;
    this.usage.requests++;
    
    // Track cache usage if present
    if (usage.cache_creation_input_tokens) {
      this.usage.cacheCreationInputTokens += usage.cache_creation_input_tokens;
    }
    
    if (usage.cache_read_input_tokens) {
      this.usage.cacheReadInputTokens += usage.cache_read_input_tokens;
    }
    
    // Calculate costs
    if (model && this.models[model]) {
      const costs = this.models[model].costPer1M;
      const inputCost = (usage.input_tokens || 0) * costs.input / 1000000;
      const outputCost = (usage.output_tokens || 0) * costs.output / 1000000;
      
      // Add cache costs if applicable
      let cacheCost = 0;
      if (this.models[model].cacheCostPer1M) {
        const cacheWrite = (usage.cache_creation_input_tokens || 0) * 
                          this.models[model].cacheCostPer1M.write / 1000000;
        const cacheRead = (usage.cache_read_input_tokens || 0) * 
                         this.models[model].cacheCostPer1M.read / 1000000;
        cacheCost = cacheWrite + cacheRead;
      }
      
      this.usage.totalCost += inputCost + outputCost + cacheCost;
    }
    
    this.emit('usage', {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cost: this.usage.totalCost,
      requests: this.usage.requests
    });
  }

  /**
   * Get usage statistics
   */
  getUsage() {
    return {
      ...this.usage,
      rateLimits: this.rateLimits
    };
  }

  /**
   * Reset usage statistics
   */
  resetUsage() {
    this.usage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      requests: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0
    };
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate API key
   */
  async validateApiKey() {
    try {
      const response = await this.createMessage(
        [{ role: 'user', content: 'Hi' }],
        { maxTokens: 1 }
      );
      
      return {
        valid: true,
        model: response.model
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return Object.keys(this.models);
  }

  /**
   * Get model info
   */
  getModelInfo(modelId) {
    return this.models[modelId] || null;
  }
}

module.exports = AnthropicConnector;