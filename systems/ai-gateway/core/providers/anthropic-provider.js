const https = require('https');
const { EventEmitter } = require('events');

class AnthropicProvider extends EventEmitter {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseURL = config.baseURL || 'https://api.anthropic.com';
    this.version = config.version || '2023-06-01';
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.models = new Map();

    // Rate limiting
    this.rateLimits = {
      requestsPerMinute: config.requestsPerMinute || 50,
      tokensPerMinute: config.tokensPerMinute || 100000,
      requestsPerDay: config.requestsPerDay || 5000
    };

    this.usage = {
      requests: [],
      tokens: [],
      daily: { requests: 0, tokens: 0, cost: 0 }
    };

    this.initializeModels();
  }

  initializeModels() {
    // Claude 3 Models
    this.models.set('claude-3-opus-20240229', {
      id: 'claude-3-opus-20240229',
      contextLength: 200000,
      pricing: { prompt: 0.015, completion: 0.075 }, // per 1K tokens
      capabilities: ['chat', 'completion', 'vision', 'tool_use'],
      tier: 'premium',
      description: 'Most capable model for complex tasks'
    });

    this.models.set('claude-3-sonnet-20240229', {
      id: 'claude-3-sonnet-20240229',
      contextLength: 200000,
      pricing: { prompt: 0.003, completion: 0.015 },
      capabilities: ['chat', 'completion', 'vision', 'tool_use'],
      tier: 'standard',
      description: 'Balanced performance and cost'
    });

    this.models.set('claude-3-haiku-20240307', {
      id: 'claude-3-haiku-20240307',
      contextLength: 200000,
      pricing: { prompt: 0.00025, completion: 0.00125 },
      capabilities: ['chat', 'completion', 'vision'],
      tier: 'economy',
      description: 'Fast and cost-effective'
    });

    // Claude 3.5 Models (Current)
    this.models.set('claude-sonnet-4-5-20250929', {
      id: 'claude-sonnet-4-5-20250929',
      contextLength: 200000,
      pricing: { prompt: 0.003, completion: 0.015 },
      capabilities: ['chat', 'completion', 'vision', 'tool_use'],
      tier: 'standard',
      description: 'Latest Claude 3.5 Sonnet - best for most tasks'
    });

    this.models.set('claude-3-5-haiku-20241022', {
      id: 'claude-3-5-haiku-20241022',
      contextLength: 200000,
      pricing: { prompt: 0.001, completion: 0.005 },
      capabilities: ['chat', 'completion', 'vision', 'tool_use'],
      tier: 'economy',
      description: 'Latest Claude 3.5 Haiku - fast and efficient'
    });

    // Claude 2 Models (Legacy)
    this.models.set('claude-2.1', {
      id: 'claude-2.1',
      contextLength: 200000,
      pricing: { prompt: 0.008, completion: 0.024 },
      capabilities: ['chat', 'completion'],
      tier: 'legacy',
      description: 'Previous generation model'
    });

    this.models.set('claude-instant-1.2', {
      id: 'claude-instant-1.2',
      contextLength: 100000,
      pricing: { prompt: 0.00163, completion: 0.00551 },
      capabilities: ['chat', 'completion'],
      tier: 'legacy',
      description: 'Fast legacy model'
    });
  }

  async chat(messages, options = {}) {
    const model = options.model || 'claude-sonnet-4-5-20250929';
    const modelConfig = this.models.get(model);

    if (!modelConfig) {
      throw new Error(`Model ${model} not supported`);
    }

    // Check rate limits
    if (!this.checkRateLimits()) {
      throw new Error('Rate limit exceeded. Please wait before making another request.');
    }

    // Convert messages to Anthropic format
    const { system, convertedMessages } = this.convertMessages(messages);

    const requestBody = {
      model,
      messages: convertedMessages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1,
      top_k: options.topK,
      stream: options.stream ?? false,
      metadata: options.metadata
    };

    // Add system prompt if provided
    if (system || options.systemPrompt) {
      requestBody.system = system || options.systemPrompt;
    }

    // Add stop sequences if provided
    if (options.stop) {
      requestBody.stop_sequences = Array.isArray(options.stop) ? options.stop : [options.stop];
    }

    // Add tool definitions if provided
    if (options.tools) {
      requestBody.tools = options.tools;
      requestBody.tool_choice = options.toolChoice || { type: 'auto' };
    }

    try {
      const response = await this.makeRequest('/v1/messages', requestBody);

      // Track usage
      this.trackUsage(response.usage, modelConfig.pricing);

      // Emit completion event
      this.emit('completion', {
        model,
        usage: response.usage,
        response: response.content[0],
        requestId: response.id
      });

      // Format response similar to OpenAI for compatibility
      return {
        content: response.content[0].text,
        role: response.role,
        toolUse: response.content[0].tool_use,
        usage: response.usage,
        model: response.model,
        id: response.id,
        stopReason: response.stop_reason
      };
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async streamChat(messages, options = {}, onChunk) {
    const model = options.model || 'claude-sonnet-4-5-20250929';
    options.stream = true;

    const { system, convertedMessages } = this.convertMessages(messages);

    const requestBody = {
      model,
      messages: convertedMessages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      stream: true
    };

    if (system || options.systemPrompt) {
      requestBody.system = system || options.systemPrompt;
    }

    return new Promise((resolve, reject) => {
      const chunks = [];
      let fullContent = '';
      let currentEvent = null;

      this.makeStreamRequest('/v1/messages', requestBody, (chunk) => {
        // Parse SSE data
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);

            try {
              const parsed = JSON.parse(data);

              switch (currentEvent) {
                case 'message_start':
                  // Initial message metadata
                  break;

                case 'content_block_start':
                  // Content block started
                  break;

                case 'content_block_delta':
                  // Streaming text delta
                  if (parsed.delta && parsed.delta.text) {
                    fullContent += parsed.delta.text;
                    chunks.push(parsed.delta.text);

                    if (onChunk) {
                      onChunk(parsed.delta.text, parsed);
                    }
                  }
                  break;

                case 'content_block_stop':
                  // Content block finished
                  break;

                case 'message_delta':
                  // Message metadata updates
                  break;

                case 'message_stop':
                  // Stream complete
                  resolve({
                    content: fullContent,
                    chunks,
                    model
                  });
                  return;

                case 'error':
                  reject(new Error(parsed.error?.message || 'Stream error'));
                  return;
              }
            } catch (error) {
              console.error('Error parsing stream chunk:', error);
            }
          }
        }
      }).catch(reject);
    });
  }

  async vision(imageData, prompt, options = {}) {
    const model = options.model || 'claude-sonnet-4-5-20250929';
    const modelConfig = this.models.get(model);

    if (!modelConfig || !modelConfig.capabilities.includes('vision')) {
      throw new Error(`Model ${model} does not support vision`);
    }

    const messages = [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: imageData.startsWith('data:') ? 'base64' : 'url',
            media_type: this.getMediaType(imageData),
            data: imageData.startsWith('data:') ? imageData.split(',')[1] : imageData
          }
        },
        {
          type: 'text',
          text: prompt
        }
      ]
    }];

    return this.chat(messages, options);
  }

  async toolUse(messages, tools, options = {}) {
    const model = options.model || 'claude-sonnet-4-5-20250929';
    const modelConfig = this.models.get(model);

    if (!modelConfig || !modelConfig.capabilities.includes('tool_use')) {
      throw new Error(`Model ${model} does not support tool use`);
    }

    const enhancedOptions = {
      ...options,
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters || tool.input_schema
      })),
      toolChoice: options.toolChoice || { type: 'auto' }
    };

    const response = await this.chat(messages, enhancedOptions);

    // Parse tool calls from response
    if (response.toolUse) {
      return {
        ...response,
        toolCalls: response.toolUse.map(call => ({
          id: call.id,
          name: call.name,
          arguments: call.input
        }))
      };
    }

    return response;
  }

  convertMessages(messages) {
    let system = null;
    const convertedMessages = [];

    for (const message of messages) {
      if (message.role === 'system') {
        // Anthropic uses a separate system parameter
        system = message.content;
      } else if (message.role === 'user' || message.role === 'assistant') {
        // Handle multi-modal content
        if (Array.isArray(message.content)) {
          convertedMessages.push({
            role: message.role,
            content: message.content
          });
        } else {
          convertedMessages.push({
            role: message.role,
            content: message.content
          });
        }
      } else if (message.role === 'function' || message.role === 'tool') {
        // Convert function/tool results to user messages
        convertedMessages.push({
          role: 'user',
          content: `Tool result: ${message.content}`
        });
      }
    }

    return { system, convertedMessages };
  }

  async makeRequest(endpoint, body, retries = 0) {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const url = new URL(this.baseURL + endpoint);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': this.version,
        'x-api-key': this.apiKey,
        'User-Agent': 'BUMBA-CLI/1.0'
      },
      timeout: this.timeout
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error('Invalid JSON response'));
            }
          } else {
            const error = this.parseError(res.statusCode, data);

            // Retry on rate limit or server errors
            if ((res.statusCode === 429 || res.statusCode >= 500) && retries < this.maxRetries) {
              const delay = this.getRetryDelay(retries, res.headers);
              setTimeout(() => {
                this.makeRequest(endpoint, body, retries + 1)
                  .then(resolve)
                  .catch(reject);
              }, delay);
            } else {
              reject(error);
            }
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(JSON.stringify(body));
      req.end();
    });
  }

  async makeStreamRequest(endpoint, body, onChunk) {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const url = new URL(this.baseURL + endpoint);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': this.version,
        'x-api-key': this.apiKey,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'User-Agent': 'BUMBA-CLI/1.0'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errorData = '';
          res.on('data', chunk => errorData += chunk);
          res.on('end', () => {
            reject(this.parseError(res.statusCode, errorData));
          });
          return;
        }

        res.on('data', (chunk) => {
          onChunk(chunk.toString());
        });

        res.on('end', resolve);
      });

      req.on('error', reject);
      req.write(JSON.stringify(body));
      req.end();
    });
  }

  checkRateLimits() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;

    // Clean old entries
    this.usage.requests = this.usage.requests.filter(t => t > oneMinuteAgo);
    this.usage.tokens = this.usage.tokens.filter(t => t.time > oneMinuteAgo);

    // Check per-minute limits
    if (this.usage.requests.length >= this.rateLimits.requestsPerMinute) {
      return false;
    }

    const recentTokens = this.usage.tokens.reduce((sum, t) => sum + t.count, 0);
    if (recentTokens >= this.rateLimits.tokensPerMinute) {
      return false;
    }

    // Check daily limits
    if (this.usage.daily.requests >= this.rateLimits.requestsPerDay) {
      // Reset if new day
      const lastReset = this.usage.daily.lastReset || 0;
      if (now - lastReset > 86400000) {
        this.usage.daily = { requests: 0, tokens: 0, cost: 0, lastReset: now };
      } else {
        return false;
      }
    }

    return true;
  }

  trackUsage(usage, pricing) {
    if (!usage) return;

    const now = Date.now();

    // Track request
    this.usage.requests.push(now);
    this.usage.daily.requests++;

    // Track tokens
    if (usage.input_tokens) {
      this.usage.tokens.push({ time: now, count: usage.input_tokens });
      this.usage.daily.tokens += usage.input_tokens;
    }

    if (usage.output_tokens) {
      this.usage.tokens.push({ time: now, count: usage.output_tokens });
      this.usage.daily.tokens += usage.output_tokens;
    }

    // Calculate cost
    if (pricing) {
      let cost = 0;

      if (pricing.prompt && usage.input_tokens) {
        cost += (usage.input_tokens / 1000) * pricing.prompt;
      }

      if (pricing.completion && usage.output_tokens) {
        cost += (usage.output_tokens / 1000) * pricing.completion;
      }

      this.usage.daily.cost += cost;

      // Emit usage event
      this.emit('usage', {
        tokens: usage,
        cost,
        daily: this.usage.daily
      });
    }
  }

  parseError(statusCode, data) {
    let message = `Anthropic API error: ${statusCode}`;
    let errorData = {};

    try {
      errorData = JSON.parse(data);
      if (errorData.error) {
        message = errorData.error.message || errorData.error.type || message;
      }
    } catch (e) {
      message += ` - ${data}`;
    }

    const error = new Error(message);
    error.statusCode = statusCode;
    error.data = errorData;

    // Add specific error types
    switch (statusCode) {
      case 400:
        error.type = 'InvalidRequestError';
        break;
      case 401:
        error.type = 'AuthenticationError';
        break;
      case 403:
        error.type = 'PermissionError';
        break;
      case 404:
        error.type = 'NotFoundError';
        break;
      case 429:
        error.type = 'RateLimitError';
        error.retryAfter = errorData.error?.retry_after;
        break;
      case 500:
      case 502:
      case 503:
        error.type = 'ServerError';
        break;
      case 504:
        error.type = 'OverloadedError';
        break;
      default:
        error.type = 'UnknownError';
    }

    return error;
  }

  getRetryDelay(retries, headers) {
    // Check for Retry-After header
    if (headers && headers['retry-after']) {
      const retryAfter = parseInt(headers['retry-after']);
      if (!isNaN(retryAfter)) {
        return retryAfter * 1000;
      }
    }

    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, retries), 60000);
    const jitter = Math.random() * baseDelay * 0.1;
    return baseDelay + jitter;
  }

  handleError(error) {
    this.emit('error', {
      provider: 'anthropic',
      error,
      timestamp: Date.now()
    });

    // Log specific error types
    if (error.type === 'RateLimitError') {
      console.error('Anthropic rate limit exceeded. Consider upgrading your plan or reducing request frequency.');
    } else if (error.type === 'AuthenticationError') {
      console.error('Anthropic authentication failed. Check your API key.');
    } else if (error.type === 'OverloadedError') {
      console.error('Anthropic API is overloaded. Please retry after a brief wait.');
    }
  }

  getMediaType(imageData) {
    if (imageData.startsWith('data:')) {
      const match = imageData.match(/^data:([^;]+);/);
      return match ? match[1] : 'image/jpeg';
    }

    const extension = imageData.split('.').pop().toLowerCase();
    const types = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp'
    };

    return types[extension] || 'image/jpeg';
  }

  async testConnection() {
    try {
      const response = await this.chat(
        [{ role: 'user', content: 'Hello' }],
        { model: 'claude-3-haiku-20240307', maxTokens: 5 }
      );
      return { success: true, response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getModelInfo(modelId) {
    return this.models.get(modelId);
  }

  listModels() {
    return Array.from(this.models.entries()).map(([id, config]) => ({
      id,
      ...config
    }));
  }

  getUsageStats() {
    return {
      current: {
        requestsPerMinute: this.usage.requests.length,
        tokensPerMinute: this.usage.tokens.reduce((sum, t) => sum + t.count, 0)
      },
      daily: this.usage.daily,
      limits: this.rateLimits
    };
  }
}

module.exports = { AnthropicProvider };